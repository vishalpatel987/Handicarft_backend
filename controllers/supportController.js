const SupportQuery = require('../models/SupportQuery');
const SupportTicket = require('../models/SupportTicket');
const NotificationService = require('../services/notificationService');
const nodemailer = require('nodemailer');

// Socket.IO instance (will be set by the main app)
let io = null;

// Function to set socket instance
const setSocketInstance = (socketInstance) => {
  io = socketInstance;
  console.log('Socket instance set in support controller:', !!io);
};

// Setup nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ==================== SUPPORT QUERIES ====================

// Create a new support query
const createSupportQuery = async (req, res) => {
  try {
    const {
      customerName,
      customerEmail,
      customerPhone,
      userId,
      subject,
      message,
      category,
      priority,
      orderId,
      productId
    } = req.body;

    // Get user information from JWT token if available
    let finalCustomerName = customerName;
    let finalCustomerEmail = customerEmail;
    let finalCustomerPhone = customerPhone;
    let finalUserId = userId;

    if (req.user && req.user.id) {
      // User is authenticated, use token information
      finalCustomerName = customerName || req.user.username || req.user.name || 'Authenticated User';
      finalCustomerEmail = customerEmail || req.user.email || '';
      finalCustomerPhone = customerPhone || req.user.phone || '';
      finalUserId = userId || req.user.id;
    }

    // Validation
    if (!finalCustomerName || !finalCustomerEmail || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'Customer name, email, subject, and message are required'
      });
    }

    // Create new query
    const newQuery = new SupportQuery({
      customerName: finalCustomerName,
      customerEmail: finalCustomerEmail,
      customerPhone: finalCustomerPhone,
      userId: finalUserId,
      subject,
      message,
      category: category || 'general',
      priority: priority || 'medium',
      orderId,
      productId,
      responses: [{
        message,
        sender: 'customer',
        senderName: finalCustomerName,
        senderEmail: finalCustomerEmail,
        createdAt: new Date()
      }]
    });

    const savedQuery = await newQuery.save();

    // Send confirmation email to customer
    await sendQueryConfirmationEmail(savedQuery);

    // Send notification email to admin
    await sendAdminQueryNotification(savedQuery);

    // Emit socket event to notify admin about new query
    if (io) {
      console.log('Emitting new_query_created to admin_room');
      console.log('Query data being emitted:', {
        _id: savedQuery._id,
        subject: savedQuery.subject,
        status: savedQuery.status,
        customerName: savedQuery.customerName
      });
      try {
        io.to('admin_room').emit('new_query_created', {
          query: savedQuery,
          timestamp: new Date()
        });
        console.log('Successfully emitted new_query_created to admin_room');
      } catch (error) {
        console.error('Error emitting new_query_created:', error);
      }
    } else {
      console.log('Cannot emit new_query_created - io not available');
    }

    res.status(201).json({
      success: true,
      message: 'Support query submitted successfully',
      query: savedQuery
    });

  } catch (error) {
    console.error('Error creating support query:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create support query',
      error: error.message
    });
  }
};

// Get all support queries (Admin only) or user-specific queries
const getAllSupportQueries = async (req, res) => {
  try {
    const {
      status,
      category,
      priority,
      page = 1,
      limit = 10
    } = req.query;

    // Build filter object
    const filter = {};
    
    // If user is not admin, only show their own queries
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      filter.userId = req.user.id;
    }
    
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    if (category && category !== 'all') {
      filter.category = category;
    }
    
    if (priority && priority !== 'all') {
      filter.priority = priority;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get queries with pagination
    const queries = await SupportQuery.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await SupportQuery.countDocuments(filter);

    res.json({
      success: true,
      queries,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total
      }
    });

  } catch (error) {
    console.error('Error fetching support queries:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch support queries',
      error: error.message
    });
  }
};

// Get support query by ID
const getSupportQueryById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = await SupportQuery.findById(id);

    if (!query) {
      return res.status(404).json({
        success: false,
        message: 'Support query not found'
      });
    }

    res.json({
      success: true,
      query
    });

  } catch (error) {
    console.error('Error fetching support query:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch support query',
      error: error.message
    });
  }
};

// Add response to support query
const addQueryResponse = async (req, res) => {
  try {
    const { id } = req.params;
    const { message, sender, senderName, senderEmail } = req.body;

    if (!message || !sender) {
      return res.status(400).json({
        success: false,
        message: 'Message and sender are required'
      });
    }

    const query = await SupportQuery.findById(id);

    if (!query) {
      return res.status(404).json({
        success: false,
        message: 'Support query not found'
      });
    }

    const responseData = {
      message,
      sender,
      senderName: senderName || (sender === 'admin' ? 'Admin' : 'Customer'),
      senderEmail: senderEmail || '',
      createdAt: new Date()
    };

    query.responses.push(responseData);
    await query.save();

    // Emit socket event to notify user about new response
    if (io && query.userId) {
      console.log('Emitting query_response_added to user:', query.userId);
      try {
        io.to(`user_${query.userId}`).emit('query_response_added', {
          queryId: query._id,
          userId: query.userId,
          response: responseData,
          timestamp: new Date()
        });
        console.log('Successfully emitted query_response_added to user:', query.userId);
      } catch (error) {
        console.error('Error emitting query_response_added:', error);
      }
    } else {
      console.log('Cannot emit query_response_added - io:', !!io, 'userId:', query.userId);
    }

    // Emit socket event to notify admin about new user response
    if (io && sender === 'customer') {
      console.log('Emitting user_query_response_added to admin_room');
      try {
        io.to('admin_room').emit('user_query_response_added', {
          queryId: query._id,
          userId: query.userId,
          response: responseData,
          query: {
            _id: query._id,
            subject: query.subject,
            customerName: query.customerName,
            customerEmail: query.customerEmail,
            status: query.status
          },
          timestamp: new Date()
        });
        console.log('Successfully emitted user_query_response_added to admin_room');
      } catch (error) {
        console.error('Error emitting user_query_response_added:', error);
      }
    } else {
      console.log('Cannot emit user_query_response_added - io:', !!io, 'sender:', sender);
    }

    res.json({
      success: true,
      message: 'Response added successfully',
      response: responseData
    });

  } catch (error) {
    console.error('Error adding query response:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add response',
      error: error.message
    });
  }
};

// Update support query status
const updateQueryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    const query = await SupportQuery.findById(id);

    if (!query) {
      return res.status(404).json({
        success: false,
        message: 'Support query not found'
      });
    }

    query.status = status;
    await query.save();

    // Emit socket event to notify user about status change
    if (io && query.userId) {
      console.log('Emitting query_status_updated to user:', query.userId);
      try {
        io.to(`user_${query.userId}`).emit('query_status_updated', {
          queryId: query._id,
          userId: query.userId,
          status: status,
          timestamp: new Date()
        });
        console.log('Successfully emitted query_status_updated to user:', query.userId);
      } catch (error) {
        console.error('Error emitting query_status_updated:', error);
      }
    }

    res.json({
      success: true,
      message: 'Query status updated successfully',
      query
    });

  } catch (error) {
    console.error('Error updating query status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update query status',
      error: error.message
    });
  }
};

// ==================== SUPPORT TICKETS ====================

// Create a new support ticket
const createSupportTicket = async (req, res) => {
  try {
    const {
      title,
      description,
      customerName,
      customerEmail,
      customerPhone,
      userId,
      category,
      priority,
      orderId,
      productId
    } = req.body;

    // Get user information from JWT token if available
    let finalCustomerName = customerName;
    let finalCustomerEmail = customerEmail;
    let finalCustomerPhone = customerPhone;
    let finalUserId = userId;

    if (req.user && req.user.id) {
      // User is authenticated, use token information
      finalCustomerName = customerName || req.user.username || req.user.name || 'Authenticated User';
      finalCustomerEmail = customerEmail || req.user.email || '';
      finalCustomerPhone = customerPhone || req.user.phone || '';
      finalUserId = userId || req.user.id;
    }

    // Validation
    if (!title || !description || !finalCustomerName || !finalCustomerEmail) {
      return res.status(400).json({
        success: false,
        message: 'Title, description, customer name, and email are required'
      });
    }

    // Generate ticket number
    const ticketNumber = SupportTicket.generateTicketNumber();

    // Create new ticket
    const newTicket = new SupportTicket({
      ticketNumber,
      title,
      description,
      customerName: finalCustomerName,
      customerEmail: finalCustomerEmail,
      customerPhone: finalCustomerPhone,
      userId: finalUserId,
      category: category || 'general',
      priority: priority || 'medium',
      orderId,
      productId,
      messages: [{
        message: description,
        sender: 'customer',
        senderName: finalCustomerName,
        senderEmail: finalCustomerEmail,
        createdAt: new Date()
      }]
    });

    const savedTicket = await newTicket.save();

    // Send confirmation email to customer
    await sendTicketConfirmationEmail(savedTicket);

    // Send notification email to admin
    await sendAdminTicketNotification(savedTicket);

    // Emit socket event to notify admin about new ticket
    if (io) {
      console.log('Emitting new_ticket_created to admin_room');
      console.log('Ticket data being emitted:', {
        _id: savedTicket._id,
        title: savedTicket.title,
        status: savedTicket.status,
        customerName: savedTicket.customerName
      });
      try {
        io.to('admin_room').emit('new_ticket_created', {
          ticket: savedTicket,
          timestamp: new Date()
        });
        console.log('Successfully emitted new_ticket_created to admin_room');
      } catch (error) {
        console.error('Error emitting new_ticket_created:', error);
      }
    } else {
      console.log('Cannot emit new_ticket_created - io not available');
    }

    res.status(201).json({
      success: true,
      message: 'Support ticket created successfully',
      ticket: savedTicket
    });

  } catch (error) {
    console.error('Error creating support ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create support ticket',
      error: error.message
    });
  }
};

// Get all support tickets (Admin only) or user-specific tickets
const getAllSupportTickets = async (req, res) => {
  try {
    const {
      status,
      category,
      priority,
      page = 1,
      limit = 10
    } = req.query;

    // Build filter object
    const filter = {};
    
    // If user is not admin, only show their own tickets
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      filter.userId = req.user.id;
    }
    
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    if (category && category !== 'all') {
      filter.category = category;
    }
    
    if (priority && priority !== 'all') {
      filter.priority = priority;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get tickets with pagination
    const tickets = await SupportTicket.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await SupportTicket.countDocuments(filter);

    res.json({
      success: true,
      tickets,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total
      }
    });

  } catch (error) {
    console.error('Error fetching support tickets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch support tickets',
      error: error.message
    });
  }
};

// Get support ticket by ID
const getSupportTicketById = async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await SupportTicket.findById(id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Support ticket not found'
      });
    }

    res.json({
      success: true,
      ticket
    });

  } catch (error) {
    console.error('Error fetching support ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch support ticket',
      error: error.message
    });
  }
};

// Add message to support ticket
const addTicketMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { message, sender, senderName, senderEmail } = req.body;

    if (!message || !sender) {
      return res.status(400).json({
        success: false,
        message: 'Message and sender are required'
      });
    }

    const ticket = await SupportTicket.findById(id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Support ticket not found'
      });
    }

    const messageData = {
      message,
      sender,
      senderName: senderName || (sender === 'admin' ? 'Admin' : 'Customer'),
      senderEmail: senderEmail || '',
      createdAt: new Date()
    };

    ticket.messages.push(messageData);
    await ticket.save();

    // Emit socket event to notify user about new message
    if (io && ticket.userId) {
      console.log('Emitting ticket_message_added to user:', ticket.userId);
      try {
        io.to(`user_${ticket.userId}`).emit('ticket_message_added', {
          ticketId: ticket._id,
          userId: ticket.userId,
          message: messageData,
          timestamp: new Date()
        });
        console.log('Successfully emitted ticket_message_added to user:', ticket.userId);
  } catch (error) {
        console.error('Error emitting ticket_message_added:', error);
      }
    } else {
      console.log('Cannot emit ticket_message_added - io:', !!io, 'userId:', ticket.userId);
    }

    // Emit socket event to notify admin about new user message
    if (io && sender === 'customer') {
      console.log('Emitting user_ticket_message_added to admin_room');
      try {
        io.to('admin_room').emit('user_ticket_message_added', {
          ticketId: ticket._id,
          userId: ticket.userId,
          message: messageData,
          ticket: {
            _id: ticket._id,
            title: ticket.title,
            ticketNumber: ticket.ticketNumber,
            customerName: ticket.customerName,
            customerEmail: ticket.customerEmail,
            status: ticket.status
          },
          timestamp: new Date()
        });
        console.log('Successfully emitted user_ticket_message_added to admin_room');
  } catch (error) {
        console.error('Error emitting user_ticket_message_added:', error);
      }
    } else {
      console.log('Cannot emit user_ticket_message_added - io:', !!io, 'sender:', sender);
    }

    res.json({
      success: true,
      message: 'Message added successfully',
      message: messageData
    });

  } catch (error) {
    console.error('Error adding ticket message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add message',
      error: error.message
    });
  }
};

// Update support ticket status
const updateTicketStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    const ticket = await SupportTicket.findById(id);
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Support ticket not found'
      });
    }

    ticket.status = status;
    await ticket.save();

    // Emit socket event to notify user about status change
    if (io && ticket.userId) {
      console.log('Emitting ticket_status_updated to user:', ticket.userId);
      try {
        io.to(`user_${ticket.userId}`).emit('ticket_status_updated', {
          ticketId: ticket._id,
          userId: ticket.userId,
          status: status,
          timestamp: new Date()
        });
        console.log('Successfully emitted ticket_status_updated to user:', ticket.userId);
  } catch (error) {
        console.error('Error emitting ticket_status_updated:', error);
      }
    }

    res.json({
      success: true,
      message: 'Ticket status updated successfully',
      ticket
    });

  } catch (error) {
    console.error('Error updating ticket status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ticket status',
      error: error.message
    });
  }
};

// ==================== EMAIL FUNCTIONS ====================

// Send query confirmation email to customer
const sendQueryConfirmationEmail = async (query) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: query.customerEmail,
      subject: `Support Query Confirmation - ${query.subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Support Query Confirmation</h2>
          <p>Dear ${query.customerName},</p>
          <p>Thank you for contacting us. We have received your support query and will get back to you soon.</p>
          <div style="background-color: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 5px;">
            <h3>Query Details:</h3>
            <p><strong>Subject:</strong> ${query.subject}</p>
            <p><strong>Message:</strong> ${query.message}</p>
            <p><strong>Status:</strong> ${query.status}</p>
            <p><strong>Priority:</strong> ${query.priority}</p>
          </div>
          <p>We will respond to your query within 24 hours.</p>
          <p>Best regards,<br>Support Team</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Query confirmation email sent to:', query.customerEmail);
  } catch (error) {
    console.error('Error sending query confirmation email:', error);
  }
};

// Send admin notification email for new query
const sendAdminQueryNotification = async (query) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.ADMIN_EMAIL,
      subject: `New Support Query - ${query.subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">New Support Query Received</h2>
          <div style="background-color: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 5px;">
            <h3>Query Details:</h3>
            <p><strong>Customer:</strong> ${query.customerName}</p>
            <p><strong>Email:</strong> ${query.customerEmail}</p>
            <p><strong>Subject:</strong> ${query.subject}</p>
            <p><strong>Message:</strong> ${query.message}</p>
            <p><strong>Priority:</strong> ${query.priority}</p>
            <p><strong>Category:</strong> ${query.category}</p>
          </div>
          <p>Please respond to this query as soon as possible.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Admin query notification email sent');
  } catch (error) {
    console.error('Error sending admin query notification:', error);
  }
};

// Send ticket confirmation email to customer
const sendTicketConfirmationEmail = async (ticket) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: ticket.customerEmail,
      subject: `Support Ticket Confirmation - ${ticket.ticketNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Support Ticket Confirmation</h2>
          <p>Dear ${ticket.customerName},</p>
          <p>Thank you for contacting us. We have created a support ticket for your issue and will get back to you soon.</p>
          <div style="background-color: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 5px;">
            <h3>Ticket Details:</h3>
            <p><strong>Ticket Number:</strong> ${ticket.ticketNumber}</p>
            <p><strong>Title:</strong> ${ticket.title}</p>
            <p><strong>Description:</strong> ${ticket.description}</p>
            <p><strong>Status:</strong> ${ticket.status}</p>
            <p><strong>Priority:</strong> ${ticket.priority}</p>
          </div>
          <p>We will respond to your ticket within 24 hours.</p>
          <p>Best regards,<br>Support Team</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Ticket confirmation email sent to:', ticket.customerEmail);
  } catch (error) {
    console.error('Error sending ticket confirmation email:', error);
  }
};

// Send admin notification email for new ticket
const sendAdminTicketNotification = async (ticket) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.ADMIN_EMAIL,
      subject: `New Support Ticket - ${ticket.ticketNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">New Support Ticket Received</h2>
          <div style="background-color: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 5px;">
            <h3>Ticket Details:</h3>
            <p><strong>Ticket Number:</strong> ${ticket.ticketNumber}</p>
            <p><strong>Customer:</strong> ${ticket.customerName}</p>
            <p><strong>Email:</strong> ${ticket.customerEmail}</p>
            <p><strong>Title:</strong> ${ticket.title}</p>
            <p><strong>Description:</strong> ${ticket.description}</p>
            <p><strong>Priority:</strong> ${ticket.priority}</p>
            <p><strong>Category:</strong> ${ticket.category}</p>
          </div>
          <p>Please respond to this ticket as soon as possible.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Admin ticket notification email sent');
  } catch (error) {
    console.error('Error sending admin ticket notification:', error);
  }
};

module.exports = {
  // Socket instance setter
  setSocketInstance,

  // Support Query functions
  createSupportQuery,
  getAllSupportQueries,
  getSupportQueryById,
  addQueryResponse,
  updateQueryStatus,

  // Support Ticket functions
  createSupportTicket,
  getAllSupportTickets,
  getSupportTicketById,
  addTicketMessage,
  updateTicketStatus
};

const SupportQuery = require('../models/SupportQuery');
const SupportTicket = require('../models/SupportTicket');
const ChatRoom = require('../models/ChatRoom');
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

    // Validation
    if (!customerName || !customerEmail || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'Customer name, email, subject, and message are required'
      });
    }

    // Create new query
    const newQuery = new SupportQuery({
      customerName,
      customerEmail,
      customerPhone,
      userId,
      subject,
      message,
      category: category || 'general',
      priority: priority || 'medium',
      orderId,
      productId,
      responses: [{
        message,
        sender: 'customer',
        senderName: customerName,
        senderEmail: customerEmail,
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
      try {
        io.to('admin_room').emit('new_query_created', {
          query: savedQuery,
          timestamp: new Date()
        });
        // Also try broadcasting to all connected sockets
        io.emit('new_query_created', {
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
      assignedTo,
      userId,
      customerEmail,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter
    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (priority) filter.priority = priority;
    if (assignedTo) filter.assignedTo = assignedTo;
    
    // Check if user is admin
    const isAdmin = req.user && (req.user.isAdmin === true || req.user.role === 'admin' || req.user.role === 'super_admin');
    
    if (isAdmin) {
      // Admin can see all queries or filter by specific criteria
      if (userId) filter.userId = userId;
      if (customerEmail) filter.customerEmail = customerEmail;
    } else {
      // Regular users can only see their own queries
      filter.userId = req.user.id;
      // Also allow by email if no userId but email matches
      if (!userId && customerEmail && customerEmail === req.user.email) {
        filter.customerEmail = customerEmail;
      }
    }

    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Calculate pagination
    const skip = (page - 1) * limit;

    const queries = await SupportQuery.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('assignedTo', 'name email')
      .populate('orderId', 'orderNumber totalAmount')
      .populate('productId', 'name price');

    const total = await SupportQuery.countDocuments(filter);

    res.json({
      success: true,
      queries,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        limit: parseInt(limit)
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

    const query = await SupportQuery.findById(id)
      .populate('assignedTo', 'name email')
      .populate('orderId', 'orderNumber totalAmount items')
      .populate('productId', 'name price images');

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
    const { message, sender, senderName, senderEmail, attachments } = req.body;

    if (!message || !sender || !senderName || !senderEmail) {
      return res.status(400).json({
        success: false,
        message: 'Message, sender, sender name, and sender email are required'
      });
    }

    const query = await SupportQuery.findById(id);
    if (!query) {
      return res.status(404).json({
        success: false,
        message: 'Support query not found'
      });
    }

    // Check if user is authorized to add response to this query
    const isAdmin = req.user && (req.user.isAdmin === true || req.user.role === 'admin' || req.user.role === 'super_admin');
    
    if (!isAdmin && query.userId && query.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only add responses to your own queries.'
      });
    }

    const responseData = {
      message,
      sender,
      senderName,
      senderEmail,
      attachments: attachments || [],
      createdAt: new Date()
    };

    await query.addResponse(responseData);

    // Send email notification
    if (sender === 'admin') {
      await sendCustomerResponseNotification(query, responseData);
    } else {
      await sendAdminResponseNotification(query, responseData);
    }

    // Emit socket event to notify user about new response
    if (io && query.userId) {
      console.log('Emitting query_response_added to user:', query.userId);
      try {
        // Try multiple emit methods
        io.to(`user_${query.userId}`).emit('query_response_added', {
          queryId: query._id,
          userId: query.userId,
          response: responseData,
          timestamp: new Date()
        });
        
        // Also try broadcasting to all connected sockets
        io.emit('query_response_added', {
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
        // Try multiple emit methods
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
        
        // Also try broadcasting to all connected sockets
        io.emit('user_query_response_added', {
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
      query
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
    const { status, assignedTo, resolution } = req.body;
    const adminId = req.user.id;

    const query = await SupportQuery.findById(id);
    if (!query) {
      return res.status(404).json({
        success: false,
        message: 'Support query not found'
      });
    }

    // Update status
    if (status) {
      await query.updateStatus(status, adminId);
    }

    // Assign to admin
    if (assignedTo) {
      query.assignedTo = assignedTo;
      query.assignedAt = new Date();
    }

    // Add resolution
    if (resolution) {
      query.resolution = resolution;
    }

    await query.save();

    // Emit socket event to notify user about status change
    if (io && query.userId) {
      io.to(`user_${query.userId}`).emit('query_status_updated', {
        queryId: query._id,
        userId: query.userId,
        status: query.status,
        subject: query.subject,
        timestamp: new Date()
      });
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

    // Validation
    if (!title || !description || !customerName || !customerEmail) {
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
      customerName,
      customerEmail,
      customerPhone,
      userId,
      category: category || 'general',
      priority: priority || 'medium',
      orderId,
      productId,
      messages: [{
        message: description,
        sender: 'customer',
        senderName: customerName,
        senderEmail: customerEmail,
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
      try {
        io.to('admin_room').emit('new_ticket_created', {
          ticket: savedTicket,
          timestamp: new Date()
        });
        // Also try broadcasting to all connected sockets
        io.emit('new_ticket_created', {
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
      assignedTo,
      userId,
      customerEmail,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter
    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (priority) filter.priority = priority;
    if (assignedTo) filter.assignedTo = assignedTo;
    
    // Check if user is admin
    const isAdmin = req.user && (req.user.isAdmin === true || req.user.role === 'admin' || req.user.role === 'super_admin');
    
    if (isAdmin) {
      // Admin can see all tickets or filter by specific criteria
      if (userId) filter.userId = userId;
      if (customerEmail) filter.customerEmail = customerEmail;
    } else {
      // Regular users can only see their own tickets
      filter.userId = req.user.id;
      // Also allow by email if no userId but email matches
      if (!userId && customerEmail && customerEmail === req.user.email) {
        filter.customerEmail = customerEmail;
      }
    }

    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Calculate pagination
    const skip = (page - 1) * limit;

    const tickets = await SupportTicket.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('assignedTo', 'name email')
      .populate('orderId', 'orderNumber totalAmount')
      .populate('productId', 'name price');

    const total = await SupportTicket.countDocuments(filter);

    res.json({
      success: true,
      tickets,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        limit: parseInt(limit)
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

    const ticket = await SupportTicket.findById(id)
      .populate('assignedTo', 'name email')
      .populate('orderId', 'orderNumber totalAmount items')
      .populate('productId', 'name price images');

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
    const { message, sender, senderName, senderEmail, attachments, isInternal } = req.body;

    if (!message || !sender || !senderName || !senderEmail) {
      return res.status(400).json({
        success: false,
        message: 'Message, sender, sender name, and sender email are required'
      });
    }

    const ticket = await SupportTicket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Support ticket not found'
      });
    }

    // Check if user is authorized to add message to this ticket
    const isAdmin = req.user && (req.user.isAdmin === true || req.user.role === 'admin' || req.user.role === 'super_admin');
    
    if (!isAdmin && ticket.userId && ticket.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only add messages to your own tickets.'
      });
    }

    const messageData = {
      message,
      sender,
      senderName,
      senderEmail,
      attachments: attachments || [],
      isInternal: isInternal || false,
      createdAt: new Date()
    };

    await ticket.addMessage(messageData);

    // Send email notification
    if (sender === 'admin' && !isInternal) {
      await sendCustomerTicketResponseNotification(ticket, messageData);
    } else if (sender === 'customer') {
      await sendAdminTicketResponseNotification(ticket, messageData);
    }

    // Emit socket event to notify user about new message
    if (io && ticket.userId && sender === 'admin' && !isInternal) {
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
      console.log('Cannot emit ticket_message_added - io:', !!io, 'userId:', ticket.userId, 'sender:', sender, 'isInternal:', isInternal);
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
      ticket
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
    const { status, assignedTo, resolution, resolutionType } = req.body;
    const adminId = req.user.id;

    const ticket = await SupportTicket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Support ticket not found'
      });
    }

    // Update status
    if (status) {
      await ticket.updateStatus(status, adminId);
    }

    // Assign to admin
    if (assignedTo) {
      await ticket.assignTicket(assignedTo, adminId);
    }

    // Add resolution
    if (resolution) {
      ticket.resolution = resolution;
      ticket.resolutionType = resolutionType;
    }

    await ticket.save();

    // Emit socket event to notify user about status change
    if (io && ticket.userId) {
      io.to(`user_${ticket.userId}`).emit('ticket_status_updated', {
        ticketId: ticket._id,
        userId: ticket.userId,
        status: ticket.status,
        title: ticket.title,
        ticketNumber: ticket.ticketNumber,
        timestamp: new Date()
      });
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
      roomId,
      roomName: roomName || `Support Chat - ${customerName}`,
      roomType: roomType || 'customer_support',
      participants: [{
        userId: userId || customerEmail,
        userType: 'customer',
        userName: customerName,
        userEmail: customerEmail,
        joinedAt: new Date(),
        lastSeenAt: new Date(),
        isActive: true
      }],
      orderId,
      ticketId,
      queryId
    });

    const savedRoom = await newRoom.save();

    res.status(201).json({
      success: true,
      message: 'Chat room created successfully',
      room: savedRoom
    });

  } catch (error) {
    console.error('Error creating chat room:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create chat room',
      error: error.message
    });
  }
};

// Get all chat rooms (Admin only)
const getAllChatRooms = async (req, res) => {
  try {
    const {
      status,
      roomType,
      page = 1,
      limit = 20,
      sortBy = 'lastMessageAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter
    const filter = {};
    if (status) filter.status = status;
    if (roomType) filter.roomType = roomType;

    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Calculate pagination
    const skip = (page - 1) * limit;

    const rooms = await ChatRoom.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('orderId', 'orderNumber totalAmount')
      .populate('ticketId', 'ticketNumber title')
      .populate('queryId', 'subject');

    const total = await ChatRoom.countDocuments(filter);

    res.json({
      success: true,
      rooms,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error fetching chat rooms:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat rooms',
      error: error.message
    });
  }
};

// Get chat room by ID
const getChatRoomById = async (req, res) => {
  try {
    const { id } = req.params;

    const room = await ChatRoom.findById(id)
      .populate('orderId', 'orderNumber totalAmount items')
      .populate('ticketId', 'ticketNumber title status')
      .populate('queryId', 'subject status');

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found'
      });
    }

    res.json({
      success: true,
      room
    });

  } catch (error) {
    console.error('Error fetching chat room:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat room',
      error: error.message
    });
  }
};

// Add message to chat room
const addChatMessage = async (req, res) => {
  try {
    const { id } = req.params;
    // Decode the room ID in case it was URL encoded
    const roomId = decodeURIComponent(id);
    const { message, senderId, senderName, senderType, messageType, attachments } = req.body;

    console.log('=== CHAT MESSAGE DEBUG ===');
    console.log('Original Room ID:', id);
    console.log('Decoded Room ID:', roomId);
    console.log('Request Body:', { message, senderId, senderName, senderType, messageType, attachments });
    console.log('Raw Request Body:', req.body);
    console.log('User from token:', req.user);
    console.log('Request URL:', req.originalUrl);
    console.log('Request Method:', req.method);
    console.log('Request Headers:', req.headers);

    if (!message || !senderId || !senderName || !senderType) {
      console.log('Missing required fields:', { message: !!message, senderId: !!senderId, senderName: !!senderName, senderType: !!senderType });
      console.log('Actual values:', { message, senderId, senderName, senderType });
      return res.status(400).json({
        success: false,
        message: 'Message, sender ID, sender name, and sender type are required',
        details: { message: !!message, senderId: !!senderId, senderName: !!senderName, senderType: !!senderType }
      });
    }

    // Find room by roomId (not MongoDB _id)
    let room = await ChatRoom.findOne({ roomId: roomId });
    
    if (!room) {
      console.log('Room not found with ID:', roomId);
      return res.status(404).json({
        success: false,
        message: 'Chat room not found'
      });
    }
    
    console.log('Found room:', room.roomId || room._id);

    const messageData = {
      message,
      senderId,
      senderName,
      senderType,
      messageType: messageType || 'text',
      attachments: attachments || []
    };

    await room.addMessage(messageData);

    res.json({
      success: true,
      message: 'Message added successfully',
      room
    });

  } catch (error) {
    console.error('Error adding chat message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add message',
      error: error.message
    });
  }
};

// Join chat room
const joinChatRoom = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, userType, userName, userEmail } = req.body;

    if (!userId || !userType || !userName || !userEmail) {
      return res.status(400).json({
        success: false,
        message: 'User ID, user type, user name, and user email are required'
      });
    }

    const room = await ChatRoom.findById(id);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found'
      });
    }

    await room.addParticipant({
      userId,
      userType,
      userName,
      userEmail
    });

    res.json({
      success: true,
      message: 'Joined chat room successfully',
      room
    });

  } catch (error) {
    console.error('Error joining chat room:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to join chat room',
      error: error.message
    });
  }
};

// ==================== EMAIL FUNCTIONS ====================

// Send query confirmation email
const sendQueryConfirmationEmail = async (query) => {
  try {
    const subject = `Support Query Confirmation - ${query.subject}`;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
          <h2 style="color: #333; text-align: center;">Rikocraft Support</h2>
          <p>Dear ${query.customerName},</p>
          <p>Thank you for contacting Rikocraft support. We have received your query and will respond within 24 hours.</p>
          <div style="background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3>Query Details:</h3>
            <p><strong>Subject:</strong> ${query.subject}</p>
            <p><strong>Category:</strong> ${query.category}</p>
            <p><strong>Priority:</strong> ${query.priority}</p>
            <p><strong>Message:</strong> ${query.message}</p>
          </div>
          <p>We appreciate your patience and will get back to you soon.</p>
          <p>Best regards,<br>Rikocraft Support Team</p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: query.customerEmail,
      subject,
      html: htmlBody
    });

    console.log(`Query confirmation email sent to ${query.customerEmail}`);
  } catch (error) {
    console.error('Error sending query confirmation email:', error);
  }
};

// Send admin query notification
const sendAdminQueryNotification = async (query) => {
  try {
    const subject = `New Support Query - ${query.subject}`;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
          <h2 style="color: #333; text-align: center;">New Support Query</h2>
          <p>A new support query has been submitted:</p>
          <div style="background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3>Query Details:</h3>
            <p><strong>Customer:</strong> ${query.customerName}</p>
            <p><strong>Email:</strong> ${query.customerEmail}</p>
            <p><strong>Phone:</strong> ${query.customerPhone || 'Not provided'}</p>
            <p><strong>Subject:</strong> ${query.subject}</p>
            <p><strong>Category:</strong> ${query.category}</p>
            <p><strong>Priority:</strong> ${query.priority}</p>
            <p><strong>Message:</strong> ${query.message}</p>
          </div>
          <p>Please respond to this query as soon as possible.</p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER, // Admin email
      subject,
      html: htmlBody
    });

    console.log('Admin query notification sent');
  } catch (error) {
    console.error('Error sending admin query notification:', error);
  }
};

// Send customer response notification
const sendCustomerResponseNotification = async (query, response) => {
  try {
    const subject = `Response to your support query - ${query.subject}`;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
          <h2 style="color: #333; text-align: center;">Rikocraft Support Response</h2>
          <p>Dear ${query.customerName},</p>
          <p>We have responded to your support query:</p>
          <div style="background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3>Response:</h3>
            <p>${response.message}</p>
          </div>
          <p>If you need further assistance, please reply to this email.</p>
          <p>Best regards,<br>Rikocraft Support Team</p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: query.customerEmail,
      subject,
      html: htmlBody
    });

    console.log(`Customer response notification sent to ${query.customerEmail}`);
  } catch (error) {
    console.error('Error sending customer response notification:', error);
  }
};

// Send admin response notification
const sendAdminResponseNotification = async (query, response) => {
  try {
    const subject = `Customer Response - ${query.subject}`;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
          <h2 style="color: #333; text-align: center;">Customer Response</h2>
          <p>Customer ${query.customerName} has responded to support query:</p>
          <div style="background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3>Response:</h3>
            <p>${response.message}</p>
          </div>
          <p>Please check the admin panel for more details.</p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER, // Admin email
      subject,
      html: htmlBody
    });

    console.log('Admin response notification sent');
  } catch (error) {
    console.error('Error sending admin response notification:', error);
  }
};

// Send ticket confirmation email
const sendTicketConfirmationEmail = async (ticket) => {
  try {
    const subject = `Support Ticket Created - ${ticket.ticketNumber}`;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
          <h2 style="color: #333; text-align: center;">Rikocraft Support Ticket</h2>
          <p>Dear ${ticket.customerName},</p>
          <p>Your support ticket has been created successfully. We will respond within 24 hours.</p>
          <div style="background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3>Ticket Details:</h3>
            <p><strong>Ticket Number:</strong> ${ticket.ticketNumber}</p>
            <p><strong>Title:</strong> ${ticket.title}</p>
            <p><strong>Category:</strong> ${ticket.category}</p>
            <p><strong>Priority:</strong> ${ticket.priority}</p>
            <p><strong>Description:</strong> ${ticket.description}</p>
          </div>
          <p>You can track your ticket status in your account or by replying to this email.</p>
          <p>Best regards,<br>Rikocraft Support Team</p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: ticket.customerEmail,
      subject,
      html: htmlBody
    });

    console.log(`Ticket confirmation email sent to ${ticket.customerEmail}`);
  } catch (error) {
    console.error('Error sending ticket confirmation email:', error);
  }
};

// Send admin ticket notification
const sendAdminTicketNotification = async (ticket) => {
  try {
    const subject = `New Support Ticket - ${ticket.ticketNumber}`;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
          <h2 style="color: #333; text-align: center;">New Support Ticket</h2>
          <p>A new support ticket has been created:</p>
          <div style="background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3>Ticket Details:</h3>
            <p><strong>Ticket Number:</strong> ${ticket.ticketNumber}</p>
            <p><strong>Customer:</strong> ${ticket.customerName}</p>
            <p><strong>Email:</strong> ${ticket.customerEmail}</p>
            <p><strong>Title:</strong> ${ticket.title}</p>
            <p><strong>Category:</strong> ${ticket.category}</p>
            <p><strong>Priority:</strong> ${ticket.priority}</p>
            <p><strong>Description:</strong> ${ticket.description}</p>
          </div>
          <p>Please assign and respond to this ticket as soon as possible.</p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER, // Admin email
      subject,
      html: htmlBody
    });

    console.log('Admin ticket notification sent');
  } catch (error) {
    console.error('Error sending admin ticket notification:', error);
  }
};

// Send customer ticket response notification
const sendCustomerTicketResponseNotification = async (ticket, message) => {
  try {
    const subject = `Response to your support ticket - ${ticket.ticketNumber}`;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
          <h2 style="color: #333; text-align: center;">Rikocraft Support Response</h2>
          <p>Dear ${ticket.customerName},</p>
          <p>We have responded to your support ticket ${ticket.ticketNumber}:</p>
          <div style="background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3>Response:</h3>
            <p>${message.message}</p>
          </div>
          <p>If you need further assistance, please reply to this email.</p>
          <p>Best regards,<br>Rikocraft Support Team</p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: ticket.customerEmail,
      subject,
      html: htmlBody
    });

    console.log(`Customer ticket response notification sent to ${ticket.customerEmail}`);
  } catch (error) {
    console.error('Error sending customer ticket response notification:', error);
  }
};

// Send admin ticket response notification
const sendAdminTicketResponseNotification = async (ticket, message) => {
  try {
    const subject = `Customer Response - Ticket ${ticket.ticketNumber}`;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
          <h2 style="color: #333; text-align: center;">Customer Response</h2>
          <p>Customer ${ticket.customerName} has responded to ticket ${ticket.ticketNumber}:</p>
          <div style="background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3>Response:</h3>
            <p>${message.message}</p>
          </div>
          <p>Please check the admin panel for more details.</p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER, // Admin email
      subject,
      html: htmlBody
    });

    console.log('Admin ticket response notification sent');
  } catch (error) {
    console.error('Error sending admin ticket response notification:', error);
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
  updateTicketStatus,

};

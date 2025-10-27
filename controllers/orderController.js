const Order = require('../models/Order');
const fs = require('fs').promises;
const path = require('path');
const ordersJsonPath = path.join(__dirname, '../data/orders.json');
const Product = require('../models/Product');
const nodemailer = require('nodemailer');
const { 
  generateTrackingNumber, 
  generateInvoiceNumber, 
  calculateEstimatedDeliveryDate, 
  getCourierProvider,
  generateTrackingUrl,
  getOrderTimeline 
} = require('../utils/orderUtils');

// Setup nodemailer transporter (reuse config from auth.js)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Create a new order
const createOrder = async (req, res) => {
  try {
    const {
      customerName,
      email,
      phone,
      address,
      city,
      state,
      pincode,
      country,
      items,
      totalAmount,
      paymentMethod,
      paymentStatus,
      upfrontAmount,
      remainingAmount,
      razorpayOrderId, // Razorpay order ID
      couponCode, // Coupon code if applied
    } = req.body;

    // Comprehensive validation
    const requiredFields = ['customerName', 'email', 'phone', 'address', 'city', 'state', 'pincode', 'country', 'items', 'totalAmount', 'paymentMethod', 'paymentStatus'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Missing required fields: ${missingFields.join(', ')}` 
      });
    }

    // Validate items array
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Items array is required and must not be empty.' 
      });
    }

    // Validate each item has required fields
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemRequiredFields = ['name', 'price', 'quantity'];
      const missingItemFields = itemRequiredFields.filter(field => !item[field]);
      
      if (missingItemFields.length > 0) {
        return res.status(400).json({ 
          success: false, 
          message: `Item ${i + 1} is missing required fields: ${missingItemFields.join(', ')}` 
        });
      }
    }

    // Validate upfront amount for COD orders
    if (paymentMethod === 'cod' && upfrontAmount > 0) {
      if (upfrontAmount >= totalAmount) {
        return res.status(400).json({
          success: false,
          message: 'Upfront amount cannot be greater than or equal to total order amount. For COD orders, upfront amount should be less than the total product price.'
        });
      }
    }

    // Map paymentStatus to valid enum values
    let mappedPaymentStatus = paymentStatus;
    if (paymentStatus === 'partial' || paymentStatus === 'processing') {
      mappedPaymentStatus = 'pending';
    }
    if (!['pending', 'completed', 'failed'].includes(mappedPaymentStatus)) {
      mappedPaymentStatus = 'pending';
    }

    // Support both address as string (street) and as object
    let addressObj;
    if (typeof address === 'object' && address !== null) {
      addressObj = {
        street: address.street || '',
        city: address.city || city || '',
        state: address.state || state || '',
        pincode: address.pincode || pincode || '',
        country: address.country || country || '',
      };
    } else {
      addressObj = {
        street: address || '',
        city: city || '',
        state: state || '',
        pincode: pincode || '',
        country: country || '',
      };
    }

    // Determine initial revenue status based on payment method and status
    let initialRevenueStatus = 'pending';
    let initialRevenueAmount = 0;
    let initialAdminReceivedAmount = 0;
    
    // For online payments with completed status, set revenue as confirmed
    if (paymentMethod !== 'cod' && mappedPaymentStatus === 'completed') {
      initialRevenueStatus = 'confirmed';
      initialRevenueAmount = totalAmount;
      initialAdminReceivedAmount = totalAmount;
    }
    // For COD orders with upfront payment
    else if (paymentMethod === 'cod') {
      if (mappedPaymentStatus === 'completed' && upfrontAmount > 0) {
        // COD with upfront payment - upfront amount is part of total, not extra
        initialRevenueStatus = 'pending';
        initialRevenueAmount = upfrontAmount; // Only upfront amount initially
        initialAdminReceivedAmount = upfrontAmount;
      } else {
        // COD without upfront payment
        initialRevenueStatus = 'pending';
        initialRevenueAmount = 0;
        initialAdminReceivedAmount = 0;
      }
    }

    // Generate tracking and delivery information
    const trackingNumber = generateTrackingNumber();
    const invoiceNumber = generateInvoiceNumber();
    const estimatedDeliveryDate = calculateEstimatedDeliveryDate(new Date(), addressObj.state);
    const courierProvider = getCourierProvider(addressObj.state, totalAmount);
    const courierTrackingUrl = generateTrackingUrl(trackingNumber, courierProvider);

    const newOrder = new Order({
      customerName,
      email,
      phone,
      address: addressObj,
      items,
      totalAmount,
      paymentMethod,
      paymentStatus: mappedPaymentStatus,
      upfrontAmount: upfrontAmount || 0,
      remainingAmount: remainingAmount || 0,
      razorpayOrderId: razorpayOrderId || null,
      couponCode,
      revenueStatus: initialRevenueStatus,
      revenueAmount: initialRevenueAmount,
      adminReceivedAmount: initialAdminReceivedAmount,
      revenueEarnedAt: initialRevenueStatus === 'confirmed' ? new Date() : null,
      revenueConfirmedAt: initialRevenueStatus === 'confirmed' ? new Date() : null,
      // Tracking and delivery fields
      trackingNumber,
      courierProvider: courierProvider.name,
      courierTrackingUrl,
      estimatedDeliveryDate,
      // Invoice fields
      invoiceNumber,
      invoiceGeneratedAt: new Date(),
    });

    const savedOrder = await newOrder.save();

    // Decrement stock for each product in the order
    for (const item of items) {
      if (item.productId) {
        const product = await Product.findById(item.productId);
        if (product) {
          product.stock = Math.max(0, (product.stock || 0) - (item.quantity || 1));
          if (product.stock === 0) {
            product.inStock = false;
          }
          await product.save();
        }
      }
    }

    // Save to orders.json for admin
    await appendOrderToJson(savedOrder);

    // Send order confirmation email (non-blocking)
    sendOrderConfirmationEmail(savedOrder);
    
    res.status(201).json({ 
      success: true, 
      message: 'Order created successfully!', 
      order: savedOrder
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ success: false, message: 'Failed to create order.', error: error.message });
  }
};

// Get all orders for a specific user by email
const getOrdersByEmail = async (req, res) => {
  try {
    const userEmail = req.query.email;
    if (!userEmail) {
      return res.status(400).json({ success: false, message: 'Email query parameter is required.' });
    }
    // Case-insensitive search for email
    const orders = await Order.find({ email: { $regex: new RegExp(`^${userEmail}$`, 'i') } }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, orders });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch orders.', error: error.message });
  }
};

// Get a single order by its ID
const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    res.status(200).json({ success: true, order });
  } catch (error) {
    console.error('Error fetching order by ID:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch order.', error: error.message });
  }
};

// Helper to append order to orders.json
async function appendOrderToJson(order) {
  try {
    let orders = [];
    try {
      const data = await fs.readFile(ordersJsonPath, 'utf8');
      orders = JSON.parse(data);
      if (!Array.isArray(orders)) orders = [];
    } catch (err) {
      // If file doesn't exist, start with empty array
      orders = [];
    }
    orders.push(order.toObject ? order.toObject({ virtuals: true }) : order);
    await fs.writeFile(ordersJsonPath, JSON.stringify(orders, null, 2));
  } catch (err) {
    console.error('Failed to append order to orders.json:', err);
  }
}

// Helper to send order confirmation email
async function sendOrderConfirmationEmail(order) {
  const { email, customerName, items, totalAmount, address } = order;
  const subject = 'Your Rikocraft Order Confirmation';

  // Build order items table
  const itemsHtml = items.map(item => `
    <tr>
      <td style="padding: 8px; border: 1px solid #eee;">${item.name}</td>
      <td style="padding: 8px; border: 1px solid #eee; text-align: center;">${item.quantity}</td>
      <td style="padding: 8px; border: 1px solid #eee; text-align: right;">₹${item.price}</td>
    </tr>
  `).join('');

  const addressHtml = `
    <div style="margin-bottom: 10px;">
      <strong>Shipping Address:</strong><br/>
      ${address.street || ''}<br/>
      ${address.city || ''}, ${address.state || ''} - ${address.pincode || ''}<br/>
      ${address.country || ''}
    </div>
  `;

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
      <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #333; margin: 0; font-size: 24px;">Rikocraft</h1>
          <p style="color: #666; margin: 5px 0; font-size: 14px;">Where heritage meets craftsmanship</p>
        </div>
        <div style="margin-bottom: 25px;">
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0;">
            Dear <strong>${customerName}</strong>,
          </p>
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 15px 0;">
            Thank you for your order! Your order has been placed successfully. Here are your order details:
          </p>
        </div>
        ${addressHtml}
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr>
              <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Item</th>
              <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Qty</th>
              <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        <div style="text-align: right; margin-bottom: 20px;">
          <strong>Total: ₹${totalAmount}</strong>
        </div>
        <div style="margin: 25px 0;">
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0;">
            We will notify you when your order is shipped. Thank you for shopping with Rikocraft!
          </p>
        </div>
        <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
          <p style="color: #666; font-size: 14px; margin: 0; line-height: 1.6;">
            <strong>Warm regards,</strong><br>
            Team Rikocraft
          </p>
          <div style="margin-top: 15px; color: #666; font-size: 12px;">
            <p style="margin: 5px 0;">🌐 www.rikocraft.com</p>
            <p style="margin: 5px 0;">📩 Email: Care@Rikocraft.com</p>
          </div>
        </div>
      </div>
    </div>
  `;

  const textBody = `Dear ${customerName},\n\nThank you for your order! Your order has been placed successfully.\n\nOrder Summary:\n${items.map(item => `- ${item.name} x${item.quantity} (₹${item.price})`).join('\n')}\nTotal: ₹${totalAmount}\n\nShipping Address:\n${address.street || ''}\n${address.city || ''}, ${address.state || ''} - ${address.pincode || ''}\n${address.country || ''}\n\nWe will notify you when your order is shipped.\n\nWarm regards,\nTeam Rikocraft\nwww.rikocraft.com\nCare@Rikocraft.com`;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject,
      text: textBody,
      html: htmlBody,
    });
    console.log(`Order confirmation email sent to ${email}`);
  } catch (mailErr) {
    console.error('Error sending order confirmation email:', mailErr);
    // Don't throw, so order creation isn't blocked by email failure
  }
}

// Helper to send order status update email
async function sendOrderStatusUpdateEmail(order) {
  const { email, customerName, orderStatus, items, totalAmount, address } = order;
  const subject = `Your Rikocraft Order Status Update: ${orderStatus.charAt(0).toUpperCase() + orderStatus.slice(1)}`;

  // Build order items table
  const itemsHtml = items.map(item => `
    <tr>
      <td style="padding: 8px; border: 1px solid #eee;">${item.text || item.name || 'Custom Item'}</td>
      <td style="padding: 8px; border: 1px solid #eee; text-align: center;">${item.quantity || 1}</td>
      <td style="padding: 8px; border: 1px solid #eee; text-align: right;">₹${item.price || 0}</td>
    </tr>
  `).join('');

  const addressHtml = `
    <div style="margin-bottom: 10px;">
      <strong>Delivery Address:</strong><br/>
      ${address.street || ''}<br/>
      ${address.city || ''}, ${address.state || ''} - ${address.pincode || ''}<br/>
      ${address.country || ''}
    </div>
  `;

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
      <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #333; margin: 0; font-size: 24px;">Rikocraft</h1>
          <p style="color: #666; margin: 5px 0; font-size: 14px;">Where heritage meets craftsmanship</p>
        </div>
        <div style="margin-bottom: 25px;">
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0;">
            Dear <strong>${customerName}</strong>,
          </p>
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 15px 0;">
            We wanted to let you know that the status of your order has been updated to:
            <span style="color: #007bff; font-weight: bold;">${orderStatus.charAt(0).toUpperCase() + orderStatus.slice(1)}</span>
          </p>
        </div>
        ${addressHtml}
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr>
              <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Item</th>
              <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Qty</th>
              <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        <div style="text-align: right; margin-bottom: 20px;">
          <strong>Total: ₹${totalAmount}</strong>
        </div>
        <div style="margin: 25px 0;">
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0;">
            Your order is currently <strong>${orderStatus}</strong>. We will keep you updated on the next steps. If you have any questions, feel free to reply to this email.
          </p>
        </div>
        <div style="margin: 25px 0;">
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0;">
            Thank you for shopping with Rikocraft! We hope you enjoy your purchase. Don’t forget to check out our other unique handmade products at <a href="https://www.rikocraft.com" style="color: #007bff;">rikocraft.com</a>.
          </p>
        </div>
        <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
          <p style="color: #666; font-size: 14px; margin: 0; line-height: 1.6;">
            <strong>Warm regards,</strong><br>
            Team Rikocraft
          </p>
          <div style="margin-top: 15px; color: #666; font-size: 12px;">
            <p style="margin: 5px 0;">🌐 www.rikocraft.com</p>
            <p style="margin: 5px 0;">📩 Email: Care@Rikocraft.com</p>
          </div>
        </div>
      </div>
    </div>
  `;

  const textBody = `Dear ${customerName},\n\nThe status of your Rikocraft order has been updated to: ${orderStatus}.\n\nOrder Summary:\n${items.map(item => `- ${item.name} x${item.quantity} (₹${item.price})`).join('\n')}\nTotal: ₹${totalAmount}\n\nDelivery Address:\n${address.street || ''}\n${address.city || ''}, ${address.state || ''} - ${address.pincode || ''}\n${address.country || ''}\n\nThank you for shopping with Rikocraft! Check out more at rikocraft.com\n\nWarm regards,\nTeam Rikocraft\nwww.rikocraft.com\nCare@Rikocraft.com`;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject,
      text: textBody,
      html: htmlBody,
    });
    console.log(`Order status update email sent to ${email}`);
  } catch (mailErr) {
    console.error('Error sending order status update email:', mailErr);
    // Don't throw, so status update isn't blocked by email failure
  }
}

// Get sales analytics (Admin only)
const getSalesAnalytics = async (req, res) => {
  try {
    const { period = 'monthly' } = req.query; // daily, monthly, yearly
    
    const now = new Date();
    let startDate, endDate;
    
    switch (period) {
      case 'daily':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        break;
      case 'monthly':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        break;
      case 'yearly':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear() + 1, 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }
    
    // Get orders for the period
    const orders = await Order.find({
      createdAt: { $gte: startDate, $lt: endDate }
    });
    
    // Calculate analytics
    const totalOrders = orders.length;
    
    // Revenue breakdown by status
    const pendingRevenue = orders
      .filter(o => o.revenueStatus === 'pending')
      .reduce((sum, order) => sum + order.totalAmount, 0);
    
    const earnedRevenue = orders
      .filter(o => o.revenueStatus === 'earned')
      .reduce((sum, order) => sum + (order.revenueAmount || order.totalAmount), 0);
    
    const confirmedRevenue = orders
      .filter(o => o.revenueStatus === 'confirmed')
      .reduce((sum, order) => sum + (order.adminReceivedAmount || order.revenueAmount || order.totalAmount), 0);
    
    const totalRevenue = pendingRevenue + earnedRevenue + confirmedRevenue;
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    
    // Status breakdown
    const statusBreakdown = {
      processing: orders.filter(o => o.orderStatus === 'processing').length,
      confirmed: orders.filter(o => o.orderStatus === 'confirmed').length,
      manufacturing: orders.filter(o => o.orderStatus === 'manufacturing').length,
      shipped: orders.filter(o => o.orderStatus === 'shipped').length,
      delivered: orders.filter(o => o.orderStatus === 'delivered').length,
      cancelled: orders.filter(o => o.orderStatus === 'cancelled').length
    };
    
    // Payment status breakdown
    const paymentBreakdown = {
      pending: orders.filter(o => o.paymentStatus === 'pending').length,
      completed: orders.filter(o => o.paymentStatus === 'completed').length,
      failed: orders.filter(o => o.paymentStatus === 'failed').length,
      pending_upfront: orders.filter(o => o.paymentStatus === 'pending_upfront').length
    };
    
    // Get previous period for comparison
    let previousStartDate, previousEndDate;
    switch (period) {
      case 'daily':
        previousStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        previousEndDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'monthly':
        previousStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        previousEndDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'yearly':
        previousStartDate = new Date(now.getFullYear() - 1, 0, 1);
        previousEndDate = new Date(now.getFullYear(), 0, 1);
        break;
    }
    
    const previousOrders = await Order.find({
      createdAt: { $gte: previousStartDate, $lt: previousEndDate }
    });
    
    // Calculate previous period revenue
    const previousRevenue = previousOrders.reduce((sum, order) => {
      return sum + (order.revenueAmount || order.totalAmount || 0);
    }, 0);
    
    // Calculate growth percentages
    const revenueGrowth = previousRevenue > 0 ? ((totalRevenue - previousRevenue) / previousRevenue) * 100 : 0;
    const orderGrowth = previousOrders.length > 0 ? ((totalOrders - previousOrders.length) / previousOrders.length) * 100 : 0;
    
    console.log('📊 Sales Analytics Debug:', {
      period,
      currentPeriod: { totalRevenue, totalOrders },
      previousPeriod: { previousRevenue, previousOrdersCount: previousOrders.length },
      growth: { revenueGrowth, orderGrowth }
    });
    
    res.json({
      success: true,
      analytics: {
        period,
        dateRange: { startDate, endDate },
        totalOrders,
        totalRevenue,
        averageOrderValue,
        statusBreakdown,
        paymentBreakdown,
        revenueBreakdown: {
          pending: pendingRevenue,
          earned: earnedRevenue,
          confirmed: confirmedRevenue,
          total: totalRevenue
        },
        growth: {
          revenue: Math.round(revenueGrowth * 100) / 100,
          orders: Math.round(orderGrowth * 100) / 100
        }
      }
    });
  } catch (error) {
    console.error('Error fetching sales analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching sales analytics',
      error: error.message
    });
  }
};

// Get stock summary with low stock alerts (Admin only)
const getStockSummary = async (req, res) => {
  try {
    const products = await Product.find({});
    
    // Calculate stock statistics
    const totalProducts = products.length;
    const inStockProducts = products.filter(p => p.stock > 0).length;
    const outOfStockProducts = products.filter(p => p.stock === 0).length;
    const lowStockProducts = products.filter(p => p.stock > 0 && p.stock <= 5); // Low stock threshold
    
    const totalStockValue = products.reduce((sum, product) => {
      return sum + (product.price * product.stock);
    }, 0);
    
    // Low stock alerts
    const lowStockAlerts = lowStockProducts.map(product => ({
      id: product._id,
      name: product.name,
      currentStock: product.stock,
      price: product.price,
      category: product.categoryName || product.category,
      alertLevel: product.stock === 0 ? 'critical' : 'warning'
    }));
    
    // Category-wise stock breakdown
    const categoryStock = {};
    products.forEach(product => {
      const category = product.categoryName || product.category || 'Uncategorized';
      if (!categoryStock[category]) {
        categoryStock[category] = { totalProducts: 0, totalStock: 0, lowStock: 0 };
      }
      categoryStock[category].totalProducts++;
      categoryStock[category].totalStock += product.stock;
      if (product.stock <= 5) {
        categoryStock[category].lowStock++;
      }
    });
    
    res.json({
      success: true,
      stockSummary: {
        totalProducts,
        inStockProducts,
        outOfStockProducts,
        lowStockProducts: lowStockProducts.length,
        totalStockValue,
        lowStockAlerts,
        categoryBreakdown: categoryStock
      }
    });
  } catch (error) {
    console.error('Error fetching stock summary:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching stock summary',
      error: error.message
    });
  }
};

// Request order cancellation (user can request cancellation for COD orders)
const requestOrderCancellation = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Check if order can be cancelled
    if (order.orderStatus !== 'processing') {
      return res.status(400).json({ 
        success: false, 
        message: 'Order cannot be cancelled. Only processing orders can be cancelled.' 
      });
    }

    // Allow cancellation for both COD and online payments when in processing status
    // Online payments will require refund processing

    // Check if cancellation already requested
    if (order.cancellationRequested) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cancellation request already submitted for this order.' 
      });
    }

    // Update order with cancellation request
    const updatedOrder = await Order.findByIdAndUpdate(
      id,
      {
        cancellationRequested: true,
        cancellationReason: reason || 'User requested cancellation',
        cancellationStatus: 'requested',
        cancellationRequestedAt: new Date()
      },
      { new: true }
    );

    // Send cancellation request email to user
    try {
      await sendCancellationRequestEmail(updatedOrder);
    } catch (emailError) {
      console.error('Error sending cancellation request email:', emailError);
    }

    res.json({
      success: true,
      message: 'Cancellation request submitted successfully. Admin will review and confirm.',
      order: updatedOrder
    });

  } catch (error) {
    console.error('Error requesting order cancellation:', error);
    res.status(500).json({ success: false, message: 'Error requesting order cancellation' });
  }
};

// Admin approve/reject cancellation request
const handleCancellationRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, rejectionReason } = req.body; // action: 'approve' or 'reject'

    // Validate required fields
    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid action. Must be "approve" or "reject".' 
      });
    }

    // Validate rejection reason if action is reject
    if (action === 'reject' && (!rejectionReason || rejectionReason.trim() === '')) {
      return res.status(400).json({ 
        success: false, 
        message: 'Rejection reason is required when rejecting cancellation request.' 
      });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (!order.cancellationRequested || order.cancellationStatus !== 'requested') {
      return res.status(400).json({ 
        success: false, 
        message: 'No pending cancellation request found for this order.' 
      });
    }

    let updatedOrder;
    const isOnlinePayment = order.paymentMethod === 'online';

    if (action === 'approve') {
      // Check if this order requires refund (online payment or COD with upfront payment)
      const requiresRefund = (order.paymentMethod !== 'cod' && 
                              order.paymentStatus === 'completed') ||
                             (order.paymentMethod === 'cod' && 
                              order.upfrontAmount > 0 && 
                              (order.paymentStatus === 'pending_upfront' || order.paymentStatus === 'completed'));

      // Approve cancellation
      const updateData = {
        orderStatus: 'cancelled',
        cancellationStatus: 'approved',
        cancelledBy: 'user',
        cancelledAt: new Date(),
        cancellationApprovedBy: req.user?.username || 'admin',
        cancellationApprovedAt: new Date()
      };

      // If refund required, set refund status to pending
      if (requiresRefund) {
        updateData.refundStatus = 'pending';
        if (order.paymentMethod === 'cod') {
          updateData.refundAmount = order.upfrontAmount; // Only refund upfront amount for COD
        } else {
          updateData.refundAmount = order.totalAmount; // Full amount for online payments
        }
        updateData.refundMethod = 'razorpay';
      }

      updatedOrder = await Order.findByIdAndUpdate(id, updateData, { new: true });

      // Deduct revenue from total revenue when order is cancelled
      try {
        const refundAmount = requiresRefund ? (order.paymentMethod === 'cod' ? order.upfrontAmount : order.totalAmount) : 0;
        await deductRevenueOnCancellation(id, refundAmount);
        console.log(`Revenue deducted for cancelled order ${id}: ₹${refundAmount}`);
      } catch (revenueError) {
        console.error('Error deducting revenue on cancellation:', revenueError);
      }

      // Restore stock for each product in the order
      for (const item of order.items) {
        if (item.productId) {
          const product = await Product.findById(item.productId);
          if (product) {
            product.stock = (product.stock || 0) + (item.quantity || 1);
            product.inStock = true;
            await product.save();
          }
        }
      }

      // Send cancellation confirmation email
      try {
        await sendOrderCancellationEmail(updatedOrder);
      } catch (emailError) {
        console.error('Error sending cancellation confirmation email:', emailError);
      }

      // If online payment, inform admin to process refund
      if (isOnlinePayment) {
        console.log(`Order ${id} approved for cancellation. Refund amount: ₹${order.totalAmount}. Admin needs to process refund.`);
      }

    } else if (action === 'reject') {
      // Reject cancellation
      updatedOrder = await Order.findByIdAndUpdate(
        id,
        {
          cancellationStatus: 'rejected',
          cancellationRejectionReason: rejectionReason || 'Admin rejected the cancellation request',
          cancellationApprovedBy: req.user?.username || 'admin',
          cancellationApprovedAt: new Date()
        },
        { new: true }
      );

      // Send rejection email
      try {
        await sendCancellationRejectionEmail(updatedOrder);
      } catch (emailError) {
        console.error('Error sending cancellation rejection email:', emailError);
      }
    } else {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid action. Use "approve" or "reject".' 
      });
    }

    res.json({
      success: true,
      message: `Cancellation request ${action}d successfully`,
      order: updatedOrder
    });

  } catch (error) {
    console.error('Error handling cancellation request:', error);
    res.status(500).json({ success: false, message: 'Error handling cancellation request' });
  }
};

// Send cancellation request email
const sendCancellationRequestEmail = async (order) => {
  const { email, customerName, items, totalAmount } = order;
  const subject = 'Your Rikocraft Order Cancellation Request Submitted';

  const itemsHtml = items.map(item => `
    <tr>
      <td style="padding: 8px; border: 1px solid #eee;">${item.name}</td>
      <td style="padding: 8px; border: 1px solid #eee; text-align: center;">${item.quantity}</td>
      <td style="padding: 8px; border: 1px solid #eee; text-align: right;">₹${item.price}</td>
    </tr>
  `).join('');

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
      <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #333; margin: 0; font-size: 24px;">Rikocraft</h1>
          <p style="color: #666; margin: 5px 0; font-size: 14px;">Where heritage meets craftsmanship</p>
        </div>
        <div style="margin-bottom: 25px;">
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0;">
            Dear <strong>${customerName}</strong>,
          </p>
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 15px 0;">
            We have received your cancellation request for your order. Our admin team will review your request and get back to you within 24 hours.
          </p>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr>
              <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Item</th>
              <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Qty</th>
              <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        <div style="text-align: right; margin-bottom: 20px;">
          <p style="font-size: 18px; font-weight: bold; color: #333;">
            Total: ₹${totalAmount}
          </p>
        </div>
        <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
          <p style="margin: 0; color: #856404; font-weight: bold;">Status: Cancellation Request Submitted</p>
          <p style="margin: 5px 0 0 0; color: #856404;">We will notify you once your request is reviewed.</p>
        </div>
        <div style="text-align: center; margin-top: 30px;">
          <p style="color: #666; font-size: 14px; margin: 0;">
            Thank you for choosing Rikocraft. We appreciate your patience!
          </p>
        </div>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject,
      html: htmlBody,
    });
    console.log(`Cancellation request email sent to ${email}`);
  } catch (mailErr) {
    console.error('Error sending cancellation request email:', mailErr);
  }
};

// Send cancellation rejection email
const sendCancellationRejectionEmail = async (order) => {
  const { email, customerName, items, totalAmount, cancellationRejectionReason } = order;
  const subject = 'Your Rikocraft Order Cancellation Request Update';

  const itemsHtml = items.map(item => `
    <tr>
      <td style="padding: 8px; border: 1px solid #eee;">${item.name}</td>
      <td style="padding: 8px; border: 1px solid #eee; text-align: center;">${item.quantity}</td>
      <td style="padding: 8px; border: 1px solid #eee; text-align: right;">₹${item.price}</td>
    </tr>
  `).join('');

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
      <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #333; margin: 0; font-size: 24px;">Rikocraft</h1>
          <p style="color: #666; margin: 5px 0; font-size: 14px;">Where heritage meets craftsmanship</p>
        </div>
        <div style="margin-bottom: 25px;">
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0;">
            Dear <strong>${customerName}</strong>,
          </p>
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 15px 0;">
            We have reviewed your cancellation request. Unfortunately, we cannot process the cancellation at this time.
          </p>
        </div>
        <div style="background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
          <p style="margin: 0; color: #721c24; font-weight: bold;">Cancellation Request: Rejected</p>
          <p style="margin: 5px 0 0 0; color: #721c24;">Reason: ${cancellationRejectionReason || 'Order is already being processed'}</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr>
              <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Item</th>
              <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Qty</th>
              <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        <div style="text-align: right; margin-bottom: 20px;">
          <p style="font-size: 18px; font-weight: bold; color: #333;">
            Total: ₹${totalAmount}
          </p>
        </div>
        <div style="text-align: center; margin-top: 30px;">
          <p style="color: #666; font-size: 14px; margin: 0;">
            Your order will continue to be processed as scheduled. Thank you for your understanding!
          </p>
        </div>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject,
      html: htmlBody,
    });
    console.log(`Cancellation rejection email sent to ${email}`);
  } catch (mailErr) {
    console.error('Error sending cancellation rejection email:', mailErr);
  }
};

// Send order cancellation email
const sendOrderCancellationEmail = async (order) => {
  const { email, customerName, items, totalAmount } = order;
  const subject = 'Your Rikocraft Order Has Been Cancelled';

  const itemsHtml = items.map(item => `
    <tr>
      <td style="padding: 8px; border: 1px solid #eee;">${item.name}</td>
      <td style="padding: 8px; border: 1px solid #eee; text-align: center;">${item.quantity}</td>
      <td style="padding: 8px; border: 1px solid #eee; text-align: right;">₹${item.price}</td>
    </tr>
  `).join('');

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
      <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #333; margin: 0; font-size: 24px;">Rikocraft</h1>
          <p style="color: #666; margin: 5px 0; font-size: 14px;">Where heritage meets craftsmanship</p>
        </div>
        <div style="margin-bottom: 25px;">
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0;">
            Dear <strong>${customerName}</strong>,
          </p>
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 15px 0;">
            Your order has been cancelled as requested. Here are the details:
          </p>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr>
              <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Item</th>
              <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Qty</th>
              <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        <div style="text-align: right; margin-bottom: 20px;">
          <p style="font-size: 18px; font-weight: bold; color: #333;">
            Total: ₹${totalAmount}
          </p>
        </div>
        <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
          <p style="margin: 0; color: #856404; font-weight: bold;">Order Status: Cancelled</p>
          <p style="margin: 5px 0 0 0; color: #856404;">Cancelled on: ${new Date().toLocaleDateString()}</p>
          ${order.paymentMethod !== 'cod' ? `
            <p style="margin: 10px 0 0 0; color: #856404; font-weight: bold;">Refund Information:</p>
            <p style="margin: 5px 0 0 0; color: #856404;">Your cancellation request has been approved. Refund will be processed by admin and credited to your original payment method.</p>
          ` : ''}
        </div>
        <div style="text-align: center; margin-top: 30px;">
          <p style="color: #666; font-size: 14px; margin: 0;">
            Thank you for choosing Rikocraft. We hope to serve you again soon!
          </p>
        </div>
      </div>
    </div>
  `;

  // Send email using your email service
  // This would integrate with your email service (Nodemailer, SendGrid, etc.)
  console.log('Cancellation email would be sent to:', email);
  console.log('Subject:', subject);
};

// Process refund for cancelled online payment order
const processRefund = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Validate order is eligible for refund
    if (order.orderStatus !== 'cancelled') {
      return res.status(400).json({ 
        success: false, 
        message: 'Only cancelled orders can be refunded' 
      });
    }

    // For COD orders, only refund if there was an upfront payment
    if (order.paymentMethod === 'cod' && (!order.upfrontAmount || order.upfrontAmount <= 0)) {
      return res.status(400).json({ 
        success: false, 
        message: 'COD orders without upfront payment do not require refund processing' 
      });
    }

    // For COD orders, check if upfront payment was made and payment was successful
    if (order.paymentMethod === 'cod') {
      // For COD orders, we need to check if upfront payment was actually made
      if (!order.upfrontAmount || order.upfrontAmount <= 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'COD orders without upfront payment do not require refund' 
        });
      }
      
      // Check if there's a valid transaction for the upfront payment
      if (!order.razorpayOrderId && !order.transactionId) {
        return res.status(400).json({ 
          success: false, 
          message: 'No payment transaction found for upfront amount' 
        });
      }
    } else {
      // For online payments, check if payment was completed
      if (order.paymentStatus !== 'completed') {
        return res.status(400).json({ 
          success: false, 
          message: 'Only paid orders can be refunded' 
        });
      }
    }

    // Additional validation for transaction IDs (already checked above for COD orders)
    if (order.paymentMethod !== 'cod' && !order.transactionId) {
      return res.status(400).json({ 
        success: false, 
        message: 'No transaction ID found for this order' 
      });
    }

    if (order.refundStatus === 'completed') {
      return res.status(400).json({ 
        success: false, 
        message: 'Refund already completed for this order' 
      });
    }

    if (order.refundStatus === 'processing') {
      return res.status(400).json({ 
        success: false, 
        message: 'Refund is already being processed' 
      });
    }

    // Generate unique merchant refund ID
    const merchantRefundId = `RF${Date.now()}${Math.random().toString(36).substr(2, 6)}`;

    // Update order refund status to processing
    await Order.findByIdAndUpdate(id, {
      refundStatus: 'processing',
      merchantRefundId: merchantRefundId,
      refundInitiatedAt: new Date()
    });

    // Import razorpay controller functions
    const razorpayController = require('./razorpayController');

    // Call Razorpay refund API
    try {
      // Calculate refund amount based on payment method
      let refundAmount;
      if (order.paymentMethod === 'cod') {
        // For COD orders, only refund the upfront amount
        refundAmount = order.upfrontAmount || 0;
      } else {
        // For online payments, refund the full amount
        refundAmount = order.refundAmount || order.totalAmount;
      }

      // Get payment ID from Razorpay order if not available in order
      let paymentId = order.razorpayPaymentId;
      
      if (!paymentId && order.razorpayOrderId) {
        try {
          // Fetch payment details from Razorpay using order ID
          const Razorpay = require('razorpay');
          const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET
          });
          
          const payments = await razorpay.orders.fetchPayments(order.razorpayOrderId);
          if (payments && payments.items && payments.items.length > 0) {
            paymentId = payments.items[0].id;
            console.log(`Found payment ID from Razorpay order: ${paymentId}`);
          }
        } catch (fetchError) {
          console.error('Error fetching payment ID from Razorpay:', fetchError);
        }
      }

      if (!paymentId) {
        return res.status(400).json({
          success: false,
          message: 'Payment ID not found. Cannot process refund without payment ID.'
        });
      }

      const refundData = {
        paymentId: paymentId,
        amount: refundAmount,
        reason: 'Customer requested refund'
      };

      // Process refund through Razorpay
      const refundResponse = await razorpayController.processRazorpayRefundInternal(
        refundData.paymentId, 
        refundData.amount, 
        refundData.reason
      );

      if (refundResponse.success) {
        // Update order with successful refund and deduct from revenue
        const updatedOrder = await Order.findByIdAndUpdate(
          id,
          {
            refundStatus: 'completed',
            refundTransactionId: refundResponse.data?.refundId || merchantRefundId,
            refundCompletedAt: new Date(),
            // Update revenue status to reflect refund
            revenueStatus: order.paymentMethod === 'cod' ? 'cancelled' : 'refunded'
          },
          { new: true }
        );

        // Deduct refund amount from total revenue
        await deductRevenueOnCancellation(id, refundAmount);

        // Send refund confirmation email
        try {
          await sendRefundConfirmationEmail(updatedOrder);
        } catch (emailError) {
          console.error('Error sending refund confirmation email:', emailError);
        }

        console.log(`Refund completed for order ${id}: ₹${refundAmount} deducted from revenue`);

        return res.json({
          success: true,
          message: 'Refund processed successfully',
          order: updatedOrder,
          refundDetails: refundResponse.data,
          refundAmount: refundAmount
        });
      } else {
        // Refund failed
        await Order.findByIdAndUpdate(id, {
          refundStatus: 'failed',
          refundFailedReason: refundResponse.message || 'Refund processing failed'
        });

        return res.status(500).json({
          success: false,
          message: refundResponse.message || 'Failed to process refund',
          error: refundResponse.error
        });
      }
    } catch (refundError) {
      console.error('Error processing refund:', refundError);

      // Update order with failed refund status
      await Order.findByIdAndUpdate(id, {
        refundStatus: 'failed',
        refundFailedReason: refundError.message || 'Refund processing error'
      });

      return res.status(500).json({
        success: false,
        message: 'Error processing refund',
        error: refundError.message
      });
    }

  } catch (error) {
    console.error('Error in processRefund:', error);
    return res.status(500).json({
      success: false,
      message: 'Error processing refund',
      error: error.message
    });
  }
};

// Send COD delivery confirmation email to customer
async function sendCODDeliveryConfirmationEmail(order) {
  const { email, customerName, items, totalAmount, address } = order;
  const subject = 'Your Rikocraft Order Delivered - Payment Successful';

  const itemsHtml = items.map(item => `
    <tr>
      <td style="padding: 8px; border: 1px solid #eee;">${item.text || item.name || 'Custom Item'}</td>
      <td style="padding: 8px; border: 1px solid #eee; text-align: center;">${item.quantity || 1}</td>
      <td style="padding: 8px; border: 1px solid #eee; text-align: right;">₹${item.price || 0}</td>
    </tr>
  `).join('');

  const addressHtml = `
    <div style="margin-bottom: 10px;">
      <strong>Delivery Address:</strong><br/>
      ${address.street || ''}<br/>
      ${address.city || ''}, ${address.state || ''} - ${address.pincode || ''}<br/>
      ${address.country || ''}
    </div>
  `;

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
      <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #333; margin: 0; font-size: 24px;">Rikocraft</h1>
          <p style="color: #666; margin: 5px 0; font-size: 14px;">Where heritage meets craftsmanship</p>
        </div>
        <div style="margin-bottom: 25px;">
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0;">
            Dear <strong>${customerName}</strong>,
          </p>
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 15px 0;">
            Great news! Your order has been successfully delivered and payment has been received. Thank you for your purchase!
          </p>
        </div>
        <div style="background-color: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
          <p style="margin: 0; color: #155724; font-weight: bold;">✅ Order Delivered & Payment Successful</p>
          <p style="margin: 5px 0 0 0; color: #155724;">Payment Method: Cash on Delivery</p>
          <p style="margin: 5px 0 0 0; color: #155724;">Amount Received: ₹${totalAmount}</p>
        </div>
        ${addressHtml}
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr>
              <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Item</th>
              <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Qty</th>
              <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        <div style="text-align: right; margin-bottom: 20px;">
          <strong>Total Paid: ₹${totalAmount}</strong>
        </div>
        <div style="margin: 25px 0;">
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0;">
            We hope you love your purchase! If you have any questions or need assistance, please don't hesitate to contact us.
          </p>
        </div>
        <div style="text-align: center; margin-top: 30px;">
          <p style="color: #666; font-size: 14px; margin: 0;">
            Thank you for choosing Rikocraft! We look forward to serving you again.
          </p>
        </div>
        <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
          <p style="color: #666; font-size: 14px; margin: 0; line-height: 1.6;">
            <strong>Warm regards,</strong><br>
            Team Rikocraft
          </p>
          <div style="margin-top: 15px; color: #666; font-size: 12px;">
            <p style="margin: 5px 0;">🌐 www.rikocraft.com</p>
            <p style="margin: 5px 0;">📩 Email: Care@Rikocraft.com</p>
          </div>
        </div>
      </div>
    </div>
  `;

  const textBody = `Dear ${customerName},\n\nGreat news! Your order has been successfully delivered and payment has been received.\n\nOrder Summary:\n${items.map(item => `- ${item.name} x${item.quantity} (₹${item.price})`).join('\n')}\nTotal Paid: ₹${totalAmount}\n\nPayment Method: Cash on Delivery\nAmount Received: ₹${totalAmount}\n\nDelivery Address:\n${address.street || ''}\n${address.city || ''}, ${address.state || ''} - ${address.pincode || ''}\n${address.country || ''}\n\nThank you for choosing Rikocraft!\n\nWarm regards,\nTeam Rikocraft\nwww.rikocraft.com\nCare@Rikocraft.com`;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject,
      text: textBody,
      html: htmlBody,
    });
    console.log(`COD delivery confirmation email sent to ${email}`);
  } catch (mailErr) {
    console.error('Error sending COD delivery confirmation email:', mailErr);
  }
}

// Send refund confirmation email
async function sendRefundConfirmationEmail(order) {
  const { email, customerName, items, totalAmount, refundAmount, refundTransactionId } = order;
  const subject = 'Your Rikocraft Order Refund Confirmation';

  const itemsHtml = items.map(item => `
    <tr>
      <td style="padding: 8px; border: 1px solid #eee;">${item.text || item.name || 'Custom Item'}</td>
      <td style="padding: 8px; border: 1px solid #eee; text-align: center;">${item.quantity || 1}</td>
      <td style="padding: 8px; border: 1px solid #eee; text-align: right;">₹${item.price || 0}</td>
    </tr>
  `).join('');

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
      <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #333; margin: 0; font-size: 24px;">Rikocraft</h1>
          <p style="color: #666; margin: 5px 0; font-size: 14px;">Where heritage meets craftsmanship</p>
        </div>
        <div style="margin-bottom: 25px;">
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0;">
            Dear <strong>${customerName}</strong>,
          </p>
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 15px 0;">
            Your refund has been processed successfully! The amount has been credited to your original payment method.
          </p>
        </div>
        <div style="background-color: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
          <p style="margin: 0; color: #155724; font-weight: bold;">✓ Refund Completed</p>
          <p style="margin: 5px 0 0 0; color: #155724;">Refund Amount: ₹${refundAmount || totalAmount}</p>
          <p style="margin: 5px 0 0 0; color: #155724; font-size: 12px;">Refund ID: ${refundTransactionId || 'Processing'}</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr>
              <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Item</th>
              <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Qty</th>
              <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        <div style="text-align: right; margin-bottom: 20px;">
          <p style="font-size: 18px; font-weight: bold; color: #333;">
            Refund Amount: ₹${refundAmount || totalAmount}
          </p>
        </div>
        <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
          <p style="margin: 0; color: #856404; font-weight: bold;">⏱ Processing Time</p>
          <p style="margin: 5px 0 0 0; color: #856404;">The refund will reflect in your account within 5-7 business days depending on your bank.</p>
        </div>
        <div style="text-align: center; margin-top: 30px;">
          <p style="color: #666; font-size: 14px; margin: 0;">
            Thank you for shopping with Rikocraft. We hope to serve you again soon!
          </p>
        </div>
        <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
          <p style="color: #666; font-size: 14px; margin: 0; line-height: 1.6;">
            <strong>Warm regards,</strong><br>
            Team Rikocraft
          </p>
          <div style="margin-top: 15px; color: #666; font-size: 12px;">
            <p style="margin: 5px 0;">🌐 www.rikocraft.com</p>
            <p style="margin: 5px 0;">📩 Email: Care@Rikocraft.com</p>
          </div>
        </div>
      </div>
    </div>
  `;

  const textBody = `Dear ${customerName},\n\nYour refund has been processed successfully!\n\nRefund Amount: ₹${refundAmount || totalAmount}\nRefund ID: ${refundTransactionId || 'Processing'}\n\nThe amount will be credited to your original payment method within 5-7 business days.\n\nOrder Details:\n${items.map(item => `- ${item.name} x${item.quantity} (₹${item.price})`).join('\n')}\n\nThank you for shopping with Rikocraft!\n\nWarm regards,\nTeam Rikocraft\nwww.rikocraft.com\nCare@Rikocraft.com`;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject,
      text: textBody,
      html: htmlBody,
    });
    console.log(`Refund confirmation email sent to ${email}`);
  } catch (mailErr) {
    console.error('Error sending refund confirmation email:', mailErr);
  }
}

// Update revenue status when payment is completed (for online payments)
const updateRevenueOnPaymentComplete = async (orderId, transactionId) => {
  try {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    // Only update for online payments
    if (order.paymentMethod !== 'cod') {
      order.revenueStatus = 'confirmed'; // Directly confirmed for online payments
      order.revenueAmount = order.totalAmount - (order.commission || 0);
      order.revenueEarnedAt = new Date();
      order.revenueConfirmedAt = new Date(); // Add confirmation timestamp
      order.transactionId = transactionId;
      order.adminReceivedAmount = order.revenueAmount;
      
      await order.save();
      
      console.log(`Revenue confirmed for online order ${orderId}: ₹${order.revenueAmount}`);
    }
    
    return order;
  } catch (error) {
    console.error('Error updating revenue on payment complete:', error);
    throw error;
  }
};

// Update revenue status when COD order is delivered
const updateRevenueOnDelivery = async (orderId) => {
  try {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    // Only update for COD orders
    if (order.paymentMethod === 'cod') {
      order.revenueStatus = 'earned';
      order.revenueAmount = order.totalAmount - (order.commission || 0);
      order.revenueEarnedAt = new Date();
      // Update payment status to completed for COD orders when delivered
      order.paymentStatus = 'completed';
      
      await order.save();
      
      console.log(`Revenue earned for COD order ${orderId}: ₹${order.revenueAmount}`);
      
      // Send delivery confirmation email to customer
      try {
        await sendCODDeliveryConfirmationEmail(order);
      } catch (emailError) {
        console.error('Error sending COD delivery confirmation email:', emailError);
      }
    }
    
    return order;
  } catch (error) {
    console.error('Error updating revenue on delivery:', error);
    throw error;
  }
};

// User requests COD order cancellation
const requestCODCancellation = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.paymentMethod !== 'cod') {
      return res.status(400).json({ 
        success: false, 
        message: 'Only COD orders can be cancelled through this endpoint' 
      });
    }

    if (order.orderStatus === 'delivered') {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot cancel delivered orders' 
      });
    }

    if (order.cancellationStatus === 'requested') {
      return res.status(400).json({ 
        success: false, 
        message: 'Cancellation already requested for this order' 
      });
    }

    // Update order with cancellation request
    order.cancellationRequested = true;
    order.cancellationReason = reason;
    order.cancellationRequestedAt = new Date();
    order.cancellationStatus = 'requested';
    order.cancelledBy = 'user';

    await order.save();

    res.status(200).json({
      success: true,
      message: 'Cancellation request submitted successfully',
      order: order
    });
  } catch (error) {
    console.error('Error requesting COD cancellation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to request cancellation',
      error: error.message
    });
  }
};

// Admin approves COD cancellation and processes refund
const approveCODCancellation = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'approve' or 'reject'
    const { rejectionReason } = req.body;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.cancellationStatus !== 'requested') {
      return res.status(400).json({ 
        success: false, 
        message: 'No pending cancellation request for this order' 
      });
    }

    if (action === 'approve') {
      // Approve cancellation
      order.cancellationStatus = 'approved';
      order.cancellationApprovedBy = req.user?.username || 'admin';
      order.cancellationApprovedAt = new Date();
      order.orderStatus = 'cancelled';
      order.cancelledAt = new Date();

      // Process refund for upfront amount if exists
      if (order.upfrontAmount > 0) {
        order.refundStatus = 'pending';
        order.refundAmount = order.upfrontAmount;
        order.refundInitiatedAt = new Date();
      }

      // Update revenue status
      order.revenueStatus = 'cancelled';
      order.revenueAmount = 0;
      order.adminReceivedAmount = 0;

      await order.save();

      res.status(200).json({
        success: true,
        message: 'Order cancellation approved successfully',
        refundRequired: order.upfrontAmount > 0,
        refundAmount: order.upfrontAmount,
        order: order
      });
    } else if (action === 'reject') {
      // Reject cancellation
      order.cancellationStatus = 'rejected';
      order.cancellationApprovedBy = req.user?.username || 'admin';
      order.cancellationApprovedAt = new Date();
      order.cancellationRejectionReason = rejectionReason;

      await order.save();

      res.status(200).json({
        success: true,
        message: 'Order cancellation rejected',
        order: order
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Use "approve" or "reject"'
      });
    }
  } catch (error) {
    console.error('Error processing COD cancellation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process cancellation',
      error: error.message
    });
  }
};

// Admin confirms COD payment receipt
const confirmCODReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    const { confirmedAmount } = req.body;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.paymentMethod !== 'cod') {
      return res.status(400).json({ 
        success: false, 
        message: 'Only COD orders can be confirmed' 
      });
    }

    if (order.orderStatus !== 'delivered') {
      return res.status(400).json({ 
        success: false, 
        message: 'Order must be delivered before confirming payment' 
      });
    }

    if (order.revenueStatus !== 'earned') {
      return res.status(400).json({ 
        success: false, 
        message: 'Order revenue must be earned before confirming' 
      });
    }

    // Update revenue status to confirmed
    order.revenueStatus = 'confirmed';
    
    // For COD with upfront payment, total revenue should be product amount, not product + upfront
    if (order.upfrontAmount > 0) {
      // Total revenue is the product amount, upfront is already included
      order.adminReceivedAmount = order.totalAmount; // Full product amount
    } else {
      order.adminReceivedAmount = parseFloat(confirmedAmount) || order.revenueAmount;
    }
    
    order.revenueConfirmedAt = new Date();
    order.codConfirmedBy = req.user?.username || 'admin';
    order.codConfirmedAt = new Date();
    // Update payment status to completed when admin confirms revenue
    order.paymentStatus = 'completed';

    await order.save();

    // Send confirmation email to customer
    try {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: order.email,
        subject: 'Payment Confirmation - Rikocraft',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Payment Confirmed - Rikocraft</h2>
            <p>Dear ${order.customerName},</p>
            <p>We have successfully confirmed the receipt of your payment for order <strong>#${order._id}</strong>.</p>
            
            <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #1e40af; margin-top: 0;">Order Details:</h3>
              <p><strong>Order ID:</strong> ${order._id}</p>
              <p><strong>Payment Method:</strong> Cash on Delivery</p>
              <p><strong>Confirmed Amount:</strong> ₹${order.adminReceivedAmount}</p>
              <p><strong>Confirmed Date:</strong> ${order.revenueConfirmedAt.toLocaleDateString('en-IN')}</p>
            </div>
            
            <p>Thank you for your business with Rikocraft!</p>
            <p>Best regards,<br>Rikocraft Team</p>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      console.log(`COD confirmation email sent to ${order.email}`);
    } catch (emailError) {
      console.error('Error sending COD confirmation email:', emailError);
    }

    res.json({
      success: true,
      message: 'COD payment confirmed successfully',
      order
    });

  } catch (error) {
    console.error('Error confirming COD receipt:', error);
    res.status(500).json({
      success: false,
      message: 'Error confirming COD receipt',
      error: error.message
    });
  }
};

// Deduct revenue when order is cancelled/refunded
const deductRevenueOnCancellation = async (orderId, refundAmount = null) => {
  try {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    // For COD orders, clear pending revenue when cancelled
    if (order.paymentMethod === 'cod') {
      order.revenueStatus = 'cancelled';
      order.revenueAmount = 0;
      order.adminReceivedAmount = 0;
      order.paymentStatus = 'failed'; // Mark payment as failed for cancelled COD
    } else {
      // For online payments, keep revenue status as earned until refund is actually processed
      // Don't change revenueStatus here - it will be updated when refund is actually processed
      order.refundAmount = refundAmount || order.revenueAmount;
    }
    
    await order.save();
    
    console.log(`Revenue cleared for ${order.paymentMethod} order ${orderId}: ₹${order.paymentMethod === 'cod' ? 0 : order.refundAmount}`);
    
    return order;
  } catch (error) {
    console.error('Error deducting revenue on cancellation:', error);
    throw error;
  }
};

// Get comprehensive revenue analytics
const getRevenueAnalytics = async (req, res) => {
  try {
    const { period = 'monthly' } = req.query;
    
    let dateFilter = {};
    const now = new Date();
    
    switch (period) {
      case 'daily':
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        dateFilter = { createdAt: { $gte: startOfDay } };
        break;
      case 'monthly':
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        dateFilter = { createdAt: { $gte: startOfMonth } };
        break;
      case 'yearly':
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        dateFilter = { createdAt: { $gte: startOfYear } };
        break;
    }

    const orders = await Order.find(dateFilter);
    
    // Calculate revenue breakdown
    const revenueBreakdown = {
      pending: { amount: 0, count: 0, description: 'Orders placed but revenue not yet recognized' },
      earned: { amount: 0, count: 0, description: 'Revenue recognized (Online: Payment completed, COD: Delivered)' },
      confirmed: { amount: 0, count: 0, description: 'Amount received in admin account' },
      cancelled: { amount: 0, count: 0, description: 'Cancelled COD orders' },
      refunded: { amount: 0, count: 0, description: 'Refunded online payments' }
    };

    let totalRevenue = 0;
    let totalDeductions = 0;

    orders.forEach(order => {
      const amount = order.revenueAmount || order.totalAmount;
      
      switch (order.revenueStatus) {
        case 'pending':
          revenueBreakdown.pending.amount += amount;
          revenueBreakdown.pending.count++;
          break;
        case 'earned':
          revenueBreakdown.earned.amount += amount;
          revenueBreakdown.earned.count++;
          totalRevenue += amount;
          break;
        case 'confirmed':
          revenueBreakdown.confirmed.amount += amount;
          revenueBreakdown.confirmed.count++;
          totalRevenue += amount;
          break;
        case 'cancelled':
          revenueBreakdown.cancelled.amount += amount;
          revenueBreakdown.cancelled.count++;
          totalDeductions += amount;
          break;
        case 'refunded':
          revenueBreakdown.refunded.amount += order.refundAmount || amount;
          revenueBreakdown.refunded.count++;
          totalDeductions += order.refundAmount || amount;
          break;
      }
    });

    const netRevenue = totalRevenue - totalDeductions;

    res.json({
      success: true,
      data: {
        period,
        totalOrders: orders.length,
        netRevenue,
        totalRevenue,
        totalDeductions,
        revenueBreakdown,
        paymentMethodBreakdown: {
          online: orders.filter(o => o.paymentMethod !== 'cod').length,
          cod: orders.filter(o => o.paymentMethod === 'cod').length
        }
      }
    });

  } catch (error) {
    console.error('Error getting revenue analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting revenue analytics',
      error: error.message
    });
  }
};

// Get order tracking information
const getOrderTracking = async (req, res) => {
  try {
    const { id } = req.params;
    
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    // Get order timeline
    const timeline = getOrderTimeline(order);
    
    res.json({
      success: true,
      order: {
        _id: order._id,
        orderStatus: order.orderStatus,
        trackingNumber: order.trackingNumber,
        courierProvider: order.courierProvider,
        courierTrackingUrl: order.courierTrackingUrl,
        estimatedDeliveryDate: order.estimatedDeliveryDate,
        actualDeliveryDate: order.actualDeliveryDate,
        deliveryNotes: order.deliveryNotes,
        timeline
      }
    });
  } catch (error) {
    console.error('Error getting order tracking:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting order tracking information',
      error: error.message
    });
  }
};

// Request order return
const requestOrderReturn = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Return reason is required'
      });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    // Check if order is eligible for return
    if (order.orderStatus !== 'delivered') {
      return res.status(400).json({
        success: false,
        message: 'Only delivered orders can be returned'
      });
    }

    if (order.returnRequested) {
      return res.status(400).json({
        success: false,
        message: 'Return request already submitted for this order'
      });
    }

    // Update order with return request
    order.returnRequested = true;
    order.returnReason = reason;
    order.returnRequestedAt = new Date();
    order.returnStatus = 'requested';

    await order.save();

    // Send return request email to admin
    try {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER, // Admin email
        subject: `Return Request - Order #${order._id}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #dc2626;">Return Request Received</h2>
            <p>Customer <strong>${order.customerName}</strong> has requested a return for order <strong>#${order._id}</strong>.</p>
            
            <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #1e40af; margin-top: 0;">Order Details:</h3>
              <p><strong>Order ID:</strong> ${order._id}</p>
              <p><strong>Customer:</strong> ${order.customerName} (${order.email})</p>
              <p><strong>Total Amount:</strong> ₹${order.totalAmount}</p>
              <p><strong>Return Reason:</strong> ${reason}</p>
              <p><strong>Requested Date:</strong> ${new Date().toLocaleDateString('en-IN')}</p>
            </div>
            
            <p>Please review and approve/reject this return request from the admin panel.</p>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      console.log(`Return request email sent for order ${order._id}`);
    } catch (emailError) {
      console.error('Error sending return request email:', emailError);
    }

    res.json({
      success: true,
      message: 'Return request submitted successfully. Admin will review and respond within 24 hours.',
      order: {
        _id: order._id,
        returnStatus: order.returnStatus,
        returnRequestedAt: order.returnRequestedAt
      }
    });
  } catch (error) {
    console.error('Error requesting order return:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting return request',
      error: error.message
    });
  }
};

// Generate and download invoice
const generateInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    // Increment download count
    order.invoiceDownloadCount = (order.invoiceDownloadCount || 0) + 1;
    await order.save();

    // Generate invoice HTML
    const invoiceHtml = generateInvoiceHtml(order);
    
    // Set headers for PDF download
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `inline; filename="invoice-${order.invoiceNumber}.html"`);
    
    res.send(invoiceHtml);
  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating invoice',
      error: error.message
    });
  }
};

// Generate invoice HTML
function generateInvoiceHtml(order) {
  const orderDate = new Date(order.createdAt).toLocaleDateString('en-IN');
  const deliveryDate = order.actualDeliveryDate ? 
    new Date(order.actualDeliveryDate).toLocaleDateString('en-IN') : 
    'Not delivered yet';

  const itemsHtml = order.items.map(item => `
    <tr>
      <td style="padding: 12px; border: 1px solid #e5e7eb; text-align: left;">${item.name}</td>
      <td style="padding: 12px; border: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
      <td style="padding: 12px; border: 1px solid #e5e7eb; text-align: right;">₹${item.price}</td>
      <td style="padding: 12px; border: 1px solid #e5e7eb; text-align: right;">₹${item.price * item.quantity}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Invoice - ${order.invoiceNumber}</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          margin: 0;
          padding: 20px;
          background-color: #f9fafb;
          color: #374151;
        }
        .invoice-container {
          max-width: 800px;
          margin: 0 auto;
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }
        .header {
          background: linear-gradient(135deg, #8f3a61 0%, #a855f7 100%);
          color: white;
          padding: 40px;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 2.5rem;
          font-weight: 700;
        }
        .header p {
          margin: 8px 0 0 0;
          font-size: 1.1rem;
          opacity: 0.9;
        }
        .content {
          padding: 40px;
        }
        .invoice-details {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          margin-bottom: 40px;
        }
        .detail-section h3 {
          color: #8f3a61;
          margin-bottom: 16px;
          font-size: 1.2rem;
          border-bottom: 2px solid #f3f4f6;
          padding-bottom: 8px;
        }
        .detail-section p {
          margin: 8px 0;
          line-height: 1.6;
        }
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin: 30px 0;
          background: white;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        .items-table th {
          background: #8f3a61;
          color: white;
          padding: 16px 12px;
          text-align: left;
          font-weight: 600;
        }
        .items-table td {
          padding: 12px;
          border: 1px solid #e5e7eb;
        }
        .items-table tr:nth-child(even) {
          background-color: #f9fafb;
        }
        .total-section {
          background: #f8fafc;
          padding: 24px;
          border-radius: 8px;
          margin-top: 30px;
        }
        .total-row {
          display: flex;
          justify-content: space-between;
          margin: 8px 0;
          font-size: 1.1rem;
        }
        .total-row.final {
          font-weight: 700;
          font-size: 1.3rem;
          color: #8f3a61;
          border-top: 2px solid #e5e7eb;
          padding-top: 16px;
          margin-top: 16px;
        }
        .footer {
          background: #f3f4f6;
          padding: 30px 40px;
          text-align: center;
          color: #6b7280;
        }
        .status-badge {
          display: inline-block;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 0.9rem;
          font-weight: 600;
          text-transform: uppercase;
        }
        .status-processing { background: #fef3c7; color: #92400e; }
        .status-confirmed { background: #dbeafe; color: #1e40af; }
        .status-manufacturing { background: #e9d5ff; color: #6b21a8; }
        .status-shipped { background: #e0e7ff; color: #3730a3; }
        .status-delivered { background: #d1fae5; color: #065f46; }
        .status-cancelled { background: #fee2e2; color: #991b1b; }
        @media print {
          body { background: white; }
          .invoice-container { box-shadow: none; }
        }
      </style>
    </head>
    <body>
      <div class="invoice-container">
        <div class="header">
          <h1>Rikocraft</h1>
          <p>Where heritage meets craftsmanship</p>
        </div>
        
        <div class="content">
          <div class="invoice-details">
            <div class="detail-section">
              <h3>Invoice Details</h3>
              <p><strong>Invoice Number:</strong> ${order.invoiceNumber}</p>
              <p><strong>Order ID:</strong> ${order._id}</p>
              <p><strong>Order Date:</strong> ${orderDate}</p>
              <p><strong>Delivery Date:</strong> ${deliveryDate}</p>
              <p><strong>Status:</strong> 
                <span class="status-badge status-${order.orderStatus}">${order.orderStatus}</span>
              </p>
            </div>
            
            <div class="detail-section">
              <h3>Customer Details</h3>
              <p><strong>Name:</strong> ${order.customerName}</p>
              <p><strong>Email:</strong> ${order.email}</p>
              <p><strong>Phone:</strong> ${order.phone}</p>
              <p><strong>Address:</strong><br>
                ${order.address.street}<br>
                ${order.address.city}, ${order.address.state} - ${order.address.pincode}<br>
                ${order.address.country}
              </p>
            </div>
          </div>
          
          <table class="items-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Quantity</th>
                <th>Unit Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          
          <div class="total-section">
            <div class="total-row">
              <span>Subtotal:</span>
              <span>₹${order.totalAmount}</span>
            </div>
            <div class="total-row">
              <span>Shipping:</span>
              <span>₹0</span>
            </div>
            <div class="total-row">
              <span>Payment Method:</span>
              <span>${order.paymentMethod.toUpperCase()}</span>
            </div>
            ${order.couponCode ? `
            <div class="total-row">
              <span>Coupon Applied:</span>
              <span>${order.couponCode}</span>
            </div>
            ` : ''}
            <div class="total-row final">
              <span>Total Amount:</span>
              <span>₹${order.totalAmount}</span>
            </div>
          </div>
        </div>
        
        <div class="footer">
          <p><strong>Thank you for your business!</strong></p>
          <p>For any queries, contact us at care@rikocraft.com</p>
          <p>This is a computer-generated invoice.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

module.exports = {
  createOrder,
  getOrdersByEmail,
  getOrderById,
  sendOrderStatusUpdateEmail,
  getSalesAnalytics,
  getStockSummary,
  requestOrderCancellation,
  handleCancellationRequest,
  processRefund,
  updateRevenueOnPaymentComplete,
  updateRevenueOnDelivery,
  requestCODCancellation,
  approveCODCancellation,
  confirmCODReceipt,
  deductRevenueOnCancellation,
  getRevenueAnalytics,
  getOrderTracking,
  requestOrderReturn,
  generateInvoice
}; 
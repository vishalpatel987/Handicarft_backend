// File: admin/backend/routes/orders.js
const express = require("express");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { createOrder, getOrdersByEmail, getOrderById, sendOrderStatusUpdateEmail, getSalesAnalytics, getStockSummary, requestOrderCancellation, handleCancellationRequest, processRefund, updateRevenueOnPaymentComplete, updateRevenueOnDelivery, requestCODCancellation, approveCODCancellation, confirmCODReceipt, deductRevenueOnCancellation, getRevenueAnalytics, getOrderTracking, requestOrderReturn, generateInvoice } = require('../controllers/orderController');
const { authenticateToken, isAdmin } = require('../middleware/auth');

const ordersFilePath = path.join(__dirname, '../data/orders.json');

// Helper function to read orders from JSON file
const readOrders = () => {
  try {
    if (fs.existsSync(ordersFilePath)) {
      const data = fs.readFileSync(ordersFilePath, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('Error reading orders file:', error);
    return [];
  }
};

// Helper function to write orders to JSON file
const writeOrders = (orders) => {
  try {
    const dirPath = path.dirname(ordersFilePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    fs.writeFileSync(ordersFilePath, JSON.stringify(orders, null, 2));
  } catch (error) {
    console.error('Error writing orders file:', error);
    throw new Error('Failed to save order to JSON file');
  }
};

// Admin: Get all orders from MongoDB (not orders.json) - PROTECTED
router.get('/json', authenticateToken, isAdmin, async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json({ success: true, orders });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch orders from MongoDB', error: error.message });
  }
});

// Create order
router.post("/", createOrder);

// Update order status - PROTECTED
router.put("/:id/status", authenticateToken, isAdmin, async (req, res) => {
  try {
    // Check database connection with retry logic
    if (mongoose.connection.readyState !== 1) {
      console.log(`Database connection state: ${mongoose.connection.readyState}`);
      
      // Try to reconnect if disconnected
      if (mongoose.connection.readyState === 0) {
        try {
          await mongoose.connect(process.env.MONGODB_URI);
          console.log('Database reconnected successfully');
        } catch (reconnectError) {
          console.error('Failed to reconnect to database:', reconnectError);
          return res.status(503).json({
            success: false,
            message: 'Database temporarily unavailable. Please try again in a moment.',
            error: 'DATABASE_UNAVAILABLE'
          });
        }
      } else {
        return res.status(503).json({
          success: false,
          message: 'Database temporarily unavailable. Please try again in a moment.',
          error: 'DATABASE_UNAVAILABLE'
        });
      }
    }

    const { id } = req.params;
    const { orderStatus } = req.body;

    // Validate status
    if (!['processing', 'confirmed', 'manufacturing', 'shipped', 'delivered', 'cancelled'].includes(orderStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid order status' });
    }

    // Get current order to calculate revenue
    const currentOrder = await Order.findById(id);
    if (!currentOrder) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Check if order is cancelled - prevent status changes
    if (currentOrder.cancellationStatus === 'approved') {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot update status of cancelled orders. Order has been cancelled and cannot be modified.' 
      });
    }

    // Determine revenue status based on order status
    let revenueStatus = 'pending';
    let revenueAmount = 0;
    let adminReceivedAmount = 0;
    let paymentStatus = currentOrder.paymentStatus;
    
    // Revenue calculation based on payment method and order status
    if (orderStatus === 'delivered') {
      if (currentOrder.paymentMethod === 'cod') {
        // For COD orders, revenue is earned on delivery and payment status becomes completed
        revenueStatus = 'earned';
        revenueAmount = currentOrder.totalAmount || 0;
        adminReceivedAmount = revenueAmount; // Full amount to admin
        // Update payment status to completed for COD orders when delivered
        paymentStatus = 'completed';
      } else {
        // For online payments, revenue is already earned when payment was completed
        revenueStatus = 'earned';
        revenueAmount = currentOrder.totalAmount || 0;
        adminReceivedAmount = revenueAmount; // Full amount to admin
      }
    } else if (orderStatus === 'cancelled') {
      if (currentOrder.paymentMethod === 'cod') {
        // For COD orders, clear pending revenue when cancelled
        revenueStatus = 'cancelled';
        revenueAmount = 0;
        adminReceivedAmount = 0;
        paymentStatus = 'failed';
      } else {
        // For online payments, keep as pending until refund is processed
        revenueStatus = 'pending';
        revenueAmount = 0;
        adminReceivedAmount = 0;
      }
    } else if (currentOrder.paymentMethod === 'online' && currentOrder.paymentStatus === 'completed') {
      // For online payments, revenue is confirmed immediately when payment is completed
      if (orderStatus === 'processing' || orderStatus === 'confirmed' || orderStatus === 'manufacturing' || orderStatus === 'shipped' || orderStatus === 'delivered') {
        revenueStatus = 'confirmed'; // Directly confirmed for online payments
        revenueAmount = currentOrder.totalAmount || 0;
        adminReceivedAmount = revenueAmount; // Full amount to admin
      }
    } else if (currentOrder.paymentMethod === 'cod') {
      // For COD orders, revenue handling based on upfront payment
      if (orderStatus === 'processing' || orderStatus === 'confirmed' || orderStatus === 'manufacturing' || orderStatus === 'shipped') {
        if (currentOrder.upfrontAmount > 0) {
          // COD with upfront payment - keep upfront amount as confirmed
          revenueStatus = 'pending';
          revenueAmount = currentOrder.upfrontAmount;
          adminReceivedAmount = currentOrder.upfrontAmount;
        } else {
          // COD without upfront payment
          revenueStatus = 'pending';
          revenueAmount = 0;
          adminReceivedAmount = 0;
        }
      } else if (orderStatus === 'delivered') {
        if (currentOrder.upfrontAmount > 0) {
          // COD with upfront payment - full amount earned on delivery
          revenueStatus = 'earned';
          revenueAmount = currentOrder.totalAmount || 0; // Total product amount
          adminReceivedAmount = currentOrder.upfrontAmount; // Keep upfront amount confirmed
          paymentStatus = 'completed'; // Set payment status to completed on delivery for COD
        } else {
          // COD without upfront payment - full amount earned on delivery
          revenueStatus = 'earned';
          revenueAmount = currentOrder.totalAmount || 0;
          adminReceivedAmount = 0; // Will be set when admin confirms
          paymentStatus = 'completed'; // Set payment status to completed on delivery for COD
        }
      }
    }

    // Update in MongoDB
    const updatedOrder = await Order.findByIdAndUpdate(
      id,
      { 
        orderStatus,
        paymentStatus: paymentStatus || currentOrder.paymentStatus,
        revenueStatus,
        revenueAmount,
        adminReceivedAmount
      },
      { new: true, runValidators: true }
    );

    if (!updatedOrder) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Send response first to avoid timeout
    res.json({ success: true, order: updatedOrder });

    // Update in JSON file (non-blocking)
    try {
      const orders = readOrders();
      const orderIndex = orders.findIndex(order => order._id.toString() === id);
      if (orderIndex !== -1) {
        orders[orderIndex] = updatedOrder.toObject({ virtuals: true });
        writeOrders(orders);
      }
    } catch (jsonError) {
      console.error('JSON file update error (non-critical):', jsonError);
    }

    // Send status update email (non-blocking)
    sendOrderStatusUpdateEmail(updatedOrder).catch(err => console.error('Order status update email error:', err));
  } catch (error) {
    console.error('Error updating order status:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid order status',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }
    res.status(500).json({ 
      success: false,
      message: 'Failed to update order status',
      error: error.message 
    });
  }
});

// General order update endpoint - PROTECTED
router.put("/:id", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Validate orderStatus if provided
    if (updateData.orderStatus && !['processing', 'confirmed', 'manufacturing', 'shipped', 'delivered', 'cancelled'].includes(updateData.orderStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid order status' });
    }

    // Validate paymentStatus if provided
    if (updateData.paymentStatus && !['pending', 'completed', 'failed'].includes(updateData.paymentStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid payment status' });
    }

    // Get current order to check cancellation status
    const currentOrder = await Order.findById(id);
    if (!currentOrder) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Check if order is cancelled - prevent any updates
    if (currentOrder.cancellationStatus === 'approved') {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot update cancelled orders. Order has been cancelled and cannot be modified.' 
      });
    }

    // Update in MongoDB
    const updatedOrder = await Order.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedOrder) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Send response first to avoid timeout
    res.json({ success: true, order: updatedOrder });

    // Update in JSON file (non-blocking)
    try {
      const orders = readOrders();
      const orderIndex = orders.findIndex(order => order._id.toString() === id);
      if (orderIndex !== -1) {
        orders[orderIndex] = updatedOrder.toObject({ virtuals: true });
        writeOrders(orders);
      }
    } catch (jsonError) {
      console.error('JSON file update error (non-critical):', jsonError);
    }
  } catch (error) {
    console.error('Error updating order:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid order data',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }
    res.status(500).json({ 
      success: false,
      message: 'Failed to update order',
      error: error.message 
    });
  }
});

// Route to get all orders for a user by email
// GET /api/orders?email=user@example.com
router.get('/', getOrdersByEmail);

// Route to get a single order by its ID
// GET /api/orders/:id
router.get('/:id', getOrderById);

// Admin: Get sales analytics - TEMPORARILY UNPROTECTED FOR TESTING
router.get('/analytics/sales', getSalesAnalytics);

// Admin: Get stock summary with low stock alerts - TEMPORARILY UNPROTECTED FOR TESTING
router.get('/analytics/stock', getStockSummary);

// Confirm revenue (Admin only) - PROTECTED
router.put("/:id/confirm-revenue", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { adminReceivedAmount } = req.body;

    // Get current order
    const currentOrder = await Order.findById(id);
    if (!currentOrder) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Check if order is cancelled - prevent revenue confirmation
    if (currentOrder.cancellationStatus === 'approved') {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot confirm revenue for cancelled orders.' 
      });
    }

    // Only allow confirming revenue for delivered orders
    if (currentOrder.orderStatus !== 'delivered') {
      return res.status(400).json({ 
        success: false, 
        message: 'Can only confirm revenue for delivered orders' 
      });
    }

    // Update revenue status to confirmed
    const updatedOrder = await Order.findByIdAndUpdate(
      id,
      { 
        revenueStatus: 'confirmed',
        adminReceivedAmount: adminReceivedAmount || currentOrder.adminReceivedAmount
      },
      { new: true, runValidators: true }
    );

    res.json({ 
      success: true, 
      message: 'Revenue confirmed successfully',
      order: updatedOrder 
    });
  } catch (error) {
    console.error('Error confirming revenue:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to confirm revenue',
      error: error.message 
    });
  }
});

// Request order cancellation (user can request cancellation for COD orders)
router.put('/:id/request-cancellation', requestOrderCancellation);

// Admin approve/reject cancellation request
router.put('/:id/handle-cancellation', authenticateToken, isAdmin, handleCancellationRequest);

// Admin process refund for cancelled online payment order
router.post('/:id/process-refund', authenticateToken, isAdmin, processRefund);

// Admin confirm COD payment receipt
router.post('/:id/confirm-cod', authenticateToken, isAdmin, confirmCODReceipt);

// Get revenue analytics
router.get('/analytics/revenue', authenticateToken, isAdmin, getRevenueAnalytics);

// Update revenue when order is delivered (called internally)
router.put('/:id/update-revenue-delivery', updateRevenueOnDelivery);

// Update revenue when payment is completed (called internally)
router.put('/:id/update-revenue-payment', updateRevenueOnPaymentComplete);

// COD cancellation routes
router.post('/:id/cancel-cod', requestCODCancellation);
router.put('/:id/approve-cod-cancellation', authenticateToken, isAdmin, approveCODCancellation);

// Refund routes
router.post('/:id/refund', authenticateToken, isAdmin, processRefund);

// Order tracking routes
router.get('/:id/tracking', getOrderTracking);

// Return request routes
router.post('/:id/return', requestOrderReturn);

// Invoice generation routes
router.get('/:id/invoice', generateInvoice);

module.exports = router;

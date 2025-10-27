const mongoose = require('mongoose');
const Order = require('./models/Order');
require('dotenv').config();

async function fixStuckOnlineOrder() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find the stuck order
    const stuckOrder = await Order.findById('68e9f02843603b5a4e205194');
    
    if (!stuckOrder) {
      console.log('Order not found');
      return;
    }

    console.log('Found stuck order:', {
      id: stuckOrder._id,
      orderStatus: stuckOrder.orderStatus,
      paymentStatus: stuckOrder.paymentStatus,
      paymentMethod: stuckOrder.paymentMethod,
      totalAmount: stuckOrder.totalAmount,
      revenueStatus: stuckOrder.revenueStatus,
      revenueAmount: stuckOrder.revenueAmount,
      transactionId: stuckOrder.transactionId
    });

    // Fix the order
    console.log('\nFixing order...');
    
    stuckOrder.paymentStatus = 'completed';
    stuckOrder.revenueStatus = 'earned';
    stuckOrder.revenueAmount = stuckOrder.totalAmount - (stuckOrder.commission || 0);
    stuckOrder.revenueEarnedAt = new Date();
    stuckOrder.adminReceivedAmount = stuckOrder.revenueAmount;
    stuckOrder.paymentCompletedAt = new Date();
    
    // Set a dummy transaction ID if not present
    if (!stuckOrder.transactionId) {
      stuckOrder.transactionId = `RZ_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    await stuckOrder.save();
    
    console.log('Order fixed successfully:', {
      id: stuckOrder._id,
      orderStatus: stuckOrder.orderStatus,
      paymentStatus: stuckOrder.paymentStatus,
      revenueStatus: stuckOrder.revenueStatus,
      revenueAmount: stuckOrder.revenueAmount,
      transactionId: stuckOrder.transactionId
    });

  } catch (error) {
    console.error('Error fixing stuck order:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

fixStuckOnlineOrder();

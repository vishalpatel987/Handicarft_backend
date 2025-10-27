const mongoose = require('mongoose');
const Order = require('./models/Order');
require('dotenv').config();

async function checkOrderPaymentId() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    console.log('\n=== Checking Order Payment ID ===\n');

    // Check the specific order that's failing
    const orderId = '68e9faa7065cb2e5b2060e30';
    const order = await Order.findById(orderId);

    if (order) {
      console.log(`Order: ${orderId}`);
      console.log(`  Payment Method: ${order.paymentMethod}`);
      console.log(`  Payment Status: ${order.paymentStatus}`);
      console.log(`  Total Amount: ₹${order.totalAmount}`);
      console.log(`  Transaction ID: ${order.transactionId || 'NOT SET'}`);
      console.log(`  Razorpay Order ID: ${order.razorpayOrderId || 'NOT SET'}`);
      console.log(`  Razorpay Payment ID: ${order.razorpayPaymentId || 'NOT SET'}`);
      console.log(`  Razorpay Signature: ${order.razorpaySignature || 'NOT SET'}`);
      
      // Check what fields are available for refund
      console.log('\n  Available fields for refund:');
      if (order.razorpayPaymentId) {
        console.log(`    ✅ razorpayPaymentId: ${order.razorpayPaymentId}`);
      } else {
        console.log(`    ❌ razorpayPaymentId: NOT AVAILABLE`);
      }
      
      if (order.transactionId) {
        console.log(`    ✅ transactionId: ${order.transactionId}`);
      } else {
        console.log(`    ❌ transactionId: NOT AVAILABLE`);
      }
      
      if (order.razorpayOrderId) {
        console.log(`    ✅ razorpayOrderId: ${order.razorpayOrderId}`);
      } else {
        console.log(`    ❌ razorpayOrderId: NOT AVAILABLE`);
      }

      // Check if this is a test order or real payment
      console.log('\n  Payment Analysis:');
      if (order.paymentStatus === 'completed' && !order.razorpayPaymentId) {
        console.log(`    ⚠️  Payment marked as completed but no Razorpay payment ID found`);
        console.log(`    ⚠️  This might be a test order or payment was not processed through Razorpay`);
      }
      
      if (order.paymentMethod === 'razorpay' && order.paymentStatus === 'completed') {
        console.log(`    ✅ This is a Razorpay order with completed payment`);
        console.log(`    ❌ But missing razorpayPaymentId - cannot process refund`);
      }
    } else {
      console.log(`Order ${orderId} not found`);
    }

    // Check all orders with completed payments
    console.log('\n=== All Orders with Completed Payments ===');
    const completedOrders = await Order.find({
      paymentStatus: 'completed'
    }).sort({ createdAt: -1 }).limit(5);

    console.log(`Found ${completedOrders.length} orders with completed payments:`);
    completedOrders.forEach((order, index) => {
      console.log(`\nOrder ${index + 1}: ${order._id}`);
      console.log(`  Payment Method: ${order.paymentMethod}`);
      console.log(`  Payment Status: ${order.paymentStatus}`);
      console.log(`  Transaction ID: ${order.transactionId || 'NOT SET'}`);
      console.log(`  Razorpay Payment ID: ${order.razorpayPaymentId || 'NOT SET'}`);
      console.log(`  Can Process Refund: ${order.razorpayPaymentId ? 'YES' : 'NO'}`);
    });

  } catch (error) {
    console.error('Error checking order payment ID:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

checkOrderPaymentId();

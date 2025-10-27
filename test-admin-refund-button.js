const mongoose = require('mongoose');
const Order = require('./models/Order');
require('dotenv').config();

async function testAdminRefundButton() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    console.log('\n=== Testing Admin Refund Button Logic ===\n');

    // Find orders that should show refund button
    const ordersForRefundButton = await Order.find({
      cancellationStatus: 'approved',
      refundStatus: 'pending'
    });

    console.log(`Found ${ordersForRefundButton.length} orders with approved cancellation and pending refund:`);

    ordersForRefundButton.forEach((order, index) => {
      console.log(`\nOrder ${index + 1}: ${order._id}`);
      console.log(`  Payment Method: ${order.paymentMethod}`);
      console.log(`  Payment Status: ${order.paymentStatus}`);
      console.log(`  Order Status: ${order.orderStatus}`);
      console.log(`  Cancellation Status: ${order.cancellationStatus}`);
      console.log(`  Refund Status: ${order.refundStatus}`);
      console.log(`  Revenue Status: ${order.revenueStatus}`);
      console.log(`  Total Amount: ₹${order.totalAmount}`);
      console.log(`  Upfront Amount: ₹${order.upfrontAmount || 0}`);
      console.log(`  Refund Amount: ₹${order.refundAmount || 0}`);

      // Check refund button eligibility
      const isOnlinePayment = order.paymentMethod !== 'cod';
      const isCodWithUpfront = order.paymentMethod === 'cod' && order.upfrontAmount > 0;
      const hasCompletedPayment = order.paymentStatus === 'completed';
      
      const shouldShowRefundButton = (
        order.cancellationStatus === 'approved' &&
        order.refundStatus === 'pending' &&
        ((isOnlinePayment && hasCompletedPayment) || isCodWithUpfront)
      );

      console.log(`  Should Show Refund Button: ${shouldShowRefundButton ? '✅ YES' : '❌ NO'}`);
      
      if (!shouldShowRefundButton) {
        console.log(`  Reasons why button won't show:`);
        if (order.cancellationStatus !== 'approved') {
          console.log(`    - Cancellation Status: ${order.cancellationStatus} (should be 'approved')`);
        }
        if (order.refundStatus !== 'pending') {
          console.log(`    - Refund Status: ${order.refundStatus} (should be 'pending')`);
        }
        if (isOnlinePayment && !hasCompletedPayment) {
          console.log(`    - Online payment but Payment Status: ${order.paymentStatus} (should be 'completed')`);
        }
        if (order.paymentMethod === 'cod' && order.upfrontAmount <= 0) {
          console.log(`    - COD order but no upfront payment: ₹${order.upfrontAmount}`);
        }
      }
    });

    // Check recent cancellation approvals
    console.log('\n=== Recent Cancellation Approvals ===');
    const recentCancellations = await Order.find({
      cancellationStatus: 'approved',
      updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
    }).sort({ updatedAt: -1 }).limit(5);

    if (recentCancellations.length === 0) {
      console.log('No recent cancellation approvals found.');
    } else {
      console.log(`Found ${recentCancellations.length} recent cancellation approvals:`);
      recentCancellations.forEach((order, index) => {
        console.log(`\nRecent Order ${index + 1}: ${order._id}`);
        console.log(`  Payment Method: ${order.paymentMethod}`);
        console.log(`  Payment Status: ${order.paymentStatus}`);
        console.log(`  Cancellation Status: ${order.cancellationStatus}`);
        console.log(`  Refund Status: ${order.refundStatus || 'none'}`);
        console.log(`  Revenue Status: ${order.revenueStatus}`);
        console.log(`  Updated At: ${order.updatedAt}`);
        
        // Check if this order should show refund button
        const shouldShow = (
          order.cancellationStatus === 'approved' &&
          order.refundStatus === 'pending' &&
          ((order.paymentMethod !== 'cod' && order.paymentStatus === 'completed') ||
           (order.paymentMethod === 'cod' && order.upfrontAmount > 0))
        );
        
        console.log(`  Should Show Refund Button: ${shouldShow ? '✅ YES' : '❌ NO'}`);
      });
    }

    // Check all cancelled orders
    console.log('\n=== All Cancelled Orders ===');
    const allCancelledOrders = await Order.find({
      orderStatus: 'cancelled'
    }).sort({ updatedAt: -1 }).limit(10);

    console.log(`Found ${allCancelledOrders.length} cancelled orders:`);
    allCancelledOrders.forEach((order, index) => {
      console.log(`\nCancelled Order ${index + 1}: ${order._id}`);
      console.log(`  Payment Method: ${order.paymentMethod}`);
      console.log(`  Payment Status: ${order.paymentStatus}`);
      console.log(`  Order Status: ${order.orderStatus}`);
      console.log(`  Cancellation Status: ${order.cancellationStatus}`);
      console.log(`  Refund Status: ${order.refundStatus || 'none'}`);
      console.log(`  Revenue Status: ${order.revenueStatus}`);
      console.log(`  Updated At: ${order.updatedAt}`);
    });

  } catch (error) {
    console.error('Error testing admin refund button:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

testAdminRefundButton();

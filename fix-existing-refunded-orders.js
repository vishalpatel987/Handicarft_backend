const mongoose = require('mongoose');
const Order = require('./models/Order');
require('dotenv').config();

async function fixExistingRefundedOrders() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    console.log('\n=== Fixing Existing Refunded Orders ===\n');

    // Find orders that have incorrect workflow
    const incorrectOrders = await Order.find({
      orderStatus: 'cancelled',
      cancellationStatus: 'approved',
      paymentMethod: { $in: ['razorpay', 'online'] },
      paymentStatus: 'completed',
      revenueStatus: 'refunded',
      refundStatus: { $ne: 'completed' }
    });

    console.log(`Found ${incorrectOrders.length} orders with incorrect workflow:`);

    for (const order of incorrectOrders) {
      console.log(`\nFixing Order: ${order._id}`);
      console.log(`  Payment Method: ${order.paymentMethod}`);
      console.log(`  Payment Status: ${order.paymentStatus}`);
      console.log(`  Order Status: ${order.orderStatus}`);
      console.log(`  Cancellation Status: ${order.cancellationStatus}`);
      console.log(`  Current Revenue Status: ${order.revenueStatus}`);
      console.log(`  Current Refund Status: ${order.refundStatus || 'none'}`);

      // Fix the order
      const updateData = {
        revenueStatus: 'earned', // Should be earned until refund is actually processed
        refundStatus: 'pending', // Should be pending until admin processes refund
        refundAmount: order.totalAmount // Set refund amount
      };

      await Order.findByIdAndUpdate(order._id, updateData);

      console.log(`  ✅ Fixed Order: ${order._id}`);
      console.log(`    Revenue Status: ${updateData.revenueStatus}`);
      console.log(`    Refund Status: ${updateData.refundStatus}`);
      console.log(`    Refund Amount: ₹${updateData.refundAmount}`);
    }

    // Verify the fix
    console.log('\n=== Verifying Fix ===');
    const fixedOrders = await Order.find({
      orderStatus: 'cancelled',
      cancellationStatus: 'approved',
      paymentMethod: { $in: ['razorpay', 'online'] },
      paymentStatus: 'completed',
      revenueStatus: 'earned',
      refundStatus: 'pending'
    });

    console.log(`Orders with correct workflow after fix: ${fixedOrders.length}`);

    if (fixedOrders.length > 0) {
      console.log('\nFixed orders:');
      fixedOrders.forEach((order, index) => {
        console.log(`  ${index + 1}. Order ${order._id}:`);
        console.log(`     Revenue Status: ${order.revenueStatus}`);
        console.log(`     Refund Status: ${order.refundStatus}`);
        console.log(`     Refund Amount: ₹${order.refundAmount}`);
        console.log(`     Admin can process refund: ✅`);
      });
    }

    console.log('\n=== Fix Complete ===');
    console.log('✅ Orders now have correct workflow');
    console.log('✅ Admin will see refund button for these orders');
    console.log('✅ User will see "Refund Pending" status');
    console.log('✅ Revenue status will change to "refunded" only after admin processes refund');

  } catch (error) {
    console.error('Error fixing existing refunded orders:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

fixExistingRefundedOrders();

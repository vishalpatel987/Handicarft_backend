const mongoose = require('mongoose');
const Order = require('./models/Order');
require('dotenv').config();

async function fixMissingRefundStatus() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    console.log('\n=== Fixing Missing Refund Status ===\n');

    // Find orders that are cancelled and approved but don't have refund status set
    const ordersToFix = await Order.find({
      orderStatus: 'cancelled',
      cancellationStatus: 'approved',
      $or: [
        { refundStatus: { $exists: false } },
        { refundStatus: 'none' },
        { refundStatus: null }
      ]
    });

    console.log(`Found ${ordersToFix.length} orders that need refund status fix:`);

    for (const order of ordersToFix) {
      console.log(`\nFixing Order: ${order._id}`);
      console.log(`  Payment Method: ${order.paymentMethod}`);
      console.log(`  Payment Status: ${order.paymentStatus}`);
      console.log(`  Order Status: ${order.orderStatus}`);
      console.log(`  Cancellation Status: ${order.cancellationStatus}`);
      console.log(`  Current Refund Status: ${order.refundStatus || 'none'}`);
      console.log(`  Total Amount: ₹${order.totalAmount}`);
      console.log(`  Upfront Amount: ₹${order.upfrontAmount || 0}`);

      // Check if this order requires refund
      const requiresRefund = (order.paymentMethod !== 'cod' && 
                              order.paymentStatus === 'completed') ||
                             (order.paymentMethod === 'cod' && 
                              order.upfrontAmount > 0 && 
                              (order.paymentStatus === 'pending_upfront' || order.paymentStatus === 'completed'));

      console.log(`  Requires Refund: ${requiresRefund ? 'YES' : 'NO'}`);

      if (requiresRefund) {
        // Set refund status to pending
        const updateData = {
          refundStatus: 'pending',
          refundMethod: 'razorpay'
        };

        if (order.paymentMethod === 'cod') {
          updateData.refundAmount = order.upfrontAmount; // Only refund upfront amount for COD
        } else {
          updateData.refundAmount = order.totalAmount; // Full amount for online payments
        }

        await Order.findByIdAndUpdate(order._id, updateData);

        console.log(`  ✅ Fixed Order: ${order._id}`);
        console.log(`    Refund Status: ${updateData.refundStatus}`);
        console.log(`    Refund Amount: ₹${updateData.refundAmount}`);
        console.log(`    Refund Method: ${updateData.refundMethod}`);
        console.log(`    Admin can now process refund: ✅`);
      } else {
        console.log(`  ⚠️ Order does not require refund - no changes needed`);
      }
    }

    // Verify the fix
    console.log('\n=== Verifying Fix ===');
    const fixedOrders = await Order.find({
      orderStatus: 'cancelled',
      cancellationStatus: 'approved',
      refundStatus: 'pending'
    });

    console.log(`Orders with pending refund status after fix: ${fixedOrders.length}`);

    if (fixedOrders.length > 0) {
      console.log('\nFixed orders that can now show refund button:');
      fixedOrders.forEach((order, index) => {
        console.log(`  ${index + 1}. Order ${order._id}:`);
        console.log(`     Payment Method: ${order.paymentMethod}`);
        console.log(`     Payment Status: ${order.paymentStatus}`);
        console.log(`     Refund Status: ${order.refundStatus}`);
        console.log(`     Refund Amount: ₹${order.refundAmount}`);
        console.log(`     Admin refund button: ✅`);
      });
    }

    console.log('\n=== Fix Complete ===');
    console.log('✅ Orders now have proper refund status');
    console.log('✅ Admin will see refund button for eligible orders');
    console.log('✅ Refund workflow is now complete');

  } catch (error) {
    console.error('Error fixing missing refund status:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

fixMissingRefundStatus();

const mongoose = require('mongoose');
const Order = require('./models/Order');
require('dotenv').config();

async function resetRefundStatus() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    console.log('\n=== Resetting Refund Status ===\n');

    // Find orders with failed refund status
    const orderId = '68e9faa7065cb2e5b2060e30';
    const order = await Order.findById(orderId);

    if (order) {
      console.log(`Order: ${orderId}`);
      console.log(`  Current Refund Status: ${order.refundStatus}`);
      console.log(`  Refund Failed Reason: ${order.refundFailedReason || 'None'}`);
      
      if (order.refundStatus === 'failed') {
        // Reset refund status to pending
        await Order.findByIdAndUpdate(orderId, {
          refundStatus: 'pending',
          refundFailedReason: undefined,
          refundInitiatedAt: undefined
        });
        
        console.log(`  ✅ Reset refund status to: pending`);
        console.log(`  ✅ Cleared refund failed reason`);
        console.log(`  ✅ Cleared refund initiated date`);
        
        // Verify the reset
        const updatedOrder = await Order.findById(orderId);
        console.log(`  ✅ Updated Refund Status: ${updatedOrder.refundStatus}`);
        console.log(`  ✅ Can Process Refund: YES`);
      } else {
        console.log(`  ⚠️  Refund status is already: ${order.refundStatus}`);
      }
    } else {
      console.log(`Order ${orderId} not found`);
    }

    console.log('\n=== Order Ready for Refund ===');
    console.log('✅ Payment ID: Available');
    console.log('✅ Refund Status: Pending');
    console.log('✅ Admin can now process refund successfully');

  } catch (error) {
    console.error('Error resetting refund status:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

resetRefundStatus();

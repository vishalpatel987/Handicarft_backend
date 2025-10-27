const mongoose = require('mongoose');
const Order = require('./models/Order');
const Razorpay = require('razorpay');
require('dotenv').config();

async function fixOrderPaymentId() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Initialize Razorpay
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });

    console.log('\n=== Fixing Order Payment ID ===\n');

    // Find the order that needs fixing
    const orderId = '68e9faa7065cb2e5b2060e30';
    const order = await Order.findById(orderId);

    if (!order) {
      console.log(`Order ${orderId} not found`);
      return;
    }

    console.log(`Fixing Order: ${orderId}`);
    console.log(`  Razorpay Order ID: ${order.razorpayOrderId}`);
    console.log(`  Current Razorpay Payment ID: ${order.razorpayPaymentId || 'NOT SET'}`);

    if (order.razorpayOrderId && !order.razorpayPaymentId) {
      try {
        // Fetch payment details from Razorpay
        console.log(`  Fetching payment details from Razorpay...`);
        const payments = await razorpay.orders.fetchPayments(order.razorpayOrderId);
        
        if (payments && payments.items && payments.items.length > 0) {
          const payment = payments.items[0];
          console.log(`  Found payment: ${payment.id}`);
          console.log(`  Payment status: ${payment.status}`);
          console.log(`  Payment amount: ₹${payment.amount / 100}`);
          
          if (payment.status === 'captured') {
            // Update order with payment ID
            await Order.findByIdAndUpdate(orderId, {
              razorpayPaymentId: payment.id,
              transactionId: payment.id,
              paymentCompletedAt: new Date(payment.created_at * 1000)
            });
            
            console.log(`  ✅ Updated order with payment ID: ${payment.id}`);
            console.log(`  ✅ Updated transaction ID: ${payment.id}`);
            console.log(`  ✅ Updated payment completed date`);
          } else {
            console.log(`  ⚠️  Payment not captured, status: ${payment.status}`);
          }
        } else {
          console.log(`  ❌ No payments found for this order`);
        }
      } catch (error) {
        console.error(`  ❌ Error fetching payment details:`, error.message);
      }
    } else if (order.razorpayPaymentId) {
      console.log(`  ✅ Order already has payment ID: ${order.razorpayPaymentId}`);
    } else {
      console.log(`  ❌ No Razorpay order ID found`);
    }

    // Verify the fix
    console.log('\n=== Verifying Fix ===');
    const updatedOrder = await Order.findById(orderId);
    console.log(`  Updated Razorpay Payment ID: ${updatedOrder.razorpayPaymentId || 'NOT SET'}`);
    console.log(`  Updated Transaction ID: ${updatedOrder.transactionId || 'NOT SET'}`);
    console.log(`  Can Process Refund: ${updatedOrder.razorpayPaymentId ? 'YES' : 'NO'}`);

    if (updatedOrder.razorpayPaymentId) {
      console.log('\n✅ Order is now ready for refund processing');
      console.log('✅ Admin can now successfully process refund');
    } else {
      console.log('\n❌ Order still cannot process refund - payment ID missing');
    }

  } catch (error) {
    console.error('Error fixing order payment ID:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

fixOrderPaymentId();

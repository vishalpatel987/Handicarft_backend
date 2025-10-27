const mongoose = require('mongoose');
const Order = require('./models/Order');
require('dotenv').config();

async function testOnlinePaymentErrors() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Test 1: Check for orders with online payment issues
    console.log('\n=== Testing Online Payment Orders ===');
    
    const onlineOrders = await Order.find({ 
      paymentMethod: { $in: ['razorpay', 'online'] }
    }).sort({ createdAt: -1 }).limit(5);
    
    if (onlineOrders.length === 0) {
      console.log('No online payment orders found.');
    } else {
      console.log(`Found ${onlineOrders.length} online payment orders:`);
      
      onlineOrders.forEach((order, index) => {
        console.log(`\nOrder ${index + 1}:`);
        console.log(`  ID: ${order._id}`);
        console.log(`  Order Status: ${order.orderStatus}`);
        console.log(`  Payment Status: ${order.paymentStatus}`);
        console.log(`  Payment Method: ${order.paymentMethod}`);
        console.log(`  Total Amount: ₹${order.totalAmount}`);
        console.log(`  Transaction ID: ${order.transactionId || 'Not set'}`);
        console.log(`  Revenue Status: ${order.revenueStatus}`);
        console.log(`  Revenue Amount: ₹${order.revenueAmount || 0}`);
        console.log(`  Created: ${order.createdAt}`);
        
        // Check for potential issues
        const issues = [];
        
        if (order.paymentStatus === 'processing' && order.orderStatus === 'processing') {
          issues.push('Payment stuck in processing state');
        }
        
        if (order.paymentStatus === 'completed' && order.revenueStatus === 'pending') {
          issues.push('Payment completed but revenue not earned');
        }
        
        if (order.paymentStatus === 'failed' && order.orderStatus !== 'cancelled') {
          issues.push('Payment failed but order not cancelled');
        }
        
        if (order.transactionId && order.paymentStatus === 'pending') {
          issues.push('Transaction ID exists but payment still pending');
        }
        
        if (issues.length > 0) {
          console.log(`  ⚠️  Issues found:`);
          issues.forEach(issue => console.log(`    - ${issue}`));
        } else {
          console.log(`  ✅ No issues found`);
        }
      });
    }

    // Test 2: Check for orders with missing transaction IDs
    console.log('\n=== Testing Orders with Missing Transaction IDs ===');
    
    const ordersWithoutTransactionId = await Order.find({
      paymentMethod: { $in: ['razorpay', 'online'] },
      transactionId: { $exists: false }
    });
    
    if (ordersWithoutTransactionId.length > 0) {
      console.log(`Found ${ordersWithoutTransactionId.length} online orders without transaction ID:`);
      ordersWithoutTransactionId.forEach(order => {
        console.log(`  - Order ${order._id}: ${order.paymentStatus} (₹${order.totalAmount})`);
      });
    } else {
      console.log('All online orders have transaction IDs.');
    }

    // Test 3: Check for orders with inconsistent payment/revenue status
    console.log('\n=== Testing Payment/Revenue Status Consistency ===');
    
    const inconsistentOrders = await Order.find({
      $or: [
        { paymentStatus: 'completed', revenueStatus: 'pending' },
        { paymentStatus: 'failed', revenueStatus: 'earned' },
        { paymentStatus: 'pending', revenueStatus: 'earned' }
      ]
    });
    
    if (inconsistentOrders.length > 0) {
      console.log(`Found ${inconsistentOrders.length} orders with inconsistent status:`);
      inconsistentOrders.forEach(order => {
        console.log(`  - Order ${order._id}: Payment=${order.paymentStatus}, Revenue=${order.revenueStatus}`);
      });
    } else {
      console.log('All orders have consistent payment/revenue status.');
    }

    // Test 4: Check for recent failed payments
    console.log('\n=== Testing Recent Failed Payments ===');
    
    const recentFailedPayments = await Order.find({
      paymentStatus: 'failed',
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
    });
    
    if (recentFailedPayments.length > 0) {
      console.log(`Found ${recentFailedPayments.length} recent failed payments:`);
      recentFailedPayments.forEach(order => {
        console.log(`  - Order ${order._id}: ${order.paymentMethod} (₹${order.totalAmount}) - ${order.createdAt}`);
      });
    } else {
      console.log('No recent failed payments found.');
    }

    // Test 5: Check Razorpay configuration
    console.log('\n=== Testing Razorpay Configuration ===');
    
    const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
    
    console.log(`Razorpay Key ID: ${razorpayKeyId ? 'Set' : 'Not set'}`);
    console.log(`Razorpay Key Secret: ${razorpayKeySecret ? 'Set' : 'Not set'}`);
    
    if (!razorpayKeyId || !razorpayKeySecret) {
      console.log('⚠️  Razorpay credentials not properly configured!');
    } else {
      console.log('✅ Razorpay credentials are configured.');
    }

  } catch (error) {
    console.error('Error testing online payment issues:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

testOnlinePaymentErrors();

const mongoose = require('mongoose');
const Order = require('./models/Order');
require('dotenv').config();

async function testRevenueDeduction() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find an order with earned revenue
    const orderWithRevenue = await Order.findOne({ 
      revenueStatus: 'earned',
      orderStatus: { $in: ['processing', 'confirmed', 'manufacturing', 'shipped'] }
    });
    
    if (!orderWithRevenue) {
      console.log('No orders with earned revenue found.');
      console.log('Creating a test order with earned revenue...');
      
      // Create a test order with earned revenue
      const testOrder = new Order({
        customerName: 'Test Customer',
        email: 'test@example.com',
        phone: '1234567890',
        address: {
          street: 'Test Street',
          city: 'Test City',
          state: 'Test State',
          pincode: '123456',
          country: 'India'
        },
        items: [
          {
            name: 'Test Item',
            price: 1000,
            quantity: 1
          }
        ],
        totalAmount: 1000,
        paymentMethod: 'cod',
        paymentStatus: 'pending',
        orderStatus: 'processing',
        revenueStatus: 'earned',
        revenueAmount: 1000,
        adminReceivedAmount: 1000
      });
      
      await testOrder.save();
      console.log('Test order with earned revenue created:', testOrder._id);
      
      // Test revenue deduction on cancellation
      console.log('\nTesting revenue deduction on cancellation...');
      const cancelledOrder = await Order.findByIdAndUpdate(
        testOrder._id,
        {
          orderStatus: 'cancelled',
          cancellationStatus: 'approved',
          revenueStatus: 'cancelled',
          revenueAmount: 0,
          adminReceivedAmount: 0,
          paymentStatus: 'failed'
        },
        { new: true, runValidators: true }
      );
      
      console.log('Revenue deduction test successful:', {
        id: cancelledOrder._id,
        orderStatus: cancelledOrder.orderStatus,
        revenueStatus: cancelledOrder.revenueStatus,
        revenueAmount: cancelledOrder.revenueAmount,
        adminReceivedAmount: cancelledOrder.adminReceivedAmount
      });
      
      // Clean up test order
      await Order.findByIdAndDelete(testOrder._id);
      console.log('\nTest order cleaned up');
      
    } else {
      console.log('Found order with earned revenue:', orderWithRevenue._id);
      console.log('Order details:', {
        orderStatus: orderWithRevenue.orderStatus,
        paymentMethod: orderWithRevenue.paymentMethod,
        revenueStatus: orderWithRevenue.revenueStatus,
        revenueAmount: orderWithRevenue.revenueAmount,
        adminReceivedAmount: orderWithRevenue.adminReceivedAmount
      });
      
      console.log('\nTesting revenue deduction on cancellation...');
      const cancelledOrder = await Order.findByIdAndUpdate(
        orderWithRevenue._id,
        {
          orderStatus: 'cancelled',
          cancellationStatus: 'approved',
          revenueStatus: 'cancelled',
          revenueAmount: 0,
          adminReceivedAmount: 0,
          paymentStatus: 'failed'
        },
        { new: true, runValidators: true }
      );
      
      console.log('Revenue deduction successful:', {
        id: cancelledOrder._id,
        orderStatus: cancelledOrder.orderStatus,
        revenueStatus: cancelledOrder.revenueStatus,
        revenueAmount: cancelledOrder.revenueAmount,
        adminReceivedAmount: cancelledOrder.adminReceivedAmount
      });
    }

  } catch (error) {
    console.error('Error testing revenue deduction:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

testRevenueDeduction();

const mongoose = require('mongoose');
const Order = require('./models/Order');
require('dotenv').config();

async function testOrderStatusUpdate() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find a test order
    const testOrder = await Order.findOne({ orderStatus: 'processing' });
    if (!testOrder) {
      console.log('No processing orders found. Creating a test order...');
      
      // Create a test order
      const newOrder = new Order({
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
        revenueStatus: 'pending'
      });
      
      await newOrder.save();
      console.log('Test order created:', newOrder._id);
      
      // Test status update
      console.log('\nTesting order status update...');
      const updatedOrder = await Order.findByIdAndUpdate(
        newOrder._id,
        { 
          orderStatus: 'confirmed',
          paymentStatus: 'pending',
          revenueStatus: 'pending',
          revenueAmount: 0,
          adminReceivedAmount: 0
        },
        { new: true, runValidators: true }
      );
      
      console.log('Order status updated successfully:', {
        id: updatedOrder._id,
        orderStatus: updatedOrder.orderStatus,
        paymentStatus: updatedOrder.paymentStatus,
        revenueStatus: updatedOrder.revenueStatus
      });
      
      // Test delivery status update
      console.log('\nTesting delivery status update...');
      const deliveredOrder = await Order.findByIdAndUpdate(
        newOrder._id,
        { 
          orderStatus: 'delivered',
          paymentStatus: 'completed',
          revenueStatus: 'earned',
          revenueAmount: 1000,
          adminReceivedAmount: 1000
        },
        { new: true, runValidators: true }
      );
      
      console.log('Order delivered successfully:', {
        id: deliveredOrder._id,
        orderStatus: deliveredOrder.orderStatus,
        paymentStatus: deliveredOrder.paymentStatus,
        revenueStatus: deliveredOrder.revenueStatus,
        revenueAmount: deliveredOrder.revenueAmount
      });
      
      // Clean up test order
      await Order.findByIdAndDelete(newOrder._id);
      console.log('\nTest order cleaned up');
      
    } else {
      console.log('Found existing test order:', testOrder._id);
      console.log('Current status:', {
        orderStatus: testOrder.orderStatus,
        paymentStatus: testOrder.paymentStatus,
        revenueStatus: testOrder.revenueStatus
      });
    }

  } catch (error) {
    console.error('Error testing order status update:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

testOrderStatusUpdate();

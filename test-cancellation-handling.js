const mongoose = require('mongoose');
const Order = require('./models/Order');
require('dotenv').config();

async function testCancellationHandling() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find an order with cancellation request
    const orderWithCancellation = await Order.findOne({ 
      cancellationRequested: true, 
      cancellationStatus: 'requested' 
    });
    
    if (!orderWithCancellation) {
      console.log('No orders with pending cancellation requests found.');
      console.log('Creating a test order with cancellation request...');
      
      // Create a test order with cancellation request
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
        revenueStatus: 'pending',
        cancellationRequested: true,
        cancellationStatus: 'requested',
        cancellationReason: 'Test cancellation request'
      });
      
      await testOrder.save();
      console.log('Test order with cancellation request created:', testOrder._id);
      
      // Test approval
      console.log('\nTesting cancellation approval...');
      const approvedOrder = await Order.findByIdAndUpdate(
        testOrder._id,
        {
          cancellationStatus: 'approved',
          orderStatus: 'cancelled',
          revenueStatus: 'cancelled',
          revenueAmount: 0,
          adminReceivedAmount: 0,
          paymentStatus: 'failed'
        },
        { new: true, runValidators: true }
      );
      
      console.log('Cancellation approved successfully:', {
        id: approvedOrder._id,
        cancellationStatus: approvedOrder.cancellationStatus,
        orderStatus: approvedOrder.orderStatus,
        revenueStatus: approvedOrder.revenueStatus
      });
      
      // Clean up test order
      await Order.findByIdAndDelete(testOrder._id);
      console.log('\nTest order cleaned up');
      
    } else {
      console.log('Found order with pending cancellation request:', orderWithCancellation._id);
      console.log('Order details:', {
        orderStatus: orderWithCancellation.orderStatus,
        paymentMethod: orderWithCancellation.paymentMethod,
        cancellationRequested: orderWithCancellation.cancellationRequested,
        cancellationStatus: orderWithCancellation.cancellationStatus,
        cancellationReason: orderWithCancellation.cancellationReason
      });
    }

  } catch (error) {
    console.error('Error testing cancellation handling:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

testCancellationHandling();

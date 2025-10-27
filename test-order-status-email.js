const { sendOrderStatusUpdateEmail } = require('./controllers/orderController');

// Test order data
const testOrder = {
  email: 'test@example.com', // Replace with your email for testing
  customerName: 'Test User',
  orderStatus: 'confirmed',
  items: [
    {
      name: 'Test Product 1',
      quantity: 2,
      price: 1500
    },
    {
      name: 'Test Product 2', 
      quantity: 1,
      price: 2500
    }
  ],
  totalAmount: 5500,
  address: {
    street: '123 Test Street',
    city: 'Test City',
    state: 'Test State',
    pincode: '123456',
    country: 'India'
  }
};

console.log('🧪 Testing Order Status Update Email...');
console.log('📧 Test Order:', testOrder);

// Test the email function
sendOrderStatusUpdateEmail(testOrder)
  .then(() => {
    console.log('✅ Order status update email test completed!');
    console.log('📧 Check your email inbox for the notification.');
  })
  .catch((error) => {
    console.error('❌ Error testing order status update email:', error);
  });

require('dotenv').config();
const { sendOrderStatusUpdateEmail } = require('./controllers/orderController');

console.log('📧 Simple Email Test - Order Status Update...');

// Test order data
const testOrder = {
  email: 'vishalpatel581012@gmail.com',
  customerName: 'Vishal Patel',
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

async function testEmail() {
  try {
    console.log('📤 Sending order status update email...');
    console.log('📧 To:', testOrder.email);
    console.log('📧 Status:', testOrder.orderStatus);
    
    await sendOrderStatusUpdateEmail(testOrder);
    
    console.log('✅ Email sent successfully!');
    console.log('📧 Check your inbox for the notification');
    console.log('📧 Subject should be: "Rikocraft Order Status Update - Confirmed"');
    
  } catch (error) {
    console.error('❌ Email sending failed:', error.message);
  }
}

testEmail();

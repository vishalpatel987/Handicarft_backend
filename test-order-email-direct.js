require('dotenv').config();
const { sendOrderStatusUpdateEmail } = require('./controllers/orderController');

console.log('🧪 Direct Order Status Email Test...');
console.log('📧 EMAIL_USER:', process.env.EMAIL_USER ? 'Set' : 'Not Set');
console.log('📧 EMAIL_PASS:', process.env.EMAIL_PASS ? 'Set' : 'Not Set');

// Test with different order statuses
const testOrder = {
  email: 'vishalpatel581012@gmail.com', // Your email
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

// Test different statuses
const statuses = ['processing', 'confirmed', 'manufacturing', 'shipped', 'delivered', 'cancelled'];

async function testAllStatuses() {
  console.log('\n📧 Testing all order statuses...');
  
  for (let i = 0; i < statuses.length; i++) {
    const status = statuses[i];
    console.log(`\n🔄 Testing status: ${status.toUpperCase()}`);
    
    try {
      // Update order status for test
      const testOrderWithStatus = { ...testOrder, orderStatus: status };
      
      await sendOrderStatusUpdateEmail(testOrderWithStatus);
      console.log(`✅ Email sent successfully for status: ${status}`);
      console.log(`📧 Check your inbox for: ${status.toUpperCase()} notification`);
      
      // Wait 2 seconds between emails
      if (i < statuses.length - 1) {
        console.log('⏳ Waiting 2 seconds before next test...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
    } catch (error) {
      console.error(`❌ Failed to send email for status ${status}:`, error.message);
    }
  }
  
  console.log('\n🎉 All status tests completed!');
  console.log('📧 Check your email inbox for all notifications');
  console.log('📧 You should receive 6 emails with different statuses');
}

// Run the test
testAllStatuses().catch(console.error);

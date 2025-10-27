require('dotenv').config();
const axios = require('axios');
const { sendOrderStatusUpdateEmail } = require('./controllers/orderController');

// Test configuration
const API_BASE_URL = 'http://localhost:5000';
const TEST_EMAIL = 'vishalpatel581012@gmail.com'; // Replace with test email

console.log('🧪 Testing Order Status Update with Email Notification...');
console.log('📧 Test Email:', TEST_EMAIL);

// Test 1: Direct Email Function Test
const testDirectEmail = async () => {
  console.log('\n📧 Test 1: Direct Email Function Test');
  
  const testOrder = {
    email: TEST_EMAIL,
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

  try {
    await sendOrderStatusUpdateEmail(testOrder);
    console.log('✅ Direct email test successful!');
    return true;
  } catch (error) {
    console.error('❌ Direct email test failed:', error.message);
    return false;
  }
};

// Test 2: API Endpoint Test (if you have an existing order)
const testAPIEndpoint = async () => {
  console.log('\n🔗 Test 2: API Endpoint Test');
  
  try {
    // First, get all orders to find a test order
    const ordersResponse = await axios.get(`${API_BASE_URL}/api/orders/json`);
    const orders = ordersResponse.data.orders || [];
    
    if (orders.length === 0) {
      console.log('⚠️ No orders found in database. Skipping API test.');
      return false;
    }
    
    const testOrder = orders[0]; // Use first order for testing
    console.log('📦 Using order:', testOrder._id, 'for testing');
    
    // Test status update API
    const updateResponse = await axios.put(
      `${API_BASE_URL}/api/orders/${testOrder._id}/status`,
      { orderStatus: 'confirmed' },
      {
        headers: {
          'Content-Type': 'application/json',
          // Note: You'll need to add admin token here for real testing
        }
      }
    );
    
    console.log('✅ API endpoint test successful!');
    console.log('📧 Email should have been sent to:', testOrder.email);
    return true;
    
  } catch (error) {
    if (error.response) {
      console.error('❌ API test failed:', error.response.status, error.response.data);
    } else {
      console.error('❌ API test failed:', error.message);
    }
    return false;
  }
};

// Test 3: Environment Variables Check
const testEnvironment = () => {
  console.log('\n🔧 Test 3: Environment Variables Check');
  
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;
  
  console.log('EMAIL_USER:', emailUser ? '✅ Set (' + emailUser + ')' : '❌ Not Set');
  console.log('EMAIL_PASS:', emailPass ? '✅ Set (' + emailPass.substring(0,4) + '****)' : '❌ Not Set');
  
  return emailUser && emailPass;
};

// Run all tests
const runTests = async () => {
  console.log('🚀 Starting Order Status Notification Tests...\n');
  
  const envTest = testEnvironment();
  const emailTest = await testDirectEmail();
  const apiTest = await testAPIEndpoint();
  
  console.log('\n📊 Test Results Summary:');
  console.log('Environment Variables:', envTest ? '✅ Pass' : '❌ Fail');
  console.log('Direct Email Function:', emailTest ? '✅ Pass' : '❌ Fail');
  console.log('API Endpoint:', apiTest ? '✅ Pass' : '❌ Fail');
  
  if (emailTest) {
    console.log('\n🎉 Email notification system is working!');
    console.log('📧 Check your inbox for the test email.');
  } else {
    console.log('\n❌ Email notification system needs fixing.');
    console.log('🔧 Please check email credentials and configuration.');
  }
};

// Run tests
runTests().catch(console.error);

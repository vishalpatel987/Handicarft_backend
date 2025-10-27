const axios = require('axios');

async function testBackendAPI() {
  try {
    console.log('\n=== Testing Backend API ===\n');

    // Test 1: Health Check
    console.log('1. Testing Health Check...');
    try {
      const healthResponse = await axios.get('http://localhost:5175/health');
      console.log('✅ Health Check: SUCCESS');
      console.log(`   Status: ${healthResponse.data.status}`);
      console.log(`   Database: ${healthResponse.data.database.connected ? 'Connected' : 'Disconnected'}`);
    } catch (healthError) {
      console.log('❌ Health Check: FAILED');
      console.log(`   Error: ${healthError.message}`);
      return;
    }

    // Test 2: Payment API
    console.log('\n2. Testing Payment API...');
    const testOrderData = {
      amount: 58000,
      customerName: 'Test User',
      email: 'test@example.com',
      phone: '9999999999',
      address: 'Test Address',
      city: 'Test City',
      state: 'Test State',
      pincode: '123456',
      country: 'India',
      items: [{
        name: 'Test Product',
        quantity: 1,
        price: 58000,
        image: 'test-image.jpg'
      }],
      totalAmount: 58000,
      shippingCost: 0,
      codExtraCharge: 0,
      finalTotal: 58000,
      paymentMethod: 'razorpay',
      paymentStatus: 'processing',
      upfrontAmount: 0,
      remainingAmount: 0,
      sellerToken: '',
      couponCode: ''
    };

    try {
      const paymentResponse = await axios.post('http://localhost:5175/api/payment/razorpay', testOrderData, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log('✅ Payment API: SUCCESS');
      console.log(`   Success: ${paymentResponse.data.success}`);
      if (paymentResponse.data.order) {
        console.log(`   Order ID: ${paymentResponse.data.order.id}`);
        console.log(`   Amount: ₹${paymentResponse.data.order.amount / 100}`);
        console.log(`   Currency: ${paymentResponse.data.order.currency}`);
        console.log(`   Status: ${paymentResponse.data.order.status}`);
      }
    } catch (paymentError) {
      console.log('❌ Payment API: FAILED');
      console.log(`   Error: ${paymentError.message}`);
      if (paymentError.response) {
        console.log(`   Status: ${paymentError.response.status}`);
        console.log(`   Response: ${JSON.stringify(paymentError.response.data, null, 2)}`);
      }
    }

    // Test 3: Check if server is running
    console.log('\n3. Server Status Check...');
    try {
      const serverResponse = await axios.get('http://localhost:5175/api/shop');
      console.log('✅ Server: RUNNING');
    } catch (serverError) {
      console.log('❌ Server: NOT RESPONDING');
      console.log(`   Error: ${serverError.message}`);
    }

  } catch (error) {
    console.error('Error testing backend API:', error);
  }
}

testBackendAPI();

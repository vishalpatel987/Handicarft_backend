require('dotenv').config();
const axios = require('axios');

console.log('🔍 Debugging Order Status Email Notification...');
console.log('📧 EMAIL_USER:', process.env.EMAIL_USER ? 'Set' : 'Not Set');
console.log('📧 EMAIL_PASS:', process.env.EMAIL_PASS ? 'Set' : 'Not Set');

// Wait for server to start
setTimeout(async () => {
  try {
    console.log('\n🔗 Testing Backend Server Connection...');
    
    // Test server connection
    const healthCheck = await axios.get('http://localhost:5175/api/orders/json');
    console.log('✅ Backend server is running');
    
    // Get orders
    const orders = healthCheck.data.orders || [];
    console.log('📦 Found', orders.length, 'orders in database');
    
    if (orders.length === 0) {
      console.log('⚠️ No orders found. Creating a test order...');
      
      // Create a test order
      const testOrderData = {
        customerName: 'Test User',
        email: 'vishalpatel581012@gmail.com',
        phone: '1234567890',
        address: {
          street: '123 Test Street',
          city: 'Test City',
          state: 'Test State',
          pincode: '123456',
          country: 'India'
        },
        city: 'Test City',
        state: 'Test State',
        pincode: '123456',
        country: 'India',
        items: [
          {
            name: 'Test Product',
            price: 1000,
            quantity: 1,
            productId: 'test-product-1'
          }
        ],
        totalAmount: 1000,
        paymentMethod: 'cod',
        paymentStatus: 'pending',
        upfrontAmount: 0,
        remainingAmount: 1000
      };
      
      try {
        const createResponse = await axios.post('http://localhost:5175/api/orders', testOrderData);
        console.log('✅ Test order created:', createResponse.data.order._id);
        
        // Now test status update
        await testOrderStatusUpdate(createResponse.data.order._id);
        
      } catch (createError) {
        console.error('❌ Error creating test order:', createError.response?.data || createError.message);
      }
      
    } else {
      // Use existing order for testing
      const testOrder = orders[0];
      console.log('📦 Using existing order:', testOrder._id, 'for testing');
      await testOrderStatusUpdate(testOrder._id);
    }
    
  } catch (error) {
    console.error('❌ Server connection failed:', error.message);
    console.log('🔧 Make sure backend server is running on port 5175');
  }
}, 3000); // Wait 3 seconds for server to start

async function testOrderStatusUpdate(orderId) {
  console.log('\n🔄 Testing Order Status Update...');
  
  try {
    // Test different status updates
    const statuses = ['confirmed', 'manufacturing', 'shipped', 'delivered'];
    
    for (const status of statuses) {
      console.log(`\n📧 Testing status update to: ${status}`);
      
      try {
        // Note: This will fail without admin token, but we can see the email function call
        const updateResponse = await axios.put(
          `http://localhost:5175/api/orders/${orderId}/status`,
          { orderStatus: status },
          {
            headers: {
              'Content-Type': 'application/json',
              // Admin token would be needed here for real testing
            }
          }
        );
        
        console.log('✅ Status update successful:', status);
        console.log('📧 Email should have been sent');
        
      } catch (updateError) {
        if (updateError.response?.status === 401) {
          console.log('⚠️ Status update failed: Authentication required (this is expected without admin token)');
        } else {
          console.error('❌ Status update failed:', updateError.response?.data || updateError.message);
        }
      }
      
      // Wait between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
  } catch (error) {
    console.error('❌ Error in status update test:', error.message);
  }
}

console.log('\n⏳ Waiting for server to start...');

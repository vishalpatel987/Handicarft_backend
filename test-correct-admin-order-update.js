require('dotenv').config();
const axios = require('axios');

console.log('🔍 Testing Admin Order Update with Correct Credentials...');

// Correct admin credentials
const API_BASE_URL = 'http://localhost:5175';
const ADMIN_EMAIL = 'vishalpatel581012@gmail.com';
const ADMIN_PASSWORD = 'admin123'; // Default password

async function testAdminOrderUpdate() {
  try {
    console.log('\n🔐 Step 1: Admin Login with Correct Credentials...');
    
    // Admin login
    const loginResponse = await axios.post(`${API_BASE_URL}/api/admin/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    });
    
    const adminToken = loginResponse.data.token;
    console.log('✅ Admin login successful');
    console.log('🔑 Token received:', adminToken ? 'Yes' : 'No');
    
    console.log('\n📦 Step 2: Getting Orders...');
    
    // Get orders
    const ordersResponse = await axios.get(`${API_BASE_URL}/api/orders/json`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });
    
    const orders = ordersResponse.data.orders || [];
    console.log('✅ Orders fetched successfully');
    console.log('📦 Found', orders.length, 'orders');
    
    if (orders.length === 0) {
      console.log('\n⚠️ No orders found. Creating test order...');
      
      const testOrder = {
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
      
      const createResponse = await axios.post(`${API_BASE_URL}/api/orders`, testOrder);
      orders.push(createResponse.data.order);
      console.log('✅ Test order created:', createResponse.data.order._id);
    }
    
    console.log('\n📧 Step 3: Testing Order Status Update...');
    
    const testOrder = orders[0];
    console.log('📦 Testing with order:', testOrder._id);
    console.log('📧 Order email:', testOrder.email);
    console.log('📧 Current status:', testOrder.orderStatus);
    
    // Test status update to confirmed
    const newStatus = 'confirmed';
    console.log(`🔄 Updating status to: ${newStatus}`);
    
    const updateResponse = await axios.put(
      `${API_BASE_URL}/api/orders/${testOrder._id}/status`,
      { orderStatus: newStatus },
      {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Order status updated successfully!');
    console.log('📧 Email should have been sent to:', testOrder.email);
    console.log('📧 Check your inbox for the notification!');
    
    // Test another status update after 3 seconds
    setTimeout(async () => {
      try {
        console.log('\n📧 Step 4: Testing Another Status Update...');
        
        const updateResponse2 = await axios.put(
          `${API_BASE_URL}/api/orders/${testOrder._id}/status`,
          { orderStatus: 'shipped' },
          {
            headers: {
              'Authorization': `Bearer ${adminToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        console.log('✅ Second status update successful!');
        console.log('📧 Another email should have been sent to:', testOrder.email);
        console.log('📧 Check your inbox for the SHIPPED notification!');
        
        // Test cancelled status
        setTimeout(async () => {
          try {
            console.log('\n📧 Step 5: Testing Cancelled Status...');
            
            const updateResponse3 = await axios.put(
              `${API_BASE_URL}/api/orders/${testOrder._id}/status`,
              { orderStatus: 'cancelled' },
              {
                headers: {
                  'Authorization': `Bearer ${adminToken}`,
                  'Content-Type': 'application/json'
                }
              }
            );
            
            console.log('✅ Cancelled status update successful!');
            console.log('📧 Cancellation email should have been sent to:', testOrder.email);
            console.log('📧 Check your inbox for the CANCELLED notification!');
            
            console.log('\n🎉 All tests completed successfully!');
            console.log('📧 You should have received 3 emails:');
            console.log('   1. CONFIRMED status notification');
            console.log('   2. SHIPPED status notification');
            console.log('   3. CANCELLED status notification');
            
          } catch (error3) {
            console.error('❌ Third update failed:', error3.response?.data || error3.message);
          }
        }, 3000);
        
      } catch (error2) {
        console.error('❌ Second update failed:', error2.response?.data || error2.message);
      }
    }, 3000);
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      console.log('\n🔧 Authentication Failed:');
      console.log('1. Check if admin password is correct');
      console.log('2. Admin email: vishalpatel581012@gmail.com');
      console.log('3. Try password: admin123');
    }
  }
}

// Run the test
testAdminOrderUpdate();

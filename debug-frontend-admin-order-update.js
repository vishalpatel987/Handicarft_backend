require('dotenv').config();
const axios = require('axios');

console.log('🔍 Debugging Frontend Admin Order Status Update...');

// Test configuration
const API_BASE_URL = 'http://localhost:5175';
const ADMIN_EMAIL = 'admin@rikocraft.com';
const ADMIN_PASSWORD = 'admin123';

async function debugAdminOrderUpdate() {
  try {
    console.log('\n🔐 Step 1: Testing Admin Authentication...');
    
    // Try admin login
    let adminToken = null;
    try {
      const loginResponse = await axios.post(`${API_BASE_URL}/api/admin/auth/login`, {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD
      });
      
      adminToken = loginResponse.data.token;
      console.log('✅ Admin login successful');
      console.log('🔑 Token received:', adminToken ? 'Yes' : 'No');
      
    } catch (loginError) {
      console.error('❌ Admin login failed:', loginError.response?.data || loginError.message);
      
      // Try alternative admin credentials
      console.log('\n🔄 Trying alternative admin credentials...');
      
      const alternativeCredentials = [
        { email: 'admin@example.com', password: 'admin123' },
        { email: 'admin@test.com', password: 'admin123' },
        { email: 'admin', password: 'admin' },
        { email: 'admin@rikocraft.com', password: 'admin' }
      ];
      
      for (const creds of alternativeCredentials) {
        try {
          console.log(`🔑 Trying: ${creds.email} / ${creds.password}`);
          const altLoginResponse = await axios.post(`${API_BASE_URL}/api/admin/auth/login`, creds);
          adminToken = altLoginResponse.data.token;
          console.log('✅ Alternative admin login successful');
          break;
        } catch (altError) {
          console.log(`❌ Failed: ${creds.email}`);
        }
      }
    }
    
    if (!adminToken) {
      console.log('\n⚠️ No admin authentication available. Testing without auth...');
    }
    
    console.log('\n📦 Step 2: Getting Orders...');
    
    // Get orders
    let orders = [];
    try {
      const ordersResponse = await axios.get(`${API_BASE_URL}/api/orders/json`, {
        headers: adminToken ? { 'Authorization': `Bearer ${adminToken}` } : {}
      });
      
      orders = ordersResponse.data.orders || [];
      console.log('✅ Orders fetched successfully');
      console.log('📦 Found', orders.length, 'orders');
      
    } catch (ordersError) {
      console.error('❌ Failed to fetch orders:', ordersError.response?.data || ordersError.message);
      
      if (ordersError.response?.status === 401) {
        console.log('🔧 Orders endpoint requires authentication');
      }
    }
    
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
      
      try {
        const createResponse = await axios.post(`${API_BASE_URL}/api/orders`, testOrder);
        orders.push(createResponse.data.order);
        console.log('✅ Test order created:', createResponse.data.order._id);
      } catch (createError) {
        console.error('❌ Failed to create test order:', createError.response?.data || createError.message);
      }
    }
    
    if (orders.length > 0) {
      console.log('\n📧 Step 3: Testing Order Status Update...');
      
      const testOrder = orders[0];
      console.log('📦 Testing with order:', testOrder._id);
      console.log('📧 Order email:', testOrder.email);
      console.log('📧 Current status:', testOrder.orderStatus);
      
      // Test status update
      const newStatus = 'confirmed';
      console.log(`🔄 Updating status to: ${newStatus}`);
      
      try {
        const updateResponse = await axios.put(
          `${API_BASE_URL}/api/orders/${testOrder._id}/status`,
          { orderStatus: newStatus },
          {
            headers: {
              ...(adminToken ? { 'Authorization': `Bearer ${adminToken}` } : {}),
              'Content-Type': 'application/json'
            }
          }
        );
        
        console.log('✅ Order status updated successfully!');
        console.log('📧 Email should have been sent to:', testOrder.email);
        console.log('📧 Check your inbox for the notification!');
        
        // Test another status update
        setTimeout(async () => {
          try {
            console.log('\n📧 Step 4: Testing Another Status Update...');
            
            const updateResponse2 = await axios.put(
              `${API_BASE_URL}/api/orders/${testOrder._id}/status`,
              { orderStatus: 'shipped' },
              {
                headers: {
                  ...(adminToken ? { 'Authorization': `Bearer ${adminToken}` } : {}),
                  'Content-Type': 'application/json'
                }
              }
            );
            
            console.log('✅ Second status update successful!');
            console.log('📧 Another email should have been sent to:', testOrder.email);
            
          } catch (error2) {
            console.error('❌ Second update failed:', error2.response?.data || error2.message);
          }
        }, 2000);
        
      } catch (updateError) {
        console.error('❌ Order status update failed:', updateError.response?.data || updateError.message);
        
        if (updateError.response?.status === 401) {
          console.log('\n🔧 Authentication Required:');
          console.log('1. Admin login failed');
          console.log('2. Order status update requires admin authentication');
          console.log('3. Check admin credentials in database');
        }
        
        if (updateError.response?.status === 404) {
          console.log('\n🔧 Order Not Found:');
          console.log('1. Order ID might be incorrect');
          console.log('2. Order might have been deleted');
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Debug test failed:', error.message);
  }
}

// Run the debug test
debugAdminOrderUpdate();

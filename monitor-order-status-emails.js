require('dotenv').config();
const axios = require('axios');

console.log('📧 Monitoring Order Status Email Notifications...');

// Test configuration
const API_BASE_URL = 'http://localhost:5175';
const ADMIN_EMAIL = 'vishalpatel581012@gmail.com';
const ADMIN_PASSWORD = 'admin123';

async function monitorOrderStatusEmails() {
  try {
    console.log('\n🔐 Step 1: Admin Login...');
    
    // Admin login
    const loginResponse = await axios.post(`${API_BASE_URL}/api/admin/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    });
    
    const adminToken = loginResponse.data.token;
    console.log('✅ Admin login successful');
    
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
      console.log('⚠️ No orders found. Creating test order...');
      
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
    
    console.log('\n📧 Step 3: Testing Multiple Order Status Updates...');
    
    const testOrder = orders[0];
    console.log('📦 Testing with order:', testOrder._id);
    console.log('📧 Order email:', testOrder.email);
    console.log('📧 Current status:', testOrder.orderStatus);
    
    // Test different status updates with delays
    const statuses = ['confirmed', 'manufacturing', 'shipped', 'delivered'];
    
    for (let i = 0; i < statuses.length; i++) {
      const status = statuses[i];
      
      console.log(`\n🔄 ${i + 1}. Updating status to: ${status.toUpperCase()}`);
      
      try {
        const updateResponse = await axios.put(
          `${API_BASE_URL}/api/orders/${testOrder._id}/status`,
          { orderStatus: status },
          {
            headers: {
              'Authorization': `Bearer ${adminToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        console.log(`✅ Status updated to ${status} successfully!`);
        console.log(`📧 Email notification should have been sent to: ${testOrder.email}`);
        console.log(`📧 Check your inbox for: ${status.toUpperCase()} notification`);
        
        // Wait 3 seconds between updates
        if (i < statuses.length - 1) {
          console.log('⏳ Waiting 3 seconds before next update...');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
      } catch (updateError) {
        console.error(`❌ Failed to update status to ${status}:`, updateError.response?.data || updateError.message);
      }
    }
    
    // Test cancellation
    setTimeout(async () => {
      try {
        console.log('\n🔄 5. Testing CANCELLED status...');
        
        const updateResponse = await axios.put(
          `${API_BASE_URL}/api/orders/${testOrder._id}/status`,
          { orderStatus: 'cancelled' },
          {
            headers: {
              'Authorization': `Bearer ${adminToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        console.log('✅ Order cancelled successfully!');
        console.log('📧 Cancellation email should have been sent to:', testOrder.email);
        console.log('📧 Check your inbox for: CANCELLED notification');
        
        console.log('\n🎉 All status update tests completed!');
        console.log('📧 You should have received 5 emails:');
        console.log('   1. CONFIRMED status notification');
        console.log('   2. MANUFACTURING status notification');
        console.log('   3. SHIPPED status notification');
        console.log('   4. DELIVERED status notification');
        console.log('   5. CANCELLED status notification');
        console.log('\n📧 Check your inbox and spam folder for all notifications!');
        
      } catch (error) {
        console.error('❌ Cancellation failed:', error.response?.data || error.message);
      }
    }, 3000);
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Run the monitoring test
monitorOrderStatusEmails();

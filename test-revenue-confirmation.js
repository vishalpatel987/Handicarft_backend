const axios = require('axios');
require('dotenv').config();

async function testRevenueConfirmation() {
  try {
    console.log('Testing Revenue Confirmation...');
    
    // First, login as admin to get token
    console.log('\n1. Logging in as admin...');
    const loginResponse = await axios.post('http://localhost:5175/api/admin/login', {
      username: 'admin',
      password: 'admin123'
    });
    
    if (!loginResponse.data.success) {
      throw new Error('Admin login failed');
    }
    
    const token = loginResponse.data.token;
    console.log('Admin login successful');
    
    // Get orders
    console.log('\n2. Fetching orders...');
    const ordersResponse = await axios.get('http://localhost:5175/api/orders', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const orders = ordersResponse.data.orders || [];
    console.log(`Found ${orders.length} orders`);
    
    // Find a COD order that is delivered and has earned revenue
    const codDeliveredOrder = orders.find(order => 
      order.paymentMethod === 'cod' && 
      order.orderStatus === 'delivered' && 
      order.revenueStatus === 'earned'
    );
    
    if (!codDeliveredOrder) {
      console.log('No COD delivered orders with earned revenue found.');
      console.log('Available orders:');
      orders.forEach(order => {
        console.log(`- Order ${order._id}: Payment=${order.paymentMethod}, Status=${order.orderStatus}, Revenue=${order.revenueStatus}`);
      });
      return;
    }
    
    console.log(`Found COD delivered order: ${codDeliveredOrder._id}`);
    console.log('Order details:', {
      orderStatus: codDeliveredOrder.orderStatus,
      paymentMethod: codDeliveredOrder.paymentMethod,
      revenueStatus: codDeliveredOrder.revenueStatus,
      revenueAmount: codDeliveredOrder.revenueAmount,
      totalAmount: codDeliveredOrder.totalAmount
    });
    
    // Test revenue confirmation
    console.log('\n3. Testing revenue confirmation...');
    const confirmedAmount = codDeliveredOrder.revenueAmount || codDeliveredOrder.totalAmount;
    console.log(`Confirming amount: ${confirmedAmount}`);
    
    const confirmResponse = await axios.post(`http://localhost:5175/api/orders/${codDeliveredOrder._id}/confirm-cod`, {
      confirmedAmount: confirmedAmount
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (confirmResponse.data.success) {
      console.log('✅ Revenue confirmation successful:', {
        orderId: codDeliveredOrder._id,
        revenueStatus: confirmResponse.data.order.revenueStatus,
        adminReceivedAmount: confirmResponse.data.order.adminReceivedAmount,
        paymentStatus: confirmResponse.data.order.paymentStatus
      });
    } else {
      console.log('❌ Revenue confirmation failed:', confirmResponse.data);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Check if server is running
async function checkServer() {
  try {
    await axios.get('http://localhost:5175/health');
    console.log('✅ Server is running');
    return true;
  } catch (error) {
    console.log('❌ Server is not running. Please start the backend server first.');
    return false;
  }
}

async function main() {
  const serverRunning = await checkServer();
  if (serverRunning) {
    await testRevenueConfirmation();
  }
}

main();

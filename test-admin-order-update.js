const axios = require('axios');
require('dotenv').config();

async function testAdminOrderUpdate() {
  try {
    console.log('Testing Admin Order Status Update...');
    
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
    
    if (orders.length === 0) {
      console.log('No orders found. Please create some orders first.');
      return;
    }
    
    // Find a processing order to test with
    const processingOrder = orders.find(order => order.orderStatus === 'processing');
    if (!processingOrder) {
      console.log('No processing orders found. Testing with first available order...');
      const testOrder = orders[0];
      console.log(`Testing with order: ${testOrder._id} (Status: ${testOrder.orderStatus})`);
      
      // Test status update
      console.log('\n3. Testing order status update...');
      const updateResponse = await axios.put(`http://localhost:5175/api/orders/${testOrder._id}/status`, {
        orderStatus: 'confirmed'
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (updateResponse.data.success) {
        console.log('✅ Order status updated successfully:', {
          orderId: testOrder._id,
          newStatus: 'confirmed',
          response: updateResponse.data
        });
      } else {
        console.log('❌ Order status update failed:', updateResponse.data);
      }
      
    } else {
      console.log(`Found processing order: ${processingOrder._id}`);
      
      // Test status update to confirmed
      console.log('\n3. Testing order status update to confirmed...');
      const updateResponse = await axios.put(`http://localhost:5175/api/orders/${processingOrder._id}/status`, {
        orderStatus: 'confirmed'
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (updateResponse.data.success) {
        console.log('✅ Order status updated to confirmed successfully');
        
        // Test status update to manufacturing
        console.log('\n4. Testing order status update to manufacturing...');
        const manufacturingResponse = await axios.put(`http://localhost:5175/api/orders/${processingOrder._id}/status`, {
          orderStatus: 'manufacturing'
        }, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (manufacturingResponse.data.success) {
          console.log('✅ Order status updated to manufacturing successfully');
          
          // Test status update to shipped
          console.log('\n5. Testing order status update to shipped...');
          const shippedResponse = await axios.put(`http://localhost:5175/api/orders/${processingOrder._id}/status`, {
            orderStatus: 'shipped'
          }, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (shippedResponse.data.success) {
            console.log('✅ Order status updated to shipped successfully');
            
            // Test status update to delivered (if COD)
            if (processingOrder.paymentMethod === 'cod') {
              console.log('\n6. Testing COD order delivery...');
              const deliveredResponse = await axios.put(`http://localhost:5175/api/orders/${processingOrder._id}/status`, {
                orderStatus: 'delivered'
              }, {
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                }
              });
              
              if (deliveredResponse.data.success) {
                console.log('✅ COD order delivered successfully:', {
                  orderId: processingOrder._id,
                  paymentStatus: deliveredResponse.data.order.paymentStatus,
                  revenueStatus: deliveredResponse.data.order.revenueStatus,
                  revenueAmount: deliveredResponse.data.order.revenueAmount
                });
              } else {
                console.log('❌ COD order delivery failed:', deliveredResponse.data);
              }
            }
          } else {
            console.log('❌ Order status update to shipped failed:', shippedResponse.data);
          }
        } else {
          console.log('❌ Order status update to manufacturing failed:', manufacturingResponse.data);
        }
      } else {
        console.log('❌ Order status update to confirmed failed:', updateResponse.data);
      }
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
    console.log('Error:', error.message);
    return false;
  }
}

async function main() {
  const serverRunning = await checkServer();
  if (serverRunning) {
    await testAdminOrderUpdate();
  }
}

main();
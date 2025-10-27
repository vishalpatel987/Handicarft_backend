const axios = require('axios');

const API_BASE_URL = 'http://localhost:5000/api';

// Test admin dynamic system
async function testAdminDynamicSystem() {
  try {
    console.log('🧪 Testing Dynamic Admin System\n');

    // 1. Check admin status
    console.log('1️⃣ Checking admin registration status...');
    const statusResponse = await axios.get(`${API_BASE_URL}/admin/auth/status`);
    console.log('Status:', statusResponse.data);
    console.log('');

    // 2. Try to register admin (only works if no admin exists)
    if (!statusResponse.data.adminExists) {
      console.log('2️⃣ Attempting to register first admin...');
      try {
        const signupResponse = await axios.post(`${API_BASE_URL}/admin/auth/signup`, {
          username: 'testadmin',
          email: 'testadmin@example.com',
          password: 'testpassword123'
        });
        console.log('✅ Admin registration successful:', signupResponse.data);
      } catch (error) {
        console.log('❌ Admin registration failed:', error.response?.data || error.message);
      }
      console.log('');
    } else {
      console.log('2️⃣ Admin already exists, skipping registration...\n');
    }

    // 3. Try to register second admin (should fail)
    console.log('3️⃣ Attempting to register second admin (should fail)...');
    try {
      const secondSignupResponse = await axios.post(`${API_BASE_URL}/admin/auth/signup`, {
        username: 'secondadmin',
        email: 'secondadmin@example.com',
        password: 'secondpassword123'
      });
      console.log('❌ Second admin registration should have failed:', secondSignupResponse.data);
    } catch (error) {
      console.log('✅ Second admin registration correctly blocked:', error.response?.data?.message);
    }
    console.log('');

    // 4. Login with admin credentials
    console.log('4️⃣ Attempting admin login...');
    try {
      const loginResponse = await axios.post(`${API_BASE_URL}/admin/auth/login`, {
        email: 'testadmin@example.com',
        password: 'testpassword123'
      });
      console.log('✅ Admin login successful');
      const token = loginResponse.data.token;
      console.log('Token received:', token ? 'Yes' : 'No');
      console.log('Admin details:', loginResponse.data.user);
      console.log('');

      // 5. Test token verification
      console.log('5️⃣ Testing token verification...');
      try {
        const verifyResponse = await axios.get(`${API_BASE_URL}/admin/auth/verify`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        console.log('✅ Token verification successful:', verifyResponse.data);
      } catch (error) {
        console.log('❌ Token verification failed:', error.response?.data || error.message);
      }
      console.log('');

      // 6. Test credential update
      console.log('6️⃣ Testing credential update...');
      try {
        const updateResponse = await axios.put(`${API_BASE_URL}/admin/auth/update-credentials`, {
          username: 'updatedadmin',
          email: 'updatedadmin@example.com',
          currentPassword: 'testpassword123',
          newPassword: 'newpassword123'
        }, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        console.log('✅ Credential update successful:', updateResponse.data);
      } catch (error) {
        console.log('❌ Credential update failed:', error.response?.data || error.message);
      }
      console.log('');

      // 7. Test login with updated credentials
      console.log('7️⃣ Testing login with updated credentials...');
      try {
        const updatedLoginResponse = await axios.post(`${API_BASE_URL}/admin/auth/login`, {
          email: 'updatedadmin@example.com',
          password: 'newpassword123'
        });
        console.log('✅ Updated credentials login successful:', updatedLoginResponse.data.user);
      } catch (error) {
        console.log('❌ Updated credentials login failed:', error.response?.data || error.message);
      }

    } catch (error) {
      console.log('❌ Admin login failed:', error.response?.data || error.message);
    }

    console.log('\n🎉 Dynamic Admin System Test Complete!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
console.log('🚀 Starting Dynamic Admin System Test...\n');
testAdminDynamicSystem();

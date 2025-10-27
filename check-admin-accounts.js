require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('./models/Admin');

console.log('🔍 Checking Admin Accounts in Database...');

async function checkAdminAccounts() {
  try {
    // Connect to MongoDB
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/pawn';
    console.log('🔗 Connecting to MongoDB:', MONGODB_URI);
    
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('✅ MongoDB connected successfully');
    
    // Get all admin accounts
    const admins = await Admin.find({});
    console.log('\n👥 Admin Accounts Found:', admins.length);
    
    if (admins.length === 0) {
      console.log('❌ No admin accounts found in database');
      console.log('\n🔧 Creating default admin account...');
      
      const bcrypt = require('bcryptjs');
      const defaultAdmin = new Admin({
        email: 'admin@rikocraft.com',
        password: await bcrypt.hash('admin123', 10),
        name: 'Admin User',
        role: 'admin'
      });
      
      await defaultAdmin.save();
      console.log('✅ Default admin account created');
      console.log('📧 Email: admin@rikocraft.com');
      console.log('🔑 Password: admin123');
      
    } else {
      console.log('\n📋 Admin Accounts:');
      admins.forEach((admin, index) => {
        console.log(`${index + 1}. Email: ${admin.email}`);
        console.log(`   Name: ${admin.name || 'Not set'}`);
        console.log(`   Role: ${admin.role || 'Not set'}`);
        console.log(`   Created: ${admin.createdAt || 'Unknown'}`);
        console.log('');
      });
      
      // Test login for each admin
      console.log('\n🔐 Testing Admin Login...');
      const bcrypt = require('bcryptjs');
      
      for (const admin of admins) {
        console.log(`\n🔑 Testing login for: ${admin.email}`);
        
        // Test with common passwords
        const testPasswords = ['admin123', 'admin', 'password', '123456'];
        
        for (const password of testPasswords) {
          try {
            const isMatch = await bcrypt.compare(password, admin.password);
            if (isMatch) {
              console.log(`✅ Password found: ${password}`);
              break;
            }
          } catch (error) {
            console.log(`❌ Error testing password: ${password}`);
          }
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 MongoDB disconnected');
  }
}

checkAdminAccounts();

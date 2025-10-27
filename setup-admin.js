require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Admin = require('./models/Admin');

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pawn";

async function setupAdmin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB');

    // Check if any admin already exists
    const existingAdmin = await Admin.findOne({ isActive: true });
    if (existingAdmin) {
      console.log('Admin already exists in the system:');
      console.log('Admin details:', {
        id: existingAdmin._id,
        username: existingAdmin.username,
        email: existingAdmin.email,
        role: existingAdmin.role,
        lastLogin: existingAdmin.lastLogin
      });
      console.log('\nAdmin registration is disabled. Only one admin account is allowed.');
      return;
    }

    // Get admin details from command line arguments or use defaults
    const args = process.argv.slice(2);
    const username = args[0] || 'admin';
    const email = args[1] || 'admin@example.com';
    const password = args[2] || 'admin123';

    console.log('Setting up first admin account...');
    console.log('Username:', username);
    console.log('Email:', email);
    console.log('Password:', password);

    // Create new admin
    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = new Admin({
      username: username,
      email: email,
      password: hashedPassword,
      role: 'super_admin',
      isActive: true
    });

    await admin.save();
    console.log('\n✅ Admin created successfully!');
    console.log('Admin details:', {
      id: admin._id,
      username: admin.username,
      email: admin.email,
      role: admin.role,
      createdAt: admin.createdAt
    });
    console.log('\n🔐 Login credentials:');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('\n⚠️  Important: Please change the password after first login!');

  } catch (error) {
    console.error('❌ Error setting up admin:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Usage instructions
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('\n📖 Admin Setup Script Usage:');
  console.log('node setup-admin.js [username] [email] [password]');
  console.log('\nExamples:');
  console.log('node setup-admin.js');
  console.log('node setup-admin.js myadmin admin@mycompany.com mypassword123');
  console.log('\nNote: Only the first admin can be created. Subsequent attempts will be blocked.');
  process.exit(0);
}

setupAdmin();

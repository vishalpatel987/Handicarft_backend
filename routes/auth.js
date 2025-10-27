// Improved Express Auth Routes with better structure, security, and async handling
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const TempUser = require('../models/TempUser');
const UserActivity = require('../models/UserActivity');
const nodemailer = require('nodemailer');
const axios = require('axios');
const MSG91_AUTHKEY = process.env.MSG91_TOKEN_AUTH || "458779TNIVxOl3qDwI6866bc33P1";
const { OAuth2Client } = require("google-auth-library");
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || '487489664945-gubiolvb67gemfi384h9tkd9307l6njj.apps.googleusercontent.com');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret';

// Setup nodemailer transporter using only EMAIL_USER and EMAIL_PASS
const transporter = nodemailer.createTransport({
  service: 'gmail', // or leave blank for auto
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Email template function
const sendOTPEmail = async (email, otp, customerName, action = 'signup') => {
  const subject = 'Your OTP for Rikocraft Login / Signup';
  
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
      <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #333; margin: 0; font-size: 24px;">Rikocraft</h1>
          <p style="color: #666; margin: 5px 0; font-size: 14px;">Where heritage meets craftsmanship</p>
        </div>
        
        <div style="margin-bottom: 25px;">
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0;">
            Dear <strong>${customerName}</strong>,
          </p>
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 15px 0;">
            Thank you for choosing Rikocraft — where heritage meets craftsmanship!
          </p>
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 15px 0;">
            To proceed with your <strong>${action}</strong>, please use the One-Time Password (OTP) given below:
          </p>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; margin: 25px 0;">
          <p style="color: #333; font-size: 14px; margin: 0 0 10px 0;">🔐 Your OTP is:</p>
          <div style="background-color: #007bff; color: white; padding: 15px; border-radius: 6px; font-size: 24px; font-weight: bold; letter-spacing: 3px;">
            ${otp}
          </div>
        </div>
        
        <div style="margin: 25px 0; padding: 15px; background-color: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
          <p style="color: #856404; font-size: 14px; margin: 0; line-height: 1.5;">
            <strong>⚠️ Important:</strong> This OTP is valid for the next 10 minutes only. Please do not share this code with anyone for your security.
          </p>
        </div>
        
        <div style="margin: 25px 0;">
          <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 0;">
            If you did not request this OTP, please ignore this email.
          </p>
        </div>
        
        <div style="margin: 25px 0;">
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0;">
            Thank you for being a part of the Rikocraft community!
          </p>
        </div>
        
        <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
          <p style="color: #666; font-size: 14px; margin: 0; line-height: 1.6;">
            <strong>Warm regards,</strong><br>
            Team Rikocraft
          </p>
          <div style="margin-top: 15px; color: #666; font-size: 12px;">
            <p style="margin: 5px 0;">🌐 www.rikocraft.com</p>
            <p style="margin: 5px 0;">📩 Email: Care@Rikocraft.com</p>
          </div>
        </div>
      </div>
    </div>
  `;

  const textBody = `
Dear ${customerName},

Thank you for choosing Rikocraft — where heritage meets craftsmanship!

To proceed with your ${action}, please use the One-Time Password (OTP) given below:

🔐 Your OTP is: ${otp}

This OTP is valid for the next 10 minutes only. Please do not share this code with anyone for your security.

If you did not request this OTP, please ignore this email.

Thank you for being a part of the Rikocraft community!

Warm regards,
Team Rikocraft
🌐 www.rikocraft.com
📩 Email: Care@Rikocraft.com
  `;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: subject,
      text: textBody,
      html: htmlBody
    });
    console.log(`OTP email sent to ${email}`);
  } catch (mailErr) {
    console.error('Error sending OTP email:', mailErr);
    throw mailErr;
  }
};

async function sendOTPSMS(phone, otp) {
  if (!phone) return;
  const message = `Your OTP for Rikocraft is: ${otp}`;
  try {
    await axios.post('https://api.msg91.com/api/v2/sendsms', {
      sender: "RIKOCR",
      route: "4",
      country: "91",
      sms: [
        {
          message,
          to: [phone]
        }
      ]
    }, {
      headers: {
        authkey: MSG91_AUTHKEY,
        'Content-Type': 'application/json'
      }
    });
    console.log(`OTP SMS sent to ${phone}`);
  } catch (smsErr) {
    console.error('Error sending OTP SMS:', smsErr.response?.data || smsErr.message);
  }
}

// Middleware to protect routes
const auth = (req, res, next) => {
  // Check for token in Authorization header first
  let token = req.header('Authorization')?.replace('Bearer ', '');
  
  // If not in header, check cookies
  if (!token) {
    token = req.cookies?.token;
  }
  
  if (!token) return res.status(401).json({ message: 'No token, authorization denied' });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Token verification error:', err);
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// GET /me - Get current user information
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(401).json({ message: 'Invalid user' });

    res.json({ 
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        address: user.address || '',
        googleId: user.googleId || null
      }
    });
  } catch (err) {
    console.error('Error in /me route:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/validate-token', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(401).json({ message: 'Invalid user' });

    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /register (alias for /signup)
router.post('/register', async (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password || !phone) {
    return res.status(400).json({ message: 'Name, email, password, and phone are required' });
  }
  try {
    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return res.status(400).json({ message: 'Email or phone already registered' });
    }
    // Save user directly after OTP is verified
    const user = new User({ name, email, password, phone });
    await user.save();
    // Log in the user (issue JWT)
    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ 
      message: 'Registration complete.', 
      token, 
      user: { 
        id: user._id, 
        name: user.name, 
        email: user.email, 
        phone: user.phone,
        address: user.address || '',
        googleId: user.googleId || null
      } 
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /login
router.post('/login', async (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ message: 'Identifier and password are required' });
  }
  try {
    // Check if identifier is an email
    let user;
    const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (emailPattern.test(identifier)) {
      user = await User.findOne({ email: identifier });
    } else {
      user = await User.findOne({ phone: identifier });
    }
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Check if user is active
    if (user.isActive === false) {
      return res.status(401).json({ message: 'Your account has been blocked. Please contact support.' });
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Update user's last login time
    user.lastLogin = new Date();
    await user.save();

    // Track regular login activity
    try {
      const sessionId = `user_session_${user._id}_${Date.now()}`;
      const userActivity = new UserActivity({
        sessionId,
        userId: user._id,
        userType: 'registered',
        email: user.email,
        activities: [{
          type: 'login',
          metadata: { loginMethod: 'email' },
          timestamp: new Date()
        }]
      });
      await userActivity.save();
      console.log('✅ Regular login activity tracked for user:', user.email);
    } catch (activityError) {
      console.error('❌ Error tracking regular login activity:', activityError);
      // Don't fail login if activity tracking fails
    }

    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ 
      token, 
      user: { 
        id: user._id, 
        name: user.name, 
        email: user.email, 
        phone: user.phone,
        address: user.address || '',
        googleId: user.googleId || null
      } 
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /forgot-password (send OTP for password reset)
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'No user found with this email' });
    }
    // Generate OTP and expiry
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    // Save OTP and expiry in TempUser (or create if not exists)
    let temp = await TempUser.findOne({ email });
    if (!temp) {
      temp = await TempUser.create({ email, otp, otpExpires: expiresAt });
    } else {
      temp.otp = otp;
      temp.otpExpires = expiresAt;
      await temp.save();
    }
    
    // Send OTP via email with new template
    try {
      await sendOTPEmail(email, otp, user.name, 'password reset');
    } catch (mailErr) {
      console.error('Error sending password reset OTP email:', mailErr);
      // Don't fail the request if email fails
    }
    
    return res.json({ message: 'OTP sent to your email' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Error processing password reset request' });
  }
});

// POST /verify-forgot-otp (verify OTP and set new password)
router.post('/verify-forgot-otp', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) {
    return res.status(400).json({ message: 'Email, OTP, and new password are required' });
  }
  try {
    const temp = await TempUser.findOne({ email });
    if (!temp || temp.otp !== otp || !temp.otpExpires || temp.otpExpires < new Date()) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'No user found with this email' });
    }
    user.password = newPassword;
    await user.save();
    await TempUser.deleteOne({ email });
    return res.json({ message: 'Password reset successful. You can now log in with your new password.' });
  } catch (err) {
    console.error('Verify forgot OTP error:', err);
    res.status(500).json({ message: 'Error resetting password' });
  }
});

// POST /logout
router.post('/logout', async (req, res) => {
  try {
    // Clear the token cookie
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });
    
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Error in logout:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /update-profile (Protected)
router.put('/update-profile', auth, async (req, res) => {
  const { name, email, phone, address, currentPassword, newPassword } = req.body;
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Update basic fields
    if (name) user.name = name;
    if (email) user.email = email;
    if (phone !== undefined) user.phone = phone;
    if (address !== undefined) user.address = address;

    // Handle password change if provided
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ message: 'Current password is required to change password' });
      }
      
      // Check if user has a password (Google users might not have one)
      if (!user.password) {
        return res.status(400).json({ message: 'Cannot change password for Google users. Please use Google login.' });
      }
      
      // Check current password
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: 'Current password is incorrect' });
      }
      
      // Set new password (it will be hashed by the pre-save middleware)
      user.password = newPassword;
    }

    await user.save();

    return res.json({ 
      message: 'Profile updated successfully', 
      user: { 
        id: user._id, 
        name: user.name, 
        email: user.email,
        phone: user.phone,
        address: user.address,
        googleId: user.googleId
      } 
    });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ message: 'Error updating profile' });
  }
});

// POST /register-phone
router.post('/register-phone', async (req, res) => {
  const { name, phone, password } = req.body;
  // Validate phone: must be 12 digits, start with 91, and only digits
  if (!name || !phone || !password) {
    return res.status(400).json({ message: 'Name, phone, and password are required' });
  }
  if (!/^91[6-9][0-9]{9}$/.test(phone)) {
    return res.status(400).json({ message: 'Phone must start with 91 and be a valid 10-digit Indian mobile number' });
  }
  try {
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({ message: 'Phone already registered' });
    }
    const user = new User({ name, phone, password });
    await user.save();
    return res.json({ message: 'Account created successfully! Please sign in.', user });
  } catch (err) {
    console.error('Register-phone error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// for google login


// Send email function
function sendWelcomeEmail(toEmail, name) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: toEmail,
    subject: "Welcome to Our Platform 🎉",
    text: `Hi ${name},\n\nThanks for logging in with Google! We're glad to have you.`,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) console.log("Email Error:", error);
    else console.log("Email sent:", info.response);
  });
}

router.post("/google", async (req, res) => {
  try {
    const { token } = req.body;

    // Verify token with Google
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID || '487489664945-gubiolvb67gemfi384h9tkd9307l6njj.apps.googleusercontent.com',
    });

    const payload = ticket.getPayload();
    const { sub, email, name, phone_number } = payload;
    
    console.log('Google OAuth payload:', { sub, email, name, phone_number });

    // Save/find user in DB
    let user = await User.findOne({ email });
    if (!user) {
      // Create new user with Google data
      console.log('Creating new Google user:', { email, name, sub });
      user = await User.create({ 
        googleId: sub, 
        email, 
        name,
        phone: phone_number || '', // Use phone from Google if available
        address: '' // Initialize as empty string
      });
      console.log('New user created:', { id: user._id, phone: user.phone, address: user.address });
      sendWelcomeEmail(email, name); // only send email for new users
    } else {
      console.log('Existing user found:', { id: user._id, phone: user.phone, address: user.address });
      
      // Check if user is active
      if (user.isActive === false) {
        return res.status(401).json({ message: 'Your account has been blocked. Please contact support.' });
      }
      
      // Update existing user with Google ID if not already set
      if (!user.googleId) {
        user.googleId = sub;
        await user.save();
        console.log('Updated existing user with Google ID');
      }
      
      // Ensure phone and address are not null/undefined
      let needsUpdate = false;
      if (user.phone === null || user.phone === undefined) {
        user.phone = '';
        needsUpdate = true;
      }
      if (user.address === null || user.address === undefined) {
        user.address = '';
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        await user.save();
        console.log('Updated user phone/address fields:', { phone: user.phone, address: user.address });
      }
    }

    // Update user's last login time
    user.lastLogin = new Date();
    await user.save();

    // Track Google login activity
    try {
      const sessionId = `user_session_${user._id}_${Date.now()}`;
      const userActivity = new UserActivity({
        sessionId,
        userId: user._id,
        userType: 'registered',
        email: user.email,
        activities: [{
          type: 'login',
          metadata: { loginMethod: 'google' },
          timestamp: new Date()
        }]
      });
      await userActivity.save();
      console.log('✅ Google login activity tracked for user:', user.email);
    } catch (activityError) {
      console.error('❌ Error tracking Google login activity:', activityError);
      // Don't fail login if activity tracking fails
    }

    // Generate JWT token for the user
    const jwtToken = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });

    const responseData = { 
      message: "Login successful", 
      token: jwtToken,
      user: { 
        id: user._id, 
        name: user.name, 
        email: user.email, 
        phone: user.phone || '',
        address: user.address || '',
        googleId: user.googleId || null
      } 
    };
    
    console.log('Sending response:', responseData);
    res.json(responseData);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: "Google login failed" });
  }
});


module.exports = router;
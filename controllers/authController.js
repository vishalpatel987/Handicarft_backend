const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const UserActivity = require('../models/UserActivity');

const login = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validate input - accept either username or email
    if ((!username && !email) || !password) {
      return res.status(400).json({ message: "Email/Username and password are required" });
    }

    // Find user by email or username
    const user = await User.findOne(email ? { email } : { username });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Update user's last login time
    user.lastLogin = new Date();
    await user.save();

    // Track login activity
    try {
      const sessionId = `user_session_${user._id}_${Date.now()}`;
      const userActivity = new UserActivity({
        sessionId,
        userId: user._id,
        userType: 'registered',
        email: user.email,
        activities: [{
          type: 'login',
          timestamp: new Date()
        }]
      });
      await userActivity.save();
      console.log('✅ Login activity tracked for user:', user.email);
    } catch (activityError) {
      console.error('❌ Error tracking login activity:', activityError);
      // Don't fail login if activity tracking fails
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user._id, 
        username: user.username,
        email: user.email,
        isAdmin: false 
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        isAdmin: false
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  login
}; 
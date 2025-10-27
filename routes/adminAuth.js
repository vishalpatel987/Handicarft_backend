const express = require('express');
const router = express.Router();
const {
  adminLogin,
  adminSignup,
  updateAdminCredentials,
  verifyAdminToken,
  checkAdminStatus,
  adminForgotPassword,
  adminVerifyOTPAndResetPassword
} = require('../controllers/adminAuthController');

const { auth } = require('../middleware/auth');

// Check admin registration status route
router.get('/status', checkAdminStatus);

// Admin login route
router.post('/login', adminLogin);

// Admin signup route
router.post('/signup', adminSignup);

// Admin token verification route
router.get('/verify', verifyAdminToken);

// Update admin credentials route (requires authentication)
router.put('/update-credentials', auth, updateAdminCredentials);

// =======================
// PASSWORD RESET ROUTES
// =======================

// Forgot password - send OTP
router.post('/forgot-password', adminForgotPassword);

// Verify OTP and reset password
router.post('/verify-otp-reset', adminVerifyOTPAndResetPassword);

module.exports = router;

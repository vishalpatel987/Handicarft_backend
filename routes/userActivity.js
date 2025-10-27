const express = require('express');
const router = express.Router();
const { trackActivity, getUserAnalytics, getUserActivityDetails, getUserDetails } = require('../controllers/userActivityController');
const { authenticateToken, isAdmin } = require('../middleware/auth');

// Track user activity (public endpoint)
router.post('/track', trackActivity);

// Get user analytics (admin only) - TEMPORARILY UNPROTECTED FOR TESTING
router.get('/analytics', getUserAnalytics);

// Get detailed user activity (admin only)
router.get('/details', authenticateToken, isAdmin, getUserActivityDetails);

// Get user details (admin only) - TEMPORARILY UNPROTECTED FOR TESTING
router.get('/users', getUserDetails);

module.exports = router;

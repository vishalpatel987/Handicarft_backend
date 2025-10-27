const express = require('express');
const router = express.Router();
const wishlistController = require('../controllers/wishlistController');
const { authenticateToken, isAdmin } = require('../middleware/auth');

// User routes (authentication optional for GET, required for modifications)
router.get('/', wishlistController.getWishlist);
router.post('/add', wishlistController.addToWishlist);
router.post('/remove', wishlistController.removeFromWishlist);
router.post('/clear', wishlistController.clearWishlist);
router.get('/check', wishlistController.checkWishlistStatus);

// Admin routes
router.get('/admin/all', authenticateToken, isAdmin, wishlistController.getAllWishlists);
router.get('/admin/analytics', authenticateToken, isAdmin, wishlistController.getWishlistAnalytics);

module.exports = router;


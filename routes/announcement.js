const express = require('express');
const router = express.Router();
const { isAdmin, authenticateToken } = require('../middleware/auth');
const announcementController = require('../controllers/announcementController');

// ========== PUBLIC ROUTES ==========
router.get('/public', announcementController.getActiveAnnouncements);
router.post('/public/:id/view', announcementController.incrementViews);
router.post('/public/:id/click', announcementController.incrementClicks);

// ========== ADMIN ROUTES ==========
router.get('/admin', authenticateToken, isAdmin, announcementController.getAdminAnnouncements);
router.get('/admin/stats', authenticateToken, isAdmin, announcementController.getAnnouncementStats);
router.get('/admin/:id', authenticateToken, isAdmin, announcementController.getAdminAnnouncementById);
router.post('/admin', authenticateToken, isAdmin, announcementController.createAnnouncement);
router.put('/admin/:id', authenticateToken, isAdmin, announcementController.updateAnnouncement);
router.delete('/admin/:id', authenticateToken, isAdmin, announcementController.deleteAnnouncement);
router.patch('/admin/:id/toggle-status', authenticateToken, isAdmin, announcementController.toggleAnnouncementStatus);

module.exports = router;


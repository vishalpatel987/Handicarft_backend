const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { protect, authorize } = require('../middleware/auth');

// User routes
router.get('/user', protect, notificationController.getUserNotifications);
router.get('/user/unread-count', protect, notificationController.getUnreadCount);
router.put('/user/:notificationId/read', protect, notificationController.markAsRead);
router.put('/user/mark-all-read', protect, notificationController.markAllAsRead);
router.post('/user/:notificationId/click', protect, notificationController.trackClick);
router.delete('/user/:notificationId', protect, notificationController.deleteNotification);

// Admin routes
router.get('/admin', protect, authorize(['admin']), notificationController.getAllNotifications);
router.post('/admin', protect, authorize(['admin']), notificationController.createNotification);
router.get('/admin/stats', protect, authorize(['admin']), notificationController.getNotificationStats);
router.post('/admin/cleanup', protect, authorize(['admin']), notificationController.cleanupExpired);

module.exports = router;

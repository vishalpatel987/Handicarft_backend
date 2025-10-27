const NotificationService = require('../services/notificationService');
const Notification = require('../models/Notification');

// Get user notifications
const getUserNotifications = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const { limit = 20, skip = 0 } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const notifications = await NotificationService.getUserNotifications(
      userId,
      parseInt(limit),
      parseInt(skip)
    );

    const unreadCount = await NotificationService.getUnreadCount(userId);

    res.json({
      success: true,
      data: {
        notifications,
        unreadCount,
        pagination: {
          limit: parseInt(limit),
          skip: parseInt(skip),
          total: notifications.length
        }
      }
    });
  } catch (error) {
    console.error('Error fetching user notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Mark notification as read
const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user?.id || req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const notification = await NotificationService.markAsRead(notificationId, userId);

    res.json({
      success: true,
      message: 'Notification marked as read',
      data: notification
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Mark all notifications as read
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    await Notification.updateMany(
      {
        recipientId: userId,
        status: { $in: ['sent', 'delivered'] },
        readAt: { $exists: false }
      },
      {
        status: 'read',
        readAt: new Date()
      }
    );

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark all notifications as read',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get unread count
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const unreadCount = await NotificationService.getUnreadCount(userId);

    res.json({
      success: true,
      data: {
        unreadCount
      }
    });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unread count',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Track notification click
const trackClick = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user?.id || req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const notification = await Notification.findOne({
      _id: notificationId,
      recipientId: userId
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    await notification.trackClick();

    res.json({
      success: true,
      message: 'Click tracked successfully'
    });
  } catch (error) {
    console.error('Error tracking notification click:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track click',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Delete notification
const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user?.id || req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      recipientId: userId
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete notification',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Admin: Get all notifications
const getAllNotifications = async (req, res) => {
  try {
    const { 
      limit = 50, 
      skip = 0, 
      type, 
      category, 
      status, 
      recipientType,
      startDate,
      endDate
    } = req.query;

    const filter = {};

    if (type) filter.type = type;
    if (category) filter.category = category;
    if (status) filter.status = status;
    if (recipientType) filter.recipientType = recipientType;
    
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .populate('recipientId', 'name email');

    const total = await Notification.countDocuments(filter);

    res.json({
      success: true,
      data: {
        notifications,
        pagination: {
          limit: parseInt(limit),
          skip: parseInt(skip),
          total
        }
      }
    });
  } catch (error) {
    console.error('Error fetching all notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Admin: Create notification
const createNotification = async (req, res) => {
  try {
    const notificationData = req.body;

    const notification = await NotificationService.createNotification(notificationData);

    res.status(201).json({
      success: true,
      message: 'Notification created and sent successfully',
      data: notification
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create notification',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Admin: Get notification statistics
const getNotificationStats = async (req, res) => {
  try {
    const stats = await Notification.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          sent: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
          delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
          read: { $sum: { $cond: [{ $eq: ['$status', 'read'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } }
        }
      }
    ]);

    const typeStats = await Notification.aggregate([
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      }
    ]);

    const categoryStats = await Notification.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        overview: stats[0] || { total: 0, sent: 0, delivered: 0, read: 0, failed: 0 },
        byType: typeStats,
        byCategory: categoryStats
      }
    });
  } catch (error) {
    console.error('Error fetching notification stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notification statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Cleanup expired notifications
const cleanupExpired = async (req, res) => {
  try {
    const result = await NotificationService.cleanupExpired();

    res.json({
      success: true,
      message: `${result.deletedCount} expired notifications cleaned up`,
      data: { deletedCount: result.deletedCount }
    });
  } catch (error) {
    console.error('Error cleaning up expired notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup expired notifications',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

module.exports = {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  trackClick,
  deleteNotification,
  getAllNotifications,
  createNotification,
  getNotificationStats,
  cleanupExpired
};

const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  // Notification Information
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['info', 'success', 'warning', 'error', 'support', 'order', 'promotion'],
    default: 'info'
  },
  category: {
    type: String,
    enum: ['support_query', 'support_ticket', 'support_chat', 'order_update', 'promotion', 'system', 'general'],
    default: 'general'
  },

  // Recipient Information
  recipientId: {
    type: String,
    required: false, // For user-specific notifications
    ref: 'User'
  },
  recipientEmail: {
    type: String,
    required: false,
    trim: true,
    lowercase: true
  },
  recipientType: {
    type: String,
    enum: ['user', 'admin', 'all'],
    default: 'user'
  },

  // Related Entities
  relatedEntityType: {
    type: String,
    enum: ['support_query', 'support_ticket', 'support_chat', 'order', 'product', 'user'],
    required: false
  },
  relatedEntityId: {
    type: String,
    required: false
  },

  // Notification Channels
  channels: {
    email: {
      sent: { type: Boolean, default: false },
      sentAt: { type: Date, required: false },
      failed: { type: Boolean, default: false },
      failureReason: { type: String, required: false }
    },
    sms: {
      sent: { type: Boolean, default: false },
      sentAt: { type: Date, required: false },
      failed: { type: Boolean, default: false },
      failureReason: { type: String, required: false }
    },
    push: {
      sent: { type: Boolean, default: false },
      sentAt: { type: Date, required: false },
      failed: { type: Boolean, default: false },
      failureReason: { type: String, required: false }
    },
    inApp: {
      sent: { type: Boolean, default: false },
      sentAt: { type: Date, required: false }
    }
  },

  // Notification Status
  status: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'read', 'failed', 'cancelled'],
    default: 'pending'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },

  // Delivery Information
  scheduledFor: {
    type: Date,
    required: false
  },
  deliveredAt: {
    type: Date,
    required: false
  },
  readAt: {
    type: Date,
    required: false
  },
  expiresAt: {
    type: Date,
    required: false
  },

  // Action Information
  actionUrl: {
    type: String,
    required: false
  },
  actionText: {
    type: String,
    required: false
  },
  actionData: {
    type: mongoose.Schema.Types.Mixed,
    required: false
  },

  // Metadata
  metadata: {
    source: { type: String, required: false },
    campaignId: { type: String, required: false },
    templateId: { type: String, required: false },
    variables: { type: mongoose.Schema.Types.Mixed, required: false }
  },

  // Tracking
  clickCount: {
    type: Number,
    default: 0
  },
  lastClickedAt: {
    type: Date,
    required: false
  }
}, {
  timestamps: true
});

// Indexes for better performance
notificationSchema.index({ recipientId: 1, status: 1, createdAt: -1 });
notificationSchema.index({ recipientEmail: 1, status: 1 });
notificationSchema.index({ type: 1, category: 1 });
notificationSchema.index({ status: 1, scheduledFor: 1 });
notificationSchema.index({ expiresAt: 1 });
notificationSchema.index({ relatedEntityType: 1, relatedEntityId: 1 });

// Virtual for notification age
notificationSchema.virtual('age').get(function() {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Virtual for is expired
notificationSchema.virtual('isExpired').get(function() {
  return this.expiresAt && new Date() > this.expiresAt;
});

// Method to mark as read
notificationSchema.methods.markAsRead = function() {
  this.status = 'read';
  this.readAt = new Date();
  return this.save();
};

// Method to mark as delivered
notificationSchema.methods.markAsDelivered = function(channel) {
  if (this.channels[channel]) {
    this.channels[channel].sent = true;
    this.channels[channel].sentAt = new Date();
  }
  
  // Check if all channels are sent
  const allChannelsSent = Object.values(this.channels).every(ch => ch.sent);
  if (allChannelsSent) {
    this.status = 'delivered';
    this.deliveredAt = new Date();
  }
  
  return this.save();
};

// Method to mark as failed
notificationSchema.methods.markAsFailed = function(channel, reason) {
  if (this.channels[channel]) {
    this.channels[channel].failed = true;
    this.channels[channel].failureReason = reason;
  }
  
  // Check if all channels failed
  const allChannelsFailed = Object.values(this.channels).every(ch => ch.failed);
  if (allChannelsFailed) {
    this.status = 'failed';
  }
  
  return this.save();
};

// Method to track click
notificationSchema.methods.trackClick = function() {
  this.clickCount += 1;
  this.lastClickedAt = new Date();
  return this.save();
};

// Static method to get unread count
notificationSchema.statics.getUnreadCount = function(recipientId) {
  return this.countDocuments({
    recipientId: recipientId,
    status: { $in: ['sent', 'delivered'] },
    readAt: { $exists: false }
  });
};

// Static method to get notifications for user
notificationSchema.statics.getUserNotifications = function(recipientId, limit = 20, skip = 0) {
  return this.find({
    recipientId: recipientId,
    status: { $in: ['sent', 'delivered', 'read'] }
  })
  .sort({ createdAt: -1 })
  .limit(limit)
  .skip(skip);
};

// Static method to cleanup expired notifications
notificationSchema.statics.cleanupExpired = function() {
  return this.deleteMany({
    expiresAt: { $lt: new Date() }
  });
};

module.exports = mongoose.model('Notification', notificationSchema);

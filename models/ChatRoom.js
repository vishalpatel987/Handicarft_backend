const mongoose = require('mongoose');

const chatRoomSchema = new mongoose.Schema({
  // Room Information
  roomId: {
    type: String,
    required: true,
    unique: true
  },
  roomName: {
    type: String,
    required: false,
    trim: true
  },
  roomType: {
    type: String,
    enum: ['customer_support', 'admin_internal', 'group'],
    default: 'customer_support'
  },

  // Participants
  participants: [{
    userId: {
      type: String,
      required: true
    },
    userType: {
      type: String,
      enum: ['customer', 'admin'],
      required: true
    },
    userName: {
      type: String,
      required: true
    },
    userEmail: {
      type: String,
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    lastSeenAt: {
      type: Date,
      default: Date.now
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],

  // Room Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'closed', 'archived'],
    default: 'active'
  },
  isResolved: {
    type: Boolean,
    default: false
  },

  // Related Entities
  orderId: {
    type: String,
    required: false,
    ref: 'Order'
  },
  ticketId: {
    type: String,
    required: false,
    ref: 'SupportTicket'
  },
  queryId: {
    type: String,
    required: false,
    ref: 'SupportQuery'
  },

  // Chat Messages
  messages: [{
    messageId: {
      type: String,
      required: true,
      unique: false
    },
    senderId: {
      type: String,
      required: true
    },
    senderName: {
      type: String,
      required: true
    },
    senderType: {
      type: String,
      enum: ['customer', 'admin'],
      required: true
    },
    message: {
      type: String,
      required: true,
      trim: true
    },
    messageType: {
      type: String,
      enum: ['text', 'image', 'file', 'system'],
      default: 'text'
    },
    attachments: [{
      filename: String,
      url: String,
      mimetype: String,
      size: Number
    }],
    isRead: {
      type: Boolean,
      default: false
    },
    readBy: [{
      userId: String,
      readAt: {
        type: Date,
        default: Date.now
      }
    }],
    isEdited: {
      type: Boolean,
      default: false
    },
    editedAt: {
      type: Date,
      required: false
    },
    isDeleted: {
      type: Boolean,
      default: false
    },
    deletedAt: {
      type: Date,
      required: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Room Settings
  settings: {
    allowFileUpload: {
      type: Boolean,
      default: true
    },
    maxFileSize: {
      type: Number,
      default: 10485760 // 10MB
    },
    allowedFileTypes: {
      type: [String],
      default: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain']
    },
    autoCloseAfter: {
      type: Number,
      default: 24 // hours
    }
  },

  // Activity Tracking
  lastMessageAt: {
    type: Date,
    default: Date.now
  },
  lastActivityAt: {
    type: Date,
    default: Date.now
  },
  messageCount: {
    type: Number,
    default: 0
  },

  // Resolution
  resolvedAt: {
    type: Date,
    required: false
  },
  resolvedBy: {
    type: String,
    required: false,
    ref: 'Admin'
  },
  resolution: {
    type: String,
    required: false
  },

  // Customer Satisfaction
  customerRating: {
    type: Number,
    min: 1,
    max: 5,
    required: false
  },
  customerFeedback: {
    type: String,
    required: false
  }
}, {
  timestamps: true
});

// Indexes for better performance
chatRoomSchema.index({ roomId: 1 });
chatRoomSchema.index({ status: 1, lastMessageAt: -1 });
chatRoomSchema.index({ 'participants.userId': 1 });
chatRoomSchema.index({ 'participants.userType': 1 });
chatRoomSchema.index({ orderId: 1 });
chatRoomSchema.index({ ticketId: 1 });

// Virtual for active participants
chatRoomSchema.virtual('activeParticipants').get(function() {
  return this.participants.filter(p => p.isActive);
});

// Virtual for unread message count
chatRoomSchema.virtual('unreadCount').get(function() {
  return this.messages.filter(m => !m.isRead).length;
});

// Method to add message
chatRoomSchema.methods.addMessage = function(messageData) {
  const message = {
    messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    ...messageData,
    createdAt: new Date()
  };
  
  this.messages.push(message);
  this.lastMessageAt = new Date();
  this.lastActivityAt = new Date();
  this.messageCount += 1;
  
  return this.save();
};

// Method to mark messages as read
chatRoomSchema.methods.markAsRead = function(userId) {
  this.messages.forEach(message => {
    if (!message.readBy.some(r => r.userId === userId)) {
      message.readBy.push({
        userId: userId,
        readAt: new Date()
      });
    }
  });
  
  // Update participant's last seen
  const participant = this.participants.find(p => p.userId === userId);
  if (participant) {
    participant.lastSeenAt = new Date();
  }
  
  this.lastActivityAt = new Date();
  return this.save();
};

// Method to add participant
chatRoomSchema.methods.addParticipant = function(participantData) {
  const existingParticipant = this.participants.find(p => p.userId === participantData.userId);
  if (existingParticipant) {
    existingParticipant.isActive = true;
    existingParticipant.lastSeenAt = new Date();
  } else {
    this.participants.push({
      ...participantData,
      joinedAt: new Date(),
      lastSeenAt: new Date(),
      isActive: true
    });
  }
  
  this.lastActivityAt = new Date();
  return this.save();
};

// Method to remove participant
chatRoomSchema.methods.removeParticipant = function(userId) {
  const participant = this.participants.find(p => p.userId === userId);
  if (participant) {
    participant.isActive = false;
    participant.lastSeenAt = new Date();
  }
  
  this.lastActivityAt = new Date();
  return this.save();
};

// Method to close room
chatRoomSchema.methods.closeRoom = function(adminId, resolution = null) {
  this.status = 'closed';
  this.isResolved = true;
  this.resolvedAt = new Date();
  this.resolvedBy = adminId;
  this.resolution = resolution;
  this.lastActivityAt = new Date();
  return this.save();
};

// Static method to generate room ID
chatRoomSchema.statics.generateRoomId = function() {
  const prefix = 'ROOM';
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 6);
  return `${prefix}_${timestamp}_${random}`.toUpperCase();
};

module.exports = mongoose.model('ChatRoom', chatRoomSchema);

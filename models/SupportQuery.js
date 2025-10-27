const mongoose = require('mongoose');

const supportQuerySchema = new mongoose.Schema({
  // Customer Information
  customerName: {
    type: String,
    required: true,
    trim: true
  },
  customerEmail: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  customerPhone: {
    type: String,
    required: false,
    trim: true
  },
  userId: {
    type: String,
    required: false, // Optional for guest users
    ref: 'User'
  },

  // Query Details
  subject: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    required: true,
    enum: ['general', 'billing', 'shipping', 'product', 'technical', 'refund', 'order', 'account', 'other'],
    default: 'general'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'],
    default: 'open'
  },

  // Order Reference (if applicable)
  orderId: {
    type: String,
    required: false,
    ref: 'Order'
  },
  productId: {
    type: String,
    required: false,
    ref: 'Product'
  },

  // Admin Assignment
  assignedTo: {
    type: String,
    required: false,
    ref: 'Admin'
  },
  assignedAt: {
    type: Date,
    required: false
  },

  // Response Tracking
  responses: [{
    message: {
      type: String,
      required: true
    },
    sender: {
      type: String,
      required: true,
      enum: ['customer', 'admin']
    },
    senderName: {
      type: String,
      required: true
    },
    senderEmail: {
      type: String,
      required: true
    },
    attachments: [{
      filename: String,
      url: String,
      mimetype: String,
      size: Number
    }],
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Resolution
  resolution: {
    type: String,
    required: false
  },
  resolvedAt: {
    type: Date,
    required: false
  },
  resolvedBy: {
    type: String,
    required: false,
    ref: 'Admin'
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
  },

  // Internal Notes
  internalNotes: [{
    note: {
      type: String,
      required: true
    },
    addedBy: {
      type: String,
      required: true,
      ref: 'Admin'
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Tracking
  lastActivityAt: {
    type: Date,
    default: Date.now
  },
  isReadByAdmin: {
    type: Boolean,
    default: false
  },
  isReadByCustomer: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for better performance
supportQuerySchema.index({ status: 1, createdAt: -1 });
supportQuerySchema.index({ customerEmail: 1 });
supportQuerySchema.index({ assignedTo: 1 });
supportQuerySchema.index({ category: 1 });
supportQuerySchema.index({ priority: 1 });

// Virtual for response count
supportQuerySchema.virtual('responseCount').get(function() {
  return this.responses.length;
});

// Virtual for days since creation
supportQuerySchema.virtual('daysSinceCreation').get(function() {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Method to add response
supportQuerySchema.methods.addResponse = function(responseData) {
  this.responses.push(responseData);
  this.lastActivityAt = new Date();
  this.isReadByCustomer = responseData.sender === 'admin';
  this.isReadByAdmin = responseData.sender === 'customer';
  return this.save();
};

// Method to update status
supportQuerySchema.methods.updateStatus = function(newStatus, adminId = null) {
  this.status = newStatus;
  this.lastActivityAt = new Date();
  
  if (newStatus === 'resolved' || newStatus === 'closed') {
    this.resolvedAt = new Date();
    this.resolvedBy = adminId;
  }
  
  return this.save();
};

module.exports = mongoose.model('SupportQuery', supportQuerySchema);

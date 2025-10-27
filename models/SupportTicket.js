const mongoose = require('mongoose');

const supportTicketSchema = new mongoose.Schema({
  // Ticket Information
  ticketNumber: {
    type: String,
    required: true,
    unique: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },

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
    required: false,
    ref: 'User'
  },

  // Ticket Classification
  category: {
    type: String,
    required: true,
    enum: ['technical', 'billing', 'shipping', 'product', 'account', 'refund', 'general'],
    default: 'general'
  },
  subcategory: {
    type: String,
    required: false,
    trim: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['new', 'open', 'in_progress', 'pending_customer', 'pending_admin', 'resolved', 'closed'],
    default: 'new'
  },

  // Assignment
  assignedTo: {
    type: String,
    required: false,
    ref: 'Admin'
  },
  assignedAt: {
    type: Date,
    required: false
  },
  assignedBy: {
    type: String,
    required: false,
    ref: 'Admin'
  },

  // Related Entities
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
  relatedQueryId: {
    type: String,
    required: false,
    ref: 'SupportQuery'
  },

  // Communication
  messages: [{
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
    isInternal: {
      type: Boolean,
      default: false
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

  // SLA Tracking
  slaDeadline: {
    type: Date,
    required: false
  },
  firstResponseAt: {
    type: Date,
    required: false
  },
  resolutionDeadline: {
    type: Date,
    required: false
  },
  resolvedAt: {
    type: Date,
    required: false
  },
  closedAt: {
    type: Date,
    required: false
  },

  // Resolution
  resolution: {
    type: String,
    required: false
  },
  resolutionType: {
    type: String,
    enum: ['solved', 'duplicate', 'invalid', 'escalated'],
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
  feedbackSubmittedAt: {
    type: Date,
    required: false
  },

  // Internal Tracking
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

  // Activity Tracking
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
  },
  readByAdminAt: {
    type: Date,
    required: false
  },
  readByCustomerAt: {
    type: Date,
    required: false
  },

  // Escalation
  escalatedAt: {
    type: Date,
    required: false
  },
  escalatedBy: {
    type: String,
    required: false,
    ref: 'Admin'
  },
  escalatedTo: {
    type: String,
    required: false,
    ref: 'Admin'
  },
  escalationReason: {
    type: String,
    required: false
  }
}, {
  timestamps: true
});

// Indexes for better performance
supportTicketSchema.index({ ticketNumber: 1 });
supportTicketSchema.index({ status: 1, createdAt: -1 });
supportTicketSchema.index({ customerEmail: 1 });
supportTicketSchema.index({ assignedTo: 1 });
supportTicketSchema.index({ category: 1 });
supportTicketSchema.index({ priority: 1 });
supportTicketSchema.index({ lastActivityAt: -1 });

// Virtual for message count
supportTicketSchema.virtual('messageCount').get(function() {
  return this.messages.length;
});

// Virtual for days since creation
supportTicketSchema.virtual('daysSinceCreation').get(function() {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Virtual for SLA status
supportTicketSchema.virtual('slaStatus').get(function() {
  if (!this.slaDeadline) return 'no_sla';
  const now = new Date();
  if (now > this.slaDeadline) return 'breached';
  const hoursLeft = (this.slaDeadline - now) / (1000 * 60 * 60);
  if (hoursLeft <= 2) return 'at_risk';
  return 'on_track';
});

// Method to add message
supportTicketSchema.methods.addMessage = function(messageData) {
  this.messages.push(messageData);
  this.lastActivityAt = new Date();
  this.isReadByCustomer = messageData.sender === 'admin';
  this.isReadByAdmin = messageData.sender === 'customer';
  
  // Set first response time
  if (!this.firstResponseAt && messageData.sender === 'admin') {
    this.firstResponseAt = new Date();
  }
  
  return this.save();
};

// Method to update status
supportTicketSchema.methods.updateStatus = function(newStatus, adminId = null) {
  this.status = newStatus;
  this.lastActivityAt = new Date();
  
  if (newStatus === 'resolved') {
    this.resolvedAt = new Date();
    this.resolvedBy = adminId;
  } else if (newStatus === 'closed') {
    this.closedAt = new Date();
  }
  
  return this.save();
};

// Method to assign ticket
supportTicketSchema.methods.assignTicket = function(adminId, assignedBy) {
  this.assignedTo = adminId;
  this.assignedBy = assignedBy;
  this.assignedAt = new Date();
  this.lastActivityAt = new Date();
  return this.save();
};

// Static method to generate ticket number
supportTicketSchema.statics.generateTicketNumber = function() {
  const prefix = 'TKT';
  const year = new Date().getFullYear().toString().slice(-2);
  const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${year}${month}${random}`;
};

module.exports = mongoose.model('SupportTicket', supportTicketSchema);

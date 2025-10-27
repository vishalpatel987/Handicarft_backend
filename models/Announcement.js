const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['info', 'warning', 'success', 'error', 'promotion'],
    default: 'info'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'archived'],
    default: 'draft'
  },
  displayLocation: {
    type: [String],
    enum: ['home', 'shop', 'checkout', 'account', 'all'],
    default: ['home']
  },
  startDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  endDate: {
    type: Date
  },
  link: {
    url: {
      type: String,
      trim: true
    },
    text: {
      type: String,
      trim: true,
      default: 'Learn More'
    }
  },
  icon: {
    type: String,
    trim: true
  },
  backgroundColor: {
    type: String,
    default: '#3b82f6'
  },
  textColor: {
    type: String,
    default: '#ffffff'
  },
  isDismissible: {
    type: Boolean,
    default: true
  },
  showOnMobile: {
    type: Boolean,
    default: true
  },
  showOnDesktop: {
    type: Boolean,
    default: true
  },
  views: {
    type: Number,
    default: 0
  },
  clicks: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for better query performance
announcementSchema.index({ status: 1, startDate: -1 });
announcementSchema.index({ displayLocation: 1 });
announcementSchema.index({ priority: -1 });

// Method to check if announcement is currently active
announcementSchema.methods.isCurrentlyActive = function() {
  const now = new Date();
  const isActive = this.status === 'active' && 
                  this.startDate <= now && 
                  (!this.endDate || this.endDate >= now);
  return isActive;
};

module.exports = mongoose.model('Announcement', announcementSchema);


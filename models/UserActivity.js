const mongoose = require('mongoose');

const userActivitySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // For anonymous users
  },
  sessionId: {
    type: String,
    required: true // Unique session identifier
  },
  userType: {
    type: String,
    enum: ['registered', 'anonymous'],
    required: true
  },
  email: {
    type: String,
    required: false // For registered users
  },
  activities: [{
    type: {
      type: String,
      enum: ['page_view', 'category_visit', 'product_view', 'add_to_cart', 'search', 'login', 'register'],
      required: true
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: false
    },
    subCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: false
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: false
    },
    productName: {
      type: String,
      required: false
    },
    searchQuery: {
      type: String,
      required: false
    },
    page: {
      type: String,
      required: false
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  preferences: {
    favoriteCategories: [{
      category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category'
      },
      visitCount: {
        type: Number,
        default: 1
      },
      lastVisit: {
        type: Date,
        default: Date.now
      }
    }],
    favoriteSubCategories: [{
      subCategory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category'
      },
      visitCount: {
        type: Number,
        default: 1
      },
      lastVisit: {
        type: Date,
        default: Date.now
      }
    }]
  },
  sessionStart: {
    type: Date,
    default: Date.now
  },
  sessionEnd: {
    type: Date,
    required: false
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for better performance
userActivitySchema.index({ userId: 1, sessionId: 1 });
userActivitySchema.index({ sessionId: 1 });
userActivitySchema.index({ 'activities.timestamp': -1 });
userActivitySchema.index({ userType: 1 });

module.exports = mongoose.model('UserActivity', userActivitySchema);

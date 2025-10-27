const mongoose = require('mongoose');
const UserActivity = require('../models/UserActivity');
const User = require('../models/User');
const Category = require('../models/cate');
const Product = require('../models/Product');

// Track user activity
const trackActivity = async (req, res) => {
  try {
    const {
      sessionId,
      userId,
      userType,
      email,
      activityType,
      category,
      subCategory,
      productId,
      productName,
      searchQuery,
      page,
      metadata = {}
    } = req.body;

    // Validate required fields
    if (!sessionId || !userType || !activityType) {
      return res.status(400).json({
        success: false,
        message: 'sessionId, userType, and activityType are required'
      });
    }

    // Find or create user activity record
    let userActivity = await UserActivity.findOne({ sessionId });
    
    if (!userActivity) {
      userActivity = new UserActivity({
        sessionId,
        userId: userId || null,
        userType,
        email: email || null,
        activities: [],
        preferences: {
          favoriteCategories: [],
          favoriteSubCategories: []
        }
      });
    }

    // Add new activity
    const newActivity = {
      type: activityType,
      category: category || null,
      subCategory: subCategory || null,
      productId: productId || null,
      productName: productName || null,
      searchQuery: searchQuery || null,
      page: page || null,
      metadata,
      timestamp: new Date()
    };

    userActivity.activities.push(newActivity);

    // Update preferences for category visits
    if (activityType === 'category_visit' && category) {
      const existingCategory = userActivity.preferences.favoriteCategories.find(
        cat => cat.category.toString() === category
      );
      
      if (existingCategory) {
        existingCategory.visitCount += 1;
        existingCategory.lastVisit = new Date();
      } else {
        userActivity.preferences.favoriteCategories.push({
          category,
          visitCount: 1,
          lastVisit: new Date()
        });
      }
    }

    // Update preferences for subcategory visits
    if (activityType === 'category_visit' && subCategory) {
      const existingSubCategory = userActivity.preferences.favoriteSubCategories.find(
        sub => sub.subCategory.toString() === subCategory
      );
      
      if (existingSubCategory) {
        existingSubCategory.visitCount += 1;
        existingSubCategory.lastVisit = new Date();
      } else {
        userActivity.preferences.favoriteSubCategories.push({
          subCategory,
          visitCount: 1,
          lastVisit: new Date()
        });
      }
    }

    // Update session end time
    userActivity.sessionEnd = new Date();

    await userActivity.save();

    res.json({
      success: true,
      message: 'Activity tracked successfully',
      activityId: newActivity._id
    });
  } catch (error) {
    console.error('Error tracking activity:', error);
    res.status(500).json({
      success: false,
      message: 'Error tracking activity',
      error: error.message
    });
  }
};

// Get user analytics for admin
const getUserAnalytics = async (req, res) => {
  try {
    const { period = 'monthly' } = req.query;
    
    // Calculate date range
    const now = new Date();
    let startDate, endDate;
    
    switch (period) {
      case 'daily':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        break;
      case 'monthly':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        break;
      case 'yearly':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear() + 1, 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }

    // Get user registration stats
    const totalUsers = await User.countDocuments();
    const registeredUsers = await User.countDocuments({ 
      createdAt: { $gte: startDate, $lt: endDate } 
    });

    // Get user activity stats
    const userActivities = await UserActivity.find({
      createdAt: { $gte: startDate, $lt: endDate }
    }).populate('userId', 'name email googleId')
      .populate('activities.category', 'name')
      .populate('activities.subCategory', 'name')
      .populate('activities.productId', 'name');

    // Calculate activity statistics
    const registeredUserActivities = userActivities.filter(activity => activity.userType === 'registered');
    const anonymousUserActivities = userActivities.filter(activity => activity.userType === 'anonymous');

    // Get unique users who performed activities
    const uniqueRegisteredUsers = new Set();
    const uniqueAnonymousUsers = new Set();
    
    // Count registered users with activities
    registeredUserActivities.forEach(activity => {
      if (activity.userId) {
        uniqueRegisteredUsers.add(activity.userId.toString());
      }
    });
    
    // Count anonymous users with activities
    anonymousUserActivities.forEach(activity => {
      if (activity.sessionId) {
        uniqueAnonymousUsers.add(activity.sessionId);
      }
    });

    // Count activities by type
    const activityCounts = {
      page_view: 0,
      category_visit: 0,
      product_view: 0,
      add_to_cart: 0,
      search: 0,
      login: 0,
      register: 0
    };

    userActivities.forEach(activity => {
      activity.activities.forEach(act => {
        if (activityCounts[act.type] !== undefined) {
          activityCounts[act.type]++;
        }
      });
    });

    // Get most popular categories
    const categoryVisits = {};
    const subCategoryVisits = {};
    
    // Get most viewed products
    const productViews = {};

    userActivities.forEach(activity => {
      activity.activities.forEach(act => {
        if (act.type === 'category_visit') {
          if (act.category) {
            const categoryId = act.category._id ? act.category._id.toString() : act.category.toString();
            categoryVisits[categoryId] = (categoryVisits[categoryId] || 0) + 1;
          }
          if (act.subCategory) {
            const subCategoryId = act.subCategory._id ? act.subCategory._id.toString() : act.subCategory.toString();
            subCategoryVisits[subCategoryId] = (subCategoryVisits[subCategoryId] || 0) + 1;
          }
        } else if (act.type === 'product_view') {
          if (act.productId) {
            const productId = act.productId._id ? act.productId._id.toString() : act.productId.toString();
            const productName = act.productName || 'Unknown Product';
            productViews[productId] = {
              name: productName,
              viewCount: (productViews[productId]?.viewCount || 0) + 1,
              category: act.category || null
            };
          }
        }
      });
    });

    // Get category names from populated data
    const categoryMap = {};
    const subCategoryMap = {};
    
    userActivities.forEach(activity => {
      activity.activities.forEach(act => {
        if (act.type === 'category_visit') {
          if (act.category) {
            const categoryId = act.category._id ? act.category._id.toString() : act.category.toString();
            const categoryName = act.category.name || 'Unknown Category';
            categoryMap[categoryId] = categoryName;
          }
          if (act.subCategory) {
            const subCategoryId = act.subCategory._id ? act.subCategory._id.toString() : act.subCategory.toString();
            const subCategoryName = act.subCategory.name || 'Unknown Sub-Category';
            subCategoryMap[subCategoryId] = subCategoryName;
          }
        }
      });
    });

    // Format popular categories - show all visited categories
    const popularCategories = Object.entries(categoryVisits)
      .map(([id, count]) => ({
        categoryId: id,
        categoryName: categoryMap[id] || 'Unknown',
        visitCount: count
      }))
      .sort((a, b) => b.visitCount - a.visitCount);

    const popularSubCategories = Object.entries(subCategoryVisits)
      .map(([id, count]) => ({
        subCategoryId: id,
        subCategoryName: subCategoryMap[id] || 'Unknown',
        visitCount: count
      }))
      .sort((a, b) => b.visitCount - a.visitCount);

    // Format most viewed products
    const mostViewedProducts = Object.entries(productViews)
      .map(([id, data]) => ({
        productId: id,
        productName: data.name,
        viewCount: data.viewCount,
        category: data.category
      }))
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, 10);


    // Get users who registered but never logged in
    const usersWithLoginActivity = new Set();
    
    userActivities.forEach(activity => {
      if (activity.userType === 'registered' && activity.userId) {
        // Check if user has any login activity
        const hasLoginActivity = activity.activities.some(act => act.type === 'login');
        if (hasLoginActivity) {
          usersWithLoginActivity.add(activity.userId.toString());
        }
      }
    });

    // Filter valid ObjectIds only
    const validUserIds = Array.from(usersWithLoginActivity).filter(id => {
      try {
        new mongoose.Types.ObjectId(id);
        return true;
      } catch (error) {
        console.log('Invalid ObjectId found:', id);
        return false;
      }
    }).map(id => new mongoose.Types.ObjectId(id));

    const registeredButNotLoggedIn = await User.countDocuments({
      createdAt: { $gte: startDate, $lt: endDate },
      _id: { $nin: validUserIds }
    });

    res.json({
      success: true,
      analytics: {
        period,
        dateRange: { startDate, endDate },
        userStats: {
          totalUsers,
          registeredUsers,
          registeredButNotLoggedIn,
          activeRegisteredUsers: uniqueRegisteredUsers.size,
          activeAnonymousUsers: uniqueAnonymousUsers.size
        },
        activityStats: {
          totalActivities: userActivities.reduce((sum, activity) => sum + activity.activities.length, 0),
          activityCounts,
          registeredUserActivities: registeredUserActivities.length,
          anonymousUserActivities: anonymousUserActivities.length
        },
        popularCategories,
        popularSubCategories,
        mostViewedProducts,
        userEngagement: {
          registeredUserEngagement: uniqueRegisteredUsers.size,
          anonymousUserEngagement: uniqueAnonymousUsers.size,
          totalEngagement: uniqueRegisteredUsers.size + uniqueAnonymousUsers.size
        }
      }
    });
  } catch (error) {
    console.error('Error getting user analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting user analytics',
      error: error.message
    });
  }
};

// Get detailed user activity for admin
const getUserActivityDetails = async (req, res) => {
  try {
    const { userId, sessionId, limit = 50 } = req.query;
    
    let query = {};
    if (userId) {
      query.userId = userId;
    }
    if (sessionId) {
      query.sessionId = sessionId;
    }

    const userActivities = await UserActivity.find(query)
      .populate('userId', 'name email')
      .populate('activities.category', 'name')
      .populate('activities.subCategory', 'name')
      .populate('activities.productId', 'name')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      userActivities
    });
  } catch (error) {
    console.error('Error getting user activity details:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting user activity details',
      error: error.message
    });
  }
};

// Get user details for admin
const getUserDetails = async (req, res) => {
  try {
    console.log('🔍 Admin: Fetching user details...', req.query);
    const { userType = 'all', limit = 50 } = req.query;
    
    let result = {
      registered: [],
      anonymous: []
    };

    // Get registered users from User model
    if (userType === 'all' || userType === 'registered') {
      console.log('🔍 Fetching registered users...');
      
      const User = require('../models/User');
      const users = await User.find({})
        .select('name email phone address createdAt googleId lastLogin')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit));

      console.log('🔍 Found registered users:', users.length);

      // Get activity data for each user
      for (const user of users) {
        const userActivities = await UserActivity.find({ 
          userId: user._id,
          userType: 'registered'
        })
        .populate('activities.category', 'name')
        .populate('activities.subCategory', 'name')
        .populate('activities.productId', 'name category')
        .sort({ createdAt: -1 });

        const totalActivities = userActivities.reduce((sum, activity) => sum + activity.activities.length, 0);
        const lastActivity = userActivities.length > 0 ? 
          userActivities[0].sessionEnd || userActivities[0].createdAt : 
          user.createdAt;

        const allActivities = userActivities.flatMap(activity => activity.activities);

        result.registered.push({
          user: {
            _id: user._id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            address: user.address,
            createdAt: user.createdAt,
            googleId: user.googleId,
            lastLogin: user.lastLogin
          },
          activities: allActivities.slice(0, 10), // Show only last 10 activities
          totalActivities: totalActivities,
          lastActivity: lastActivity
        });
      }
    }

    // Get anonymous users from UserActivity model
    if (userType === 'all' || userType === 'anonymous') {
      console.log('🔍 Fetching anonymous users...');
      
      const anonymousActivities = await UserActivity.find({ 
        userType: 'anonymous'
      })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

      console.log('🔍 Found anonymous activities:', anonymousActivities.length);

      result.anonymous = anonymousActivities.map(activity => ({
        sessionId: activity.sessionId,
        activities: activity.activities.slice(0, 10), // Show only last 10 activities
        totalActivities: activity.activities.length,
        lastActivity: activity.sessionEnd || activity.createdAt,
        sessionStart: activity.sessionStart
      }));
    }

    console.log('🔍 Final result:', {
      registeredUsers: result.registered.length,
      anonymousSessions: result.anonymous.length
    });

    res.json({
      success: true,
      users: result
    });
  } catch (error) {
    console.error('❌ Error getting user details:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting user details',
      error: error.message
    });
  }
};

module.exports = {
  trackActivity,
  getUserAnalytics,
  getUserActivityDetails,
  getUserDetails
};

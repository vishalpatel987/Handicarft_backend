const Announcement = require('../models/Announcement');

// Get active announcements for specific location (public)
exports.getActiveAnnouncements = async (req, res) => {
  try {
    const { location = 'all' } = req.query;
    
    const now = new Date();
    
    const query = {
      status: 'active',
      startDate: { $lte: now },
      $or: [
        { endDate: { $exists: false } },
        { endDate: null },
        { endDate: { $gte: now } }
      ]
    };
    
    if (location !== 'all') {
      query.$or = [
        { displayLocation: location },
        { displayLocation: 'all' }
      ];
    }
    
    const announcements = await Announcement.find(query)
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      announcements
    });
  } catch (error) {
    console.error('Error fetching announcements:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching announcements', 
      error: error.message 
    });
  }
};

// Increment announcement views (public)
exports.incrementViews = async (req, res) => {
  try {
    const { id } = req.params;
    
    const announcement = await Announcement.findByIdAndUpdate(
      id,
      { $inc: { views: 1 } },
      { new: true }
    );
    
    if (!announcement) {
      return res.status(404).json({ 
        success: false, 
        message: 'Announcement not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'View counted'
    });
  } catch (error) {
    console.error('Error incrementing views:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error incrementing views', 
      error: error.message 
    });
  }
};

// Increment announcement clicks (public)
exports.incrementClicks = async (req, res) => {
  try {
    const { id } = req.params;
    
    const announcement = await Announcement.findByIdAndUpdate(
      id,
      { $inc: { clicks: 1 } },
      { new: true }
    );
    
    if (!announcement) {
      return res.status(404).json({ 
        success: false, 
        message: 'Announcement not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Click counted'
    });
  } catch (error) {
    console.error('Error incrementing clicks:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error incrementing clicks', 
      error: error.message 
    });
  }
};

// ========== ADMIN ENDPOINTS ==========

// Get all announcements for admin
exports.getAdminAnnouncements = async (req, res) => {
  try {
    const { status, type, priority, limit = 50, page = 1, search } = req.query;
    
    const query = {};
    
    if (status) query.status = status;
    if (type) query.type = type;
    if (priority) query.priority = priority;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const announcements = await Announcement.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);
    
    const total = await Announcement.countDocuments(query);
    
    res.json({
      success: true,
      announcements,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching admin announcements:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching announcements', 
      error: error.message 
    });
  }
};

// Get single announcement by ID for admin
exports.getAdminAnnouncementById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const announcement = await Announcement.findById(id);
    
    if (!announcement) {
      return res.status(404).json({ 
        success: false, 
        message: 'Announcement not found' 
      });
    }
    
    res.json({
      success: true,
      announcement
    });
  } catch (error) {
    console.error('Error fetching announcement:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching announcement', 
      error: error.message 
    });
  }
};

// Create new announcement (admin)
exports.createAnnouncement = async (req, res) => {
  try {
    const announcementData = req.body;
    
    const announcement = new Announcement(announcementData);
    await announcement.save();
    
    res.status(201).json({
      success: true,
      message: 'Announcement created successfully',
      announcement
    });
  } catch (error) {
    console.error('Error creating announcement:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creating announcement', 
      error: error.message 
    });
  }
};

// Update announcement (admin)
exports.updateAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const announcementData = req.body;
    
    const announcement = await Announcement.findByIdAndUpdate(
      id,
      announcementData,
      { new: true, runValidators: true }
    );
    
    if (!announcement) {
      return res.status(404).json({ 
        success: false, 
        message: 'Announcement not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Announcement updated successfully',
      announcement
    });
  } catch (error) {
    console.error('Error updating announcement:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating announcement', 
      error: error.message 
    });
  }
};

// Delete announcement (admin)
exports.deleteAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    
    const announcement = await Announcement.findByIdAndDelete(id);
    
    if (!announcement) {
      return res.status(404).json({ 
        success: false, 
        message: 'Announcement not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Announcement deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting announcement:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting announcement', 
      error: error.message 
    });
  }
};

// Toggle announcement status (admin)
exports.toggleAnnouncementStatus = async (req, res) => {
  try {
    const { id } = req.params;
    
    const announcement = await Announcement.findById(id);
    
    if (!announcement) {
      return res.status(404).json({ 
        success: false, 
        message: 'Announcement not found' 
      });
    }
    
    if (announcement.status === 'active') {
      announcement.status = 'archived';
    } else {
      announcement.status = 'active';
    }
    
    await announcement.save();
    
    res.json({
      success: true,
      message: `Announcement ${announcement.status === 'active' ? 'activated' : 'archived'} successfully`,
      announcement
    });
  } catch (error) {
    console.error('Error toggling announcement status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error toggling announcement status', 
      error: error.message 
    });
  }
};

// Get announcement statistics (admin)
exports.getAnnouncementStats = async (req, res) => {
  try {
    const total = await Announcement.countDocuments();
    const active = await Announcement.countDocuments({ status: 'active' });
    const draft = await Announcement.countDocuments({ status: 'draft' });
    const archived = await Announcement.countDocuments({ status: 'archived' });
    
    const totalViews = await Announcement.aggregate([
      { $group: { _id: null, total: { $sum: '$views' } } }
    ]);
    
    const totalClicks = await Announcement.aggregate([
      { $group: { _id: null, total: { $sum: '$clicks' } } }
    ]);
    
    const typeStats = await Announcement.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    res.json({
      success: true,
      stats: {
        total,
        active,
        draft,
        archived,
        totalViews: totalViews[0]?.total || 0,
        totalClicks: totalClicks[0]?.total || 0,
        byType: typeStats.map(type => ({
          type: type._id,
          count: type.count
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching announcement stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching announcement statistics', 
      error: error.message 
    });
  }
};


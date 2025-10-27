const Blog = require('../models/Blog');

// Get all blogs (public - only published)
exports.getAllBlogs = async (req, res) => {
  try {
    const { category, tag, featured, limit = 20, page = 1, search } = req.query;
    
    const query = { status: 'published' };
    
    if (category) query.category = category;
    if (tag) query.tags = tag;
    if (featured) query.isFeatured = featured === 'true';
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { excerpt: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const blogs = await Blog.find(query)
      .sort({ publishedAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .select('-content'); // Exclude full content in list
    
    const total = await Blog.countDocuments(query);
    
    res.json({
      success: true,
      blogs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching blogs:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching blogs', 
      error: error.message 
    });
  }
};

// Get single blog by slug (public)
exports.getBlogBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    
    const blog = await Blog.findOne({ slug, status: 'published' });
    
    if (!blog) {
      return res.status(404).json({ 
        success: false, 
        message: 'Blog not found' 
      });
    }
    
    // Increment views
    blog.views += 1;
    await blog.save();
    
    res.json({
      success: true,
      blog
    });
  } catch (error) {
    console.error('Error fetching blog:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching blog', 
      error: error.message 
    });
  }
};

// Get featured blogs (public)
exports.getFeaturedBlogs = async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    
    const blogs = await Blog.find({ 
      status: 'published', 
      isFeatured: true 
    })
      .sort({ publishedAt: -1 })
      .limit(parseInt(limit))
      .select('-content');
    
    res.json({
      success: true,
      blogs
    });
  } catch (error) {
    console.error('Error fetching featured blogs:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching featured blogs', 
      error: error.message 
    });
  }
};

// Get recent blogs (public)
exports.getRecentBlogs = async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    
    const blogs = await Blog.find({ status: 'published' })
      .sort({ publishedAt: -1 })
      .limit(parseInt(limit))
      .select('title slug excerpt featuredImage publishedAt category views');
    
    res.json({
      success: true,
      blogs
    });
  } catch (error) {
    console.error('Error fetching recent blogs:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching recent blogs', 
      error: error.message 
    });
  }
};

// Get blog categories with count (public)
exports.getBlogCategories = async (req, res) => {
  try {
    const categories = await Blog.aggregate([
      { $match: { status: 'published' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    res.json({
      success: true,
      categories: categories.map(cat => ({
        name: cat._id,
        count: cat.count
      }))
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching categories', 
      error: error.message 
    });
  }
};

// ========== ADMIN ENDPOINTS ==========

// Get all blogs for admin (including drafts)
exports.getAdminBlogs = async (req, res) => {
  try {
    const { status, category, limit = 50, page = 1, search } = req.query;
    
    const query = {};
    
    if (status) query.status = status;
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { excerpt: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const blogs = await Blog.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);
    
    const total = await Blog.countDocuments(query);
    
    res.json({
      success: true,
      blogs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching admin blogs:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching blogs', 
      error: error.message 
    });
  }
};

// Get single blog by ID for admin
exports.getAdminBlogById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const blog = await Blog.findById(id);
    
    if (!blog) {
      return res.status(404).json({ 
        success: false, 
        message: 'Blog not found' 
      });
    }
    
    res.json({
      success: true,
      blog
    });
  } catch (error) {
    console.error('Error fetching blog:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching blog', 
      error: error.message 
    });
  }
};

// Create new blog (admin)
exports.createBlog = async (req, res) => {
  try {
    console.log('=== Creating Blog ===');
    console.log('Request body:', req.body);
    console.log('Request files:', req.files);
    
    const blogData = req.body;
    
    // Validate required fields
    if (!blogData.title || !blogData.excerpt || !blogData.content) {
      console.log('Validation failed - missing required fields');
      console.log('Title:', blogData.title);
      console.log('Excerpt:', blogData.excerpt);
      console.log('Content:', blogData.content);
      return res.status(400).json({
        success: false,
        message: 'Title, excerpt, and content are required'
      });
    }
    
    // Handle file upload
    if (req.files && req.files.featuredImage) {
      const file = req.files.featuredImage[0];
      blogData.featuredImage = `/uploads/blogs/${file.filename}`;
      console.log('Featured image path:', blogData.featuredImage);
    }
    
    // Parse JSON fields
    if (typeof blogData.tags === 'string') {
      try {
        blogData.tags = JSON.parse(blogData.tags);
      } catch (e) {
        blogData.tags = [];
      }
    }
    
    if (typeof blogData.metaKeywords === 'string') {
      try {
        blogData.metaKeywords = JSON.parse(blogData.metaKeywords);
      } catch (e) {
        blogData.metaKeywords = [];
      }
    }
    
    // Generate unique slug
    if (!blogData.slug) {
      let baseSlug = blogData.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      let slug = baseSlug;
      let counter = 1;
      
      while (await Blog.findOne({ slug })) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }
      
      blogData.slug = slug;
    }
    
    console.log('Final blog data:', blogData);
    
    // Additional validation
    if (!blogData.title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Title cannot be empty'
      });
    }
    
    if (!blogData.excerpt.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Excerpt cannot be empty'
      });
    }
    
    if (!blogData.content.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Content cannot be empty'
      });
    }
    
    const blog = new Blog(blogData);
    await blog.save();
    
    console.log('Blog saved successfully:', blog._id);
    
    res.status(201).json({
      success: true,
      message: 'Blog created successfully',
      blog
    });
  } catch (error) {
    console.error('Error creating blog:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Error creating blog', 
      error: error.message 
    });
  }
};

// Update blog (admin)
exports.updateBlog = async (req, res) => {
  try {
    console.log('=== Updating Blog ===');
    console.log('Blog ID:', req.params.id);
    console.log('Request body:', req.body);
    console.log('Request files:', req.files);
    
    const { id } = req.params;
    
    // Validate ID
    if (!id || id === 'undefined') {
      return res.status(400).json({
        success: false,
        message: 'Invalid blog ID'
      });
    }
    
    // Find existing blog first
    const existingBlog = await Blog.findById(id);
    if (!existingBlog) {
      return res.status(404).json({ 
        success: false, 
        message: 'Blog not found' 
      });
    }
    
    const blogData = req.body;
    
    // Handle file upload
    if (req.files && req.files.featuredImage) {
      const file = req.files.featuredImage[0];
      blogData.featuredImage = `/uploads/blogs/${file.filename}`;
      console.log('Featured image path:', blogData.featuredImage);
    }
    
    // Parse JSON fields
    if (typeof blogData.tags === 'string') {
      try {
        blogData.tags = JSON.parse(blogData.tags);
      } catch (e) {
        blogData.tags = [];
      }
    }
    
    if (typeof blogData.metaKeywords === 'string') {
      try {
        blogData.metaKeywords = JSON.parse(blogData.metaKeywords);
      } catch (e) {
        blogData.metaKeywords = [];
      }
    }
    
    // Handle slug generation when title changes
    if (blogData.title && blogData.title !== existingBlog.title) {
      let baseSlug = blogData.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      let slug = baseSlug;
      let counter = 1;
      
      // Check for duplicate slugs (excluding current blog)
      while (await Blog.findOne({ slug, _id: { $ne: id } })) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }
      
      blogData.slug = slug;
    } else if (!blogData.slug) {
      // If slug is not provided and title hasn't changed, keep existing slug
      blogData.slug = existingBlog.slug;
    }
    
    // Handle published status and date
    if (blogData.status === 'published' && !existingBlog.publishedAt) {
      blogData.publishedAt = new Date();
    }
    
    console.log('Final blog data for update:', blogData);
    
    // Update blog using save() to trigger pre-save hooks if needed
    Object.assign(existingBlog, blogData);
    await existingBlog.save();
    
    console.log('Blog updated successfully:', existingBlog._id);
    
    res.json({
      success: true,
      message: 'Blog updated successfully',
      blog: existingBlog
    });
  } catch (error) {
    console.error('Error updating blog:', error);
    console.error('Error stack:', error.stack);
    
    // Check for duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: 'A blog with this slug already exists. Please use a different title.', 
        error: 'Duplicate slug error' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Error updating blog', 
      error: error.message 
    });
  }
};

// Delete blog (admin)
exports.deleteBlog = async (req, res) => {
  try {
    const { id } = req.params;
    
    const blog = await Blog.findByIdAndDelete(id);
    
    if (!blog) {
      return res.status(404).json({ 
        success: false, 
        message: 'Blog not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Blog deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting blog:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting blog', 
      error: error.message 
    });
  }
};

// Toggle blog status (admin)
exports.toggleBlogStatus = async (req, res) => {
  try {
    const { id } = req.params;
    
    const blog = await Blog.findById(id);
    
    if (!blog) {
      return res.status(404).json({ 
        success: false, 
        message: 'Blog not found' 
      });
    }
    
    blog.status = blog.status === 'published' ? 'draft' : 'published';
    
    if (blog.status === 'published' && !blog.publishedAt) {
      blog.publishedAt = new Date();
    }
    
    await blog.save();
    
    res.json({
      success: true,
      message: `Blog ${blog.status === 'published' ? 'published' : 'unpublished'} successfully`,
      blog
    });
  } catch (error) {
    console.error('Error toggling blog status:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Error toggling blog status', 
      error: error.message 
    });
  }
};

// Get blog statistics (admin)
exports.getBlogStats = async (req, res) => {
  try {
    const total = await Blog.countDocuments();
    const published = await Blog.countDocuments({ status: 'published' });
    const draft = await Blog.countDocuments({ status: 'draft' });
    const featured = await Blog.countDocuments({ isFeatured: true });
    
    const totalViews = await Blog.aggregate([
      { $group: { _id: null, total: { $sum: '$views' } } }
    ]);
    
    const categoryStats = await Blog.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    res.json({
      success: true,
      stats: {
        total,
        published,
        draft,
        featured,
        totalViews: totalViews[0]?.total || 0,
        byCategory: categoryStats.map(cat => ({
          category: cat._id,
          count: cat.count
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching blog stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching blog statistics', 
      error: error.message 
    });
  }
};


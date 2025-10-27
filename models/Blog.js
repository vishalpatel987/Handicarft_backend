const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  excerpt: {
    type: String,
    required: true,
    trim: true,
    maxlength: 300
  },
  content: {
    type: String,
    required: true
  },
  featuredImage: {
    type: String,
    default: ''
  },
  category: {
    type: String,
    enum: ['News', 'Tutorial', 'Product Review', 'Tips & Tricks', 'Company News', 'Other'],
    default: 'Other'
  },
  tags: [{
    type: String,
    trim: true
  }],
  author: {
    type: String,
    default: 'Admin'
  },
  status: {
    type: String,
    enum: ['draft', 'published'],
    default: 'draft'
  },
  publishedAt: {
    type: Date
  },
  views: {
    type: Number,
    default: 0
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  metaTitle: {
    type: String,
    trim: true,
    default: ''
  },
  metaDescription: {
    type: String,
    trim: true,
    default: ''
  },
  metaKeywords: [{
    type: String,
    trim: true
  }]
}, {
  timestamps: true
});

// Create slug from title before saving
blogSchema.pre('save', async function(next) {
  try {
    // Generate slug if title is modified and slug is not provided
    if (this.isModified('title') && !this.slug) {
      let baseSlug = this.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      let slug = baseSlug;
      let counter = 1;
      
      // Ensure unique slug
      const Blog = this.constructor;
      while (await Blog.findOne({ slug, _id: { $ne: this._id } })) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }
      
      this.slug = slug;
    }
    
    // Set publishedAt when status changes to published
    if (this.isModified('status') && this.status === 'published' && !this.publishedAt) {
      this.publishedAt = new Date();
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Index for better query performance
blogSchema.index({ slug: 1 });
blogSchema.index({ status: 1, publishedAt: -1 });
blogSchema.index({ category: 1 });
blogSchema.index({ isFeatured: 1 });

module.exports = mongoose.model('Blog', blogSchema);


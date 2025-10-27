const express = require('express');
const router = express.Router();
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const { isAdmin, authenticateToken } = require('../middleware/auth');
const blogController = require('../controllers/blogController');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dbwizqyzg',
  api_key: process.env.CLOUDINARY_API_KEY || '762844878266977',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'RlQqTNM6X6XkusiK45uVl_N34ok'
});

// Configure multer storage - Using disk storage for now to avoid Cloudinary issues
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads/blogs');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'blog-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check file type
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

// Handle file upload with error handling
const handleUpload = upload.fields([
  { name: 'featuredImage', maxCount: 1 }
]);

const uploadMiddleware = (req, res, next) => {
  console.log('=== Upload Middleware ===');
  console.log('Request headers:', req.headers);
  console.log('Content-Type:', req.headers['content-type']);
  
  handleUpload(req, res, (err) => {
    if (err) {
      console.error('Upload error:', err);
      console.error('Upload error details:', err.message);
      
      // Handle different types of upload errors
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ 
          success: false,
          message: 'File size too large. Maximum size is 5MB.',
          error: err.message 
        });
      } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ 
          success: false,
          message: 'Unexpected file field.',
          error: err.message 
        });
      } else {
        return res.status(400).json({ 
          success: false,
          message: 'File upload failed',
          error: err.message 
        });
      }
    }
    
    console.log('Upload middleware passed successfully');
    console.log('Files received:', req.files);
    next();
  });
};

// ========== PUBLIC ROUTES ==========
router.get('/public', blogController.getAllBlogs);
router.get('/public/slug/:slug', blogController.getBlogBySlug);
router.get('/public/featured', blogController.getFeaturedBlogs);
router.get('/public/recent', blogController.getRecentBlogs);
router.get('/public/categories', blogController.getBlogCategories);

// ========== ADMIN ROUTES ==========
router.get('/admin', authenticateToken, isAdmin, blogController.getAdminBlogs);
router.get('/admin/stats', authenticateToken, isAdmin, blogController.getBlogStats);
router.get('/admin/:id', authenticateToken, isAdmin, blogController.getAdminBlogById);
router.post('/admin', authenticateToken, isAdmin, uploadMiddleware, blogController.createBlog);
router.put('/admin/:id', authenticateToken, isAdmin, uploadMiddleware, blogController.updateBlog);
router.delete('/admin/:id', authenticateToken, isAdmin, blogController.deleteBlog);
router.patch('/admin/:id/toggle-status', authenticateToken, isAdmin, blogController.toggleBlogStatus);

module.exports = router;


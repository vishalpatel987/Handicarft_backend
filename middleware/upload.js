const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dbwizqyzg',
  api_key: process.env.CLOUDINARY_API_KEY || '762844878266977',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'RlQqTNM6X6XkusiK45uVl_N34ok'
});

// Configure storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // Always use portrait for mobile banners
    return {
      folder: 'hero-carousel',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'mp4'],
      resource_type: 'auto',
      transformation: [{ width: 720, height: 1280, crop: 'limit' }]
    };
  }
});

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

module.exports = upload; 
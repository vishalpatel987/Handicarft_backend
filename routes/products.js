// File: admin/backend/routes/products.js
const express = require("express");
const router = express.Router();
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const { isAdmin, authenticateToken } = require('../middleware/auth');
const {
  getAllProducts,
  getProduct,
  createProductWithFiles,
  updateProductWithFiles,
  updateProductSections,
  deleteProduct,
  getProductsBySection
} = require('../controllers/productController');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dbwizqyzg',
  api_key: process.env.CLOUDINARY_API_KEY || '762844878266977',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'RlQqTNM6X6XkusiK45uVl_N34ok'
});

// Configure storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'products',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 800, height: 800, crop: 'limit' }],
    resource_type: 'auto'
  }
});

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Configure multiple file upload fields
const uploadFields = upload.fields([
  { name: 'mainImage', maxCount: 1 },
  { name: 'image1', maxCount: 1 },
  { name: 'image2', maxCount: 1 },
  { name: 'image3', maxCount: 1 }
]);

// Middleware to handle multer upload
const handleUpload = (req, res, next) => {
  uploadFields(req, res, function(err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: 'File upload error', details: err.message });
    } else if (err) {
      return res.status(500).json({ error: 'File upload error', details: err.message });
    }
    next();
  });
};

// Public routes
router.get("/", getAllProducts);
router.get("/section/:section", getProductsBySection);
router.get("/:id", getProduct);

// Admin routes
router.post("/", authenticateToken, isAdmin, handleUpload, createProductWithFiles);
router.put("/:id", authenticateToken, isAdmin, handleUpload, updateProductWithFiles);
router.patch("/:id/sections", authenticateToken, isAdmin, updateProductSections);
router.delete("/:id", authenticateToken, isAdmin, deleteProduct);

module.exports = router;

const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authAdmin } = require('../middleware/auth');

// All routes require admin authentication
router.use(authAdmin);

// Get all users
router.get('/', userController.getAllUsers);

// Get user statistics
router.get('/stats', userController.getUserStats);

// Get user by ID
router.get('/:id', userController.getUserById);

// Update user
router.put('/:id', userController.updateUser);

// Delete user
router.delete('/:id', userController.deleteUser);

// Reset user password
router.post('/:id/reset-password', userController.resetUserPassword);

module.exports = router;

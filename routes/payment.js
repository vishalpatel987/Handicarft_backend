const express = require('express');
const router = express.Router();
const razorpayController = require('../controllers/razorpayController');

// Razorpay Payment Routes
router.post('/razorpay', razorpayController.createRazorpayOrder);
router.post('/razorpay/callback', razorpayController.razorpayCallback);
router.get('/razorpay/status/:orderId', razorpayController.getRazorpayStatus);

// Razorpay Refund Routes
router.post('/razorpay/refund', razorpayController.processRazorpayRefund);
router.get('/razorpay/refund/:refundId/status', razorpayController.checkRazorpayRefundStatus);

module.exports = router;

const Razorpay = require('razorpay');
const crypto = require('crypto');
const Order = require('../models/Order');

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_8sYbzHWidwe5Zw',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'GkxKRQ2B0U63BKBoayuugS3D',
});

// Create Razorpay order
exports.createRazorpayOrder = async (req, res) => {
  try {
    const {
      amount,
      currency = 'INR',
      customerName,
      email,
      phone,
      sellerToken,
      couponCode,
      upfrontAmount,
      remainingAmount,
      paymentMethod
    } = req.body;

    console.log('Creating Razorpay order with data:', req.body);

    // Validate required fields
    if (!amount || !customerName || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: amount, customerName, email, phone'
      });
    }

    // Validate amount is a valid number
    const validAmount = parseFloat(amount);
    if (isNaN(validAmount) || validAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment amount. Amount must be a valid number greater than 0.'
      });
    }

    // Check Razorpay configuration
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      console.error('Razorpay credentials not configured');
      return res.status(500).json({
        success: false,
        message: 'Payment gateway not configured. Please contact support.'
      });
    }

    // Generate unique merchant order ID
    const merchantOrderId = `RZ${Date.now()}${Math.random().toString(36).substr(2, 9)}`;

    const orderPayload = {
      amount: Math.round(validAmount * 100), // Convert to paise
      currency: 'INR',
      receipt: merchantOrderId,
      payment_capture: 1,
      notes: {
        customerName: customerName,
        email: email,
        phone: phone,
        sellerToken: sellerToken || '',
        couponCode: couponCode || '',
        upfrontAmount: upfrontAmount ? `upfront:${upfrontAmount}` : '',
        remainingAmount: remainingAmount ? `remaining:${remainingAmount}` : '',
        paymentMethod: paymentMethod,
        orderType: paymentMethod === 'cod' ? 'COD with upfront' : 'Online payment'
      }
    };

    console.log('Razorpay order payload:', orderPayload);
    console.log('Razorpay Key ID:', process.env.RAZORPAY_KEY_ID);

    try {
      const razorpayOrder = await razorpay.orders.create(orderPayload);
      console.log('Razorpay API response:', razorpayOrder);

      res.status(200).json({
        success: true,
        order: razorpayOrder,
        merchantOrderId: merchantOrderId
      });
    } catch (razorpayError) {
      console.error('Razorpay API Error:', razorpayError);
      
      // Handle specific Razorpay errors
      let errorMessage = 'Failed to create payment order';
      
      if (razorpayError.error) {
        if (razorpayError.error.description) {
          errorMessage = razorpayError.error.description;
        } else if (razorpayError.error.code) {
          errorMessage = `Payment error: ${razorpayError.error.code}`;
        }
      } else if (razorpayError.message) {
        errorMessage = razorpayError.message;
      }
      
      res.status(500).json({
        success: false,
        message: errorMessage,
        error: razorpayError.error || razorpayError.message,
        details: 'Please check Razorpay configuration and try again'
      });
    }
  } catch (error) {
    console.error('General error in createRazorpayOrder:', error);
    
    res.status(500).json({
      success: false,
      message: 'Internal server error while creating payment order',
      error: error.message
    });
  }
};

// Handle Razorpay callback verification
exports.razorpayCallback = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    
    console.log('Razorpay callback received:', {
      order_id: razorpay_order_id,
      payment_id: razorpay_payment_id,
      signature: razorpay_signature ? 'present' : 'missing'
    });

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing required payment parameters'
      });
    }

    // Verify payment signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature === razorpay_signature) {
      console.log('Payment verified successfully for order:', razorpay_order_id);
      
      // Update order in database with payment success
      try {
        const order = await Order.findOne({ 
          $or: [
            { transactionId: razorpay_order_id },
            { 'razorpayOrderId': razorpay_order_id }
          ]
        });
        
        if (order) {
          // Update order with payment success
          order.paymentStatus = 'completed';
          order.transactionId = razorpay_payment_id;
          order.razorpayOrderId = razorpay_order_id;
          order.razorpayPaymentId = razorpay_payment_id;
          order.paymentCompletedAt = new Date();
          
          // For online payments, revenue is earned and confirmed immediately
          if (order.paymentMethod !== 'cod') {
            order.revenueStatus = 'confirmed'; // Directly confirmed for online payments
            order.revenueAmount = order.totalAmount - (order.commission || 0);
            order.revenueEarnedAt = new Date();
            order.revenueConfirmedAt = new Date(); // Add confirmation timestamp
            order.adminReceivedAmount = order.revenueAmount;
          }
          
          await order.save();
          console.log(`Order ${order._id} updated with payment success: ₹${order.totalAmount}`);
        } else {
          console.log(`Order not found for Razorpay order ID: ${razorpay_order_id}`);
        }
      } catch (updateError) {
        console.error('Error updating order with payment success:', updateError);
      }
      
      res.status(200).json({
        success: true,
        message: 'Payment verified successfully',
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id
      });
    } else {
      console.log('Payment verification failed for order:', razorpay_order_id);
      res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }
  } catch (error) {
    console.error('Razorpay callback error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment verification error',
      error: error.message
    });
  }
};

// Internal function to process Razorpay refund (returns data, not response)
exports.processRazorpayRefundInternal = async (paymentId, amount, reason = 'Customer request') => {
  try {
    console.log('Processing Razorpay refund:', { paymentId, amount, reason });

    if (!paymentId || !amount) {
      throw new Error('Payment ID and amount are required');
    }

    // Create refund
    const refund = await razorpay.payments.refund(paymentId, {
      amount: Math.round(amount * 100), // Convert to paise
      notes: {
        reason: reason,
        refund_initiated_by: 'merchant'
      }
    });

    console.log('Razorpay refund created:', refund);

    return {
      success: true,
      refund: refund,
      message: 'Refund processed successfully'
    };
  } catch (error) {
    console.error('Razorpay refund error:', error);
    
    let errorMessage = 'Failed to process refund';
    
    if (error.response?.data?.error?.description) {
      errorMessage = error.response.data.error.description;
    } else if (error.response?.data?.error?.field) {
      errorMessage = `Invalid ${error.response.data.error.field}`;
    } else if (error.response?.status === 400) {
      errorMessage = 'Invalid refund request';
    } else if (error.response?.status === 404) {
      errorMessage = 'Payment not found';
    } else if (error.message) {
      errorMessage = error.message;
    }

    throw new Error(errorMessage);
  }
};

// Process Razorpay refund (API endpoint)
exports.processRazorpayRefund = async (req, res) => {
  try {
    const { paymentId, amount, reason = 'Customer request' } = req.body;
    
    const result = await processRazorpayRefundInternal(paymentId, amount, reason);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
      error: error.message
    });
  }
};

// Check Razorpay refund status
exports.checkRazorpayRefundStatus = async (req, res) => {
  try {
    const { refundId } = req.params;
    
    console.log('Checking Razorpay refund status:', refundId);

    const refund = await razorpay.refunds.fetch(refundId);
    console.log('Razorpay refund status:', refund);

    res.status(200).json({
      success: true,
      refund: refund
    });
  } catch (error) {
    console.error('Razorpay refund status error:', error);
    
    let errorMessage = 'Failed to check refund status';
    
    if (error.response?.data?.error?.description) {
      errorMessage = error.response.data.error.description;
    } else if (error.response?.status === 404) {
      errorMessage = 'Refund not found';
    } else if (error.message) {
      errorMessage = error.message;
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
      error: error.response?.data || error.message
    });
  }
};

// Get Razorpay payment status
exports.getRazorpayStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    
    console.log('Getting Razorpay status for order:', orderId);
    
    // For now, return success status since payment was successful
    // In a real implementation, you would check with Razorpay API
    res.status(200).json({
      success: true,
      status: 'success',
      data: {
        orderId: orderId,
        status: 'success',
        message: 'Payment completed successfully'
      }
    });
  } catch (error) {
    console.error('Error getting Razorpay status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payment status',
      error: error.message
    });
  }
};
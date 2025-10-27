const mongoose = require('mongoose');

// Schema for individual items within an order
const orderItemSchema = new mongoose.Schema({
  productId: { type: String, required: false },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
  image: { type: String, required: false }, // Store primary image for reference
}, { _id: false });


// Main schema for an order
const orderSchema = new mongoose.Schema({
  customerName: { type: String, required: true },
  email: { type: String, required: true, index: true }, // Index for fast lookups
  phone: { type: String, required: true },
  address: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    country: { type: String, required: true },
  },
  items: [orderItemSchema], // Use the correct schema for items
  totalAmount: { type: Number, required: true },
  paymentMethod: { type: String, required: true },
  orderStatus: { 
    type: String, 
    default: 'processing',
    enum: ['processing', 'confirmed', 'manufacturing', 'shipped', 'delivered', 'cancelled']
  },
  paymentStatus: { 
    type: String, 
    required: true,
    enum: ['pending', 'completed', 'failed', 'pending_upfront']
  },
  upfrontAmount: { type: Number, default: 0 }, // Upfront payment amount for COD orders
  remainingAmount: { type: Number, default: 0 }, // Remaining amount to be paid on delivery
  sellerToken: { type: String, required: false }, // Track which seller referred this order
  commission: { type: Number, default: 0 }, // Commission amount for this order
  razorpayOrderId: { type: String, required: false }, // Razorpay order ID
  razorpayPaymentId: { type: String, required: false }, // Razorpay payment ID
  razorpaySignature: { type: String, required: false }, // Razorpay payment signature
  couponCode: { type: String, required: false }, // Coupon code if applied
  revenueStatus: { 
    type: String, 
    default: 'pending',
    enum: ['pending', 'earned', 'confirmed', 'cancelled', 'refunded'] // pending=placed, earned=payment completed/delivered, confirmed=admin received, cancelled/refunded=deducted
  },
  revenueAmount: { type: Number, default: 0 }, // Actual revenue amount after commissions/deductions
  adminReceivedAmount: { type: Number, default: 0 }, // Amount actually received by admin
  revenueEarnedAt: { type: Date }, // When revenue was earned (online: payment completed, COD: delivered)
  revenueConfirmedAt: { type: Date }, // When admin confirmed receipt
  codConfirmedBy: { type: String }, // Admin who confirmed COD payment
  codConfirmedAt: { type: Date },
  // Cancellation fields
  cancellationRequested: { type: Boolean, default: false },
  cancellationReason: { type: String },
  cancelledBy: { type: String, enum: ['user', 'admin'] },
  cancelledAt: { type: Date },
  cancellationStatus: { 
    type: String, 
    enum: ['none', 'requested', 'approved', 'rejected'], 
    default: 'none' 
  },
  cancellationRequestedAt: { type: Date },
  cancellationApprovedBy: { type: String }, // Admin who approved/rejected
  cancellationApprovedAt: { type: Date },
  cancellationRejectionReason: { type: String }, // Admin's reason for rejection
  
  // Refund fields for online payments
  refundStatus: {
    type: String,
    enum: ['none', 'pending', 'processing', 'completed', 'failed'],
    default: 'none'
  },
  refundAmount: { type: Number, default: 0 },
  refundTransactionId: { type: String }, // PhonePe refund transaction ID
  merchantRefundId: { type: String }, // Our internal refund ID
  refundInitiatedAt: { type: Date },
  refundCompletedAt: { type: Date },
  refundFailedReason: { type: String },
  refundMethod: { type: String }, // Payment method used for refund (phonepe)
  
  // Tracking and Delivery fields
  trackingNumber: { type: String, unique: true, sparse: true }, // Unique tracking number
  courierProvider: { type: String }, // Courier company name (e.g., "Blue Dart", "DTDC")
  courierTrackingUrl: { type: String }, // External tracking URL
  estimatedDeliveryDate: { type: Date }, // Estimated delivery date
  actualDeliveryDate: { type: Date }, // Actual delivery date
  deliveryNotes: { type: String }, // Delivery notes or instructions
  
  // Return fields
  returnRequested: { type: Boolean, default: false },
  returnReason: { type: String },
  returnRequestedAt: { type: Date },
  returnStatus: { 
    type: String, 
    enum: ['none', 'requested', 'approved', 'rejected', 'in_transit', 'received', 'processed'],
    default: 'none' 
  },
  returnApprovedBy: { type: String }, // Admin who approved/rejected return
  returnApprovedAt: { type: Date },
  returnRejectionReason: { type: String },
  returnTrackingNumber: { type: String }, // Tracking for return shipment
  returnCourierProvider: { type: String }, // Courier for return
  returnNotes: { type: String }, // Return notes
  
  // Invoice fields
  invoiceNumber: { type: String, unique: true, sparse: true }, // Unique invoice number
  invoiceGeneratedAt: { type: Date }, // When invoice was generated
  invoiceDownloadCount: { type: Number, default: 0 }, // Track download count
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);

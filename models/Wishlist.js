const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  email: {
    type: String,
    required: true,
    index: true
  },
  products: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Compound index for user and product to prevent duplicates
wishlistSchema.index({ user: 1, 'products.product': 1 });

// Method to add product to wishlist
wishlistSchema.methods.addProduct = function(productId) {
  const existingProduct = this.products.find(
    item => item.product.toString() === productId.toString()
  );
  
  if (!existingProduct) {
    this.products.push({ product: productId });
  }
  
  return this.save();
};

// Method to remove product from wishlist
wishlistSchema.methods.removeProduct = function(productId) {
  this.products = this.products.filter(
    item => item.product.toString() !== productId.toString()
  );
  
  return this.save();
};

// Method to check if product is in wishlist
wishlistSchema.methods.hasProduct = function(productId) {
  return this.products.some(
    item => item.product.toString() === productId.toString()
  );
};

module.exports = mongoose.model('Wishlist', wishlistSchema);


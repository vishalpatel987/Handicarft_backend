const Wishlist = require('../models/Wishlist');
const Product = require('../models/Product');
const User = require('../models/User');

// Get user's wishlist
exports.getWishlist = async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    let wishlist = await Wishlist.findOne({ email })
      .populate({
        path: 'products.product',
        select: 'name price regularPrice image images description stock category subCategory isFeatured discount',
        populate: [
          {
            path: 'category',
            select: 'name'
          },
          {
            path: 'subCategory',
            select: 'name'
          }
        ]
      });

    if (!wishlist) {
      // Find user by email to get user ID
      let userId = req.user?._id || null;
      if (!userId && email) {
        const user = await User.findOne({ email });
        if (user) {
          userId = user._id;
          console.log('👤 Found user by email for wishlist:', user.name, user._id);
        }
      }
      
      wishlist = await Wishlist.create({
        email,
        user: userId,
        products: []
      });
    }

    // Filter out any null products (deleted products)
    if (wishlist.products) {
      wishlist.products = wishlist.products.filter(item => item.product !== null);
      await wishlist.save();
    }

    res.status(200).json({
      success: true,
      wishlist: {
        _id: wishlist._id,
        products: wishlist.products,
        totalItems: wishlist.products.length
      }
    });
  } catch (error) {
    console.error('Error fetching wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wishlist',
      error: error.message
    });
  }
};

// Add product to wishlist
exports.addToWishlist = async (req, res) => {
  try {
    const { email, productId } = req.body;
    
    console.log('📥 Add to wishlist request:', { email, productId });
    console.log('📥 User from token:', req.user ? req.user.email : 'No user');

    if (!email || !productId) {
      console.log('❌ Missing email or productId');
      return res.status(400).json({
        success: false,
        message: 'Email and product ID are required'
      });
    }

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      console.log('❌ Product not found:', productId);
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    console.log('✅ Product found:', product.name);

    // Find user by email to get user ID
    let userId = req.user?._id || null;
    if (!userId && email) {
      const user = await User.findOne({ email });
      if (user) {
        userId = user._id;
        console.log('👤 Found user by email:', user.name, user._id);
      } else {
        console.log('⚠️ No user found for email:', email);
      }
    }

    // Find or create wishlist
    let wishlist = await Wishlist.findOne({ email });
    console.log('🔍 Existing wishlist found:', wishlist ? 'Yes' : 'No');
    
    if (!wishlist) {
      // Create new wishlist with proper user ID
      console.log('🆕 Creating new wishlist for email:', email, 'with user ID:', userId);
      wishlist = new Wishlist({
        email,
        user: userId,
        products: []
      });
    } else if (!wishlist.user && userId) {
      // Update existing wishlist with user ID if missing
      console.log('🔄 Updating existing wishlist with user ID:', userId);
      wishlist.user = userId;
      await wishlist.save();
    }

    // Check if product already in wishlist
    const existingProduct = wishlist.products.find(
      item => item.product.toString() === productId
    );

    if (existingProduct) {
      console.log('ℹ️ Product already in wishlist');
      return res.status(400).json({
        success: false,
        message: 'Product already in wishlist'
      });
    }

    // Add product to wishlist
    wishlist.products.push({ product: productId });
    await wishlist.save();
    console.log('💾 Product added to wishlist, total items:', wishlist.products.length);

    // Populate the wishlist
    await wishlist.populate({
      path: 'products.product',
      select: 'name price regularPrice image images description stock category subCategory isFeatured discount'
    });

    console.log('✅ Wishlist saved successfully');
    res.status(200).json({
      success: true,
      message: 'Product added to wishlist',
      wishlist: {
        _id: wishlist._id,
        products: wishlist.products,
        totalItems: wishlist.products.length
      }
    });
  } catch (error) {
    console.error('Error adding to wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add to wishlist',
      error: error.message
    });
  }
};

// Remove product from wishlist
exports.removeFromWishlist = async (req, res) => {
  try {
    const { email, productId } = req.body;

    if (!email || !productId) {
      return res.status(400).json({
        success: false,
        message: 'Email and product ID are required'
      });
    }

    const wishlist = await Wishlist.findOne({ email });

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    // Remove product from wishlist
    wishlist.products = wishlist.products.filter(
      item => item.product.toString() !== productId
    );

    await wishlist.save();

    // Populate the wishlist
    await wishlist.populate({
      path: 'products.product',
      select: 'name price regularPrice image images description stock category subCategory isFeatured discount'
    });

    res.status(200).json({
      success: true,
      message: 'Product removed from wishlist',
      wishlist: {
        _id: wishlist._id,
        products: wishlist.products,
        totalItems: wishlist.products.length
      }
    });
  } catch (error) {
    console.error('Error removing from wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove from wishlist',
      error: error.message
    });
  }
};

// Clear entire wishlist
exports.clearWishlist = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const wishlist = await Wishlist.findOne({ email });

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    wishlist.products = [];
    await wishlist.save();

    res.status(200).json({
      success: true,
      message: 'Wishlist cleared successfully',
      wishlist: {
        _id: wishlist._id,
        products: [],
        totalItems: 0
      }
    });
  } catch (error) {
    console.error('Error clearing wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear wishlist',
      error: error.message
    });
  }
};

// Check if product is in wishlist
exports.checkWishlistStatus = async (req, res) => {
  try {
    const { email, productId } = req.query;

    if (!email || !productId) {
      return res.status(400).json({
        success: false,
        message: 'Email and product ID are required'
      });
    }

    const wishlist = await Wishlist.findOne({ email });

    if (!wishlist) {
      return res.status(200).json({
        success: true,
        isInWishlist: false
      });
    }

    const isInWishlist = wishlist.products.some(
      item => item.product.toString() === productId
    );

    res.status(200).json({
      success: true,
      isInWishlist
    });
  } catch (error) {
    console.error('Error checking wishlist status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check wishlist status',
      error: error.message
    });
  }
};

// Admin: Get all wishlists
exports.getAllWishlists = async (req, res) => {
  try {
    console.log('🔍 Admin: Fetching all wishlists...');
    
    const wishlists = await Wishlist.find()
      .populate('user', 'name email')
      .populate({
        path: 'products.product',
        select: 'name price image'
      })
      .sort({ updatedAt: -1 });

    console.log('🔍 Found wishlists:', wishlists.length);
    console.log('🔍 Wishlists data:', wishlists);

    const stats = {
      totalWishlists: wishlists.length,
      totalProducts: wishlists.reduce((acc, w) => acc + w.products.length, 0),
      activeWishlists: wishlists.filter(w => w.products.length > 0).length
    };

    console.log('🔍 Calculated stats:', stats);

    res.status(200).json({
      success: true,
      wishlists,
      stats
    });
  } catch (error) {
    console.error('Error fetching all wishlists:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wishlists',
      error: error.message
    });
  }
};

// Admin: Get wishlist analytics
exports.getWishlistAnalytics = async (req, res) => {
  try {
    console.log('🔍 Admin: Fetching wishlist analytics...');
    
    const wishlists = await Wishlist.find()
      .populate({
        path: 'products.product',
        select: 'name price category'
      });

    console.log('🔍 Found wishlists for analytics:', wishlists.length);
    console.log('🔍 Wishlists with products:', wishlists.filter(w => w.products.length > 0).length);

    // Product popularity in wishlists
    const productPopularity = {};
    
    wishlists.forEach(wishlist => {
      wishlist.products.forEach(item => {
        if (item.product) {
          const productId = item.product._id.toString();
          if (!productPopularity[productId]) {
            productPopularity[productId] = {
              product: item.product,
              count: 0
            };
          }
          productPopularity[productId].count++;
        }
      });
    });

    // Sort by popularity
    const popularProducts = Object.values(productPopularity)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const analytics = {
      totalWishlists: wishlists.length,
      totalProductsInWishlists: wishlists.reduce((acc, w) => acc + w.products.length, 0),
      averageProductsPerWishlist: wishlists.length > 0 
        ? (wishlists.reduce((acc, w) => acc + w.products.length, 0) / wishlists.length).toFixed(2)
        : 0,
      activeWishlists: wishlists.filter(w => w.products.length > 0).length,
      emptyWishlists: wishlists.filter(w => w.products.length === 0).length,
      mostWishlisted: popularProducts
    };

    console.log('🔍 Calculated analytics:', analytics);

    res.status(200).json({
      success: true,
      analytics
    });
  } catch (error) {
    console.error('Error fetching wishlist analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wishlist analytics',
      error: error.message
    });
  }
};




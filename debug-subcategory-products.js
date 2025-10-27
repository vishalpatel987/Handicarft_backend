const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://vishalpatel581012:0b0hCWFP7dvqeeHO@binkeyit.mncq203.mongodb.net/Ricro_Craft?retryWrites=true&w=majority&appName=Binkeyit');

// Import models
const Product = require('./models/Product');
const Category = require('./models/cate');

async function debugSubcategoryProducts() {
  try {
    console.log('🔍 Debugging Subcategory Products...\n');

    // 1. Get all categories with subcategories
    console.log('1️⃣ Getting all categories with subcategories...');
    const categories = await Category.find({ isActive: true })
      .populate('subCategories', 'name description')
      .sort({ name: 1 });
    
    console.log(`Found ${categories.length} categories:`);
    categories.forEach(cat => {
      console.log(`- ${cat.name} (${cat.categoryType}) - ID: ${cat._id}`);
      if (cat.subCategories && cat.subCategories.length > 0) {
        cat.subCategories.forEach(sub => {
          console.log(`  └─ ${sub.name} - ID: ${sub._id}`);
        });
      }
    });
    console.log('');

    // 2. Get all products with their categories
    console.log('2️⃣ Getting all products with categories...');
    const products = await Product.find({})
      .populate('category', 'name')
      .populate('subCategory', 'name')
      .sort({ name: 1 });
    
    console.log(`Found ${products.length} products:`);
    products.forEach(product => {
      console.log(`- ${product.name}`);
      console.log(`  Main Category: ${product.category?.name || 'None'} (${product.category?._id || 'None'})`);
      console.log(`  Sub Category: ${product.subCategory?.name || 'None'} (${product.subCategory?._id || 'None'})`);
      console.log('');
    });

    // 3. Check products by subcategory
    console.log('3️⃣ Checking products by subcategory...');
    const subcategories = await Category.find({ categoryType: 'sub', isActive: true });
    
    for (const subcat of subcategories) {
      const productsInSubcat = await Product.find({ subCategory: subcat._id });
      console.log(`Subcategory "${subcat.name}" (${subcat._id}): ${productsInSubcat.length} products`);
      productsInSubcat.forEach(product => {
        console.log(`  - ${product.name}`);
      });
      console.log('');
    }

    // 4. Check products without subcategory
    console.log('4️⃣ Checking products without subcategory...');
    const productsWithoutSubcat = await Product.find({ subCategory: null });
    console.log(`Products without subcategory: ${productsWithoutSubcat.length}`);
    productsWithoutSubcat.forEach(product => {
      console.log(`  - ${product.name} (Category: ${product.category})`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

debugSubcategoryProducts();

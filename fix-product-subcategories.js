const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://vishalpatel581012:0b0hCWFP7dvqeeHO@binkeyit.mncq203.mongodb.net/Ricro_Craft?retryWrites=true&w=majority&appName=Binkeyit');

// Import models
const Product = require('./models/Product');
const Category = require('./models/cate');

async function fixProductSubcategories() {
  try {
    console.log('🔧 Fixing Product Subcategories...\n');

    // Get subcategories
    const chairSubcategory = await Category.findOne({ name: 'Chair', categoryType: 'sub' });
    const tableSubcategory = await Category.findOne({ name: 'Table', categoryType: 'sub' });
    const horseSubcategory = await Category.findOne({ name: 'Horse', categoryType: 'sub' });

    console.log('Found subcategories:');
    console.log(`- Chair: ${chairSubcategory?._id}`);
    console.log(`- Table: ${tableSubcategory?._id}`);
    console.log(`- Horse: ${horseSubcategory?._id}`);
    console.log('');

    // Fix products
    const updates = [
      // Chair products
      { name: 'Brass Chair', subCategory: chairSubcategory?._id },
      { name: 'Minnie-mouse Chair', subCategory: chairSubcategory?._id },
      { name: 'Bear Chair', subCategory: chairSubcategory?._id },
      { name: 'Butterfly Cane Chair', subCategory: chairSubcategory?._id },
      { name: 'Grey Chair', subCategory: chairSubcategory?._id },
      
      // Horse products
      { name: 'Horse', subCategory: horseSubcategory?._id },
    ];

    for (const update of updates) {
      if (update.subCategory) {
        const result = await Product.updateOne(
          { name: update.name },
          { $set: { subCategory: update.subCategory } }
        );
        console.log(`Updated ${update.name}: ${result.modifiedCount} documents modified`);
      }
    }

    console.log('\n✅ Product subcategories updated successfully!');

    // Verify updates
    console.log('\n🔍 Verifying updates...');
    const updatedProducts = await Product.find({})
      .populate('category', 'name')
      .populate('subCategory', 'name')
      .sort({ name: 1 });

    updatedProducts.forEach(product => {
      console.log(`- ${product.name}`);
      console.log(`  Main Category: ${product.category?.name || 'None'}`);
      console.log(`  Sub Category: ${product.subCategory?.name || 'None'}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

fixProductSubcategories();

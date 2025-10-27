// Simple Category Test without Authentication
const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pawnshop', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const Category = require('./models/cate');

async function testCategoryCreation() {
  try {
    console.log('🧪 Testing Category Creation...\n');

    // Test 1: Create Main Category
    console.log('1️⃣ Creating Main Category...');
    const mainCategory = new Category({
      name: 'Test Electronics',
      description: 'Test electronic items',
      categoryType: 'main',
      sortOrder: 1,
      isActive: true
    });

    const savedMainCategory = await mainCategory.save();
    console.log('✅ Main Category Created:', {
      id: savedMainCategory._id,
      name: savedMainCategory.name,
      type: savedMainCategory.categoryType
    });

    // Test 2: Create Sub-Category
    console.log('\n2️⃣ Creating Sub-Category...');
    const subCategory = new Category({
      name: 'Test Mobile Phones',
      description: 'Test mobile phones sub-category',
      parentCategory: savedMainCategory._id,
      categoryType: 'sub',
      sortOrder: 1,
      isActive: true
    });

    const savedSubCategory = await subCategory.save();
    console.log('✅ Sub-Category Created:', {
      id: savedSubCategory._id,
      name: savedSubCategory.name,
      type: savedSubCategory.categoryType,
      parent: savedSubCategory.parentCategory
    });

    // Test 3: Update Parent Category with Sub-Category
    console.log('\n3️⃣ Updating Parent Category...');
    await Category.findByIdAndUpdate(
      savedMainCategory._id,
      { $push: { subCategories: savedSubCategory._id } }
    );
    console.log('✅ Parent Category Updated with Sub-Category');

    // Test 4: Get Category Hierarchy
    console.log('\n4️⃣ Getting Category Hierarchy...');
    const hierarchy = await Category.find({ 
      isActive: true, 
      categoryType: 'main' 
    }).populate('subCategories', 'name description image slug isActive sortOrder');

    console.log('✅ Category Hierarchy:', JSON.stringify(hierarchy, null, 2));

    // Test 5: Cleanup
    console.log('\n5️⃣ Cleaning up test data...');
    await Category.deleteMany({ name: { $regex: /^Test/ } });
    console.log('✅ Test data cleaned up');

    console.log('\n🎉 All Category Tests Passed Successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

testCategoryCreation();

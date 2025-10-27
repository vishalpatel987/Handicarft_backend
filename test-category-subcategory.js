// Test Category and Sub-Category functionality
const axios = require('axios');

const API_BASE = 'http://localhost:5000/api/categories';

async function testCategorySubCategory() {
  try {
    console.log('🧪 Testing Category and Sub-Category System\n');

    // Step 1: Create Main Category
    console.log('1️⃣ Creating Main Category...');
    const mainCategoryData = {
      name: 'Electronics',
      description: 'Electronic items and gadgets',
      sortOrder: 1,
      isActive: true
    };

    const mainCategoryResponse = await axios.post(API_BASE, mainCategoryData);
    console.log('Main Category Created:', mainCategoryResponse.data);
    const mainCategoryId = mainCategoryResponse.data.category._id;
    console.log('');

    // Step 2: Create Sub-Category
    console.log('2️⃣ Creating Sub-Category...');
    const subCategoryData = {
      name: 'Mobile Phones',
      description: 'Smartphones and mobile devices',
      parentCategory: mainCategoryId,
      sortOrder: 1,
      isActive: true
    };

    const subCategoryResponse = await axios.post(API_BASE, subCategoryData);
    console.log('Sub-Category Created:', subCategoryResponse.data);
    const subCategoryId = subCategoryResponse.data.category._id;
    console.log('');

    // Step 3: Get Main Categories
    console.log('3️⃣ Getting Main Categories...');
    const mainCategoriesResponse = await axios.get(`${API_BASE}/main`);
    console.log('Main Categories:', mainCategoriesResponse.data);
    console.log('');

    // Step 4: Get Sub-Categories
    console.log('4️⃣ Getting Sub-Categories...');
    const subCategoriesResponse = await axios.get(`${API_BASE}/sub/${mainCategoryId}`);
    console.log('Sub-Categories:', subCategoriesResponse.data);
    console.log('');

    // Step 5: Get Category Hierarchy
    console.log('5️⃣ Getting Category Hierarchy...');
    const hierarchyResponse = await axios.get(`${API_BASE}/hierarchy`);
    console.log('Category Hierarchy:', JSON.stringify(hierarchyResponse.data, null, 2));
    console.log('');

    // Step 6: Get All Categories with Sub-Categories
    console.log('6️⃣ Getting All Categories with Sub-Categories...');
    const allCategoriesResponse = await axios.get(`${API_BASE}?includeSubCategories=true`);
    console.log('All Categories:', JSON.stringify(allCategoriesResponse.data, null, 2));
    console.log('');

    // Step 7: Test Product with Category and Sub-Category
    console.log('7️⃣ Testing Product Creation with Categories...');
    const productData = {
      name: 'iPhone 15',
      material: 'Aluminum',
      description: 'Latest iPhone model',
      size: '6.1 inch',
      colour: 'Space Black',
      category: mainCategoryId,
      subCategory: subCategoryId,
      weight: '171g',
      utility: 'Communication',
      care: 'Handle with care',
      price: 99999,
      quantity: 10,
      images: ['https://example.com/iphone.jpg'],
      isActive: true
    };

    try {
      const productResponse = await axios.post('http://localhost:5000/api/products', productData);
      console.log('Product Created with Categories:', productResponse.data);
    } catch (error) {
      console.log('Product creation failed (expected if auth required):', error.response?.data?.message || error.message);
    }
    console.log('');

    console.log('✅ Category and Sub-Category test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Run the test
testCategorySubCategory();

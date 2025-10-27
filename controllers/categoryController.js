const Category = require('../models/cate');

// Get all categories with sub-categories
exports.getAllCategories = async (req, res) => {
  try {
    const { includeSubCategories = 'true' } = req.query;
    
    if (includeSubCategories === 'true') {
      // Get main categories with their sub-categories
      const categories = await Category.find({ 
        isActive: true, 
        categoryType: 'main' 
      })
      .populate('subCategories', 'name description image slug isActive sortOrder')
      .sort({ sortOrder: 1, name: 1 });
      
      res.json({ categories });
    } else {
      // Get only main categories
      const categories = await Category.find({ 
        isActive: true, 
        categoryType: 'main' 
      }).sort({ sortOrder: 1, name: 1 });
      
      res.json({ categories });
    }
  } catch (error) {
    console.error('Error in getAllCategories:', error);
    res.status(500).json({ message: 'Error fetching categories' });
  }
};

// Get single category
exports.getCategory = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ID parameter
    if (!id || id === 'undefined' || id === 'null') {
      return res.status(400).json({ message: 'Invalid category ID' });
    }

    // Check if ID is a valid ObjectId format
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({ message: 'Invalid category ID format' });
    }

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    res.json({ category });
  } catch (error) {
    console.error('Error in getCategory:', error);
    res.status(500).json({ message: 'Error fetching category' });
  }
};

// Create new category with file upload
exports.createCategory = async (req, res) => {
  try {
    console.log('=== Starting Category Creation ===');
    console.log('Files received:', req.files);
    console.log('Body data:', req.body);
    console.log('Headers:', req.headers);

    if (!req.body.name || !req.body.description) {
      return res.status(400).json({ message: 'Name and description are required' });
    }

    const categoryData = req.body;
    let imageUrl = '';
    let videoUrl = '';

    // Process uploaded files if present
    if (req.files) {
      // Handle image upload
      if (req.files.image && req.files.image[0]) {
        imageUrl = req.files.image[0].path; // Cloudinary URL
        console.log('Added category image:', imageUrl);
      }

      // Handle video upload
      if (req.files.video && req.files.video[0]) {
        videoUrl = req.files.video[0].path; // Cloudinary URL
        console.log('Added category video:', videoUrl);
      }
    }

    // Determine category type and parent
    const categoryType = categoryData.parentCategory && categoryData.parentCategory !== 'undefined' && categoryData.parentCategory !== 'null' ? 'sub' : 'main';
    const parentCategory = (categoryData.parentCategory && categoryData.parentCategory !== 'undefined' && categoryData.parentCategory !== 'null') ? categoryData.parentCategory : null;

    const newCategory = new Category({
      name: categoryData.name,
      description: categoryData.description,
      image: imageUrl,
      video: videoUrl,
      sortOrder: parseInt(categoryData.sortOrder) || 0,
      isActive: categoryData.isActive !== 'false',
      categoryType: categoryType,
      parentCategory: parentCategory
    });

    console.log('Creating new category with data:', {
      name: categoryData.name,
      description: categoryData.description,
      image: imageUrl,
      video: videoUrl,
      categoryType: categoryType,
      parentCategory: parentCategory
    });

    const savedCategory = await newCategory.save();

    // If it's a sub-category, add it to parent's subCategories array
    if (categoryType === 'sub' && parentCategory) {
      await Category.findByIdAndUpdate(
        parentCategory,
        { $push: { subCategories: savedCategory._id } }
      );
    }

    console.log('Category saved successfully:', savedCategory);
    
    res.status(201).json({ 
      message: "Category created successfully", 
      category: savedCategory,
      uploadedFiles: req.files
    });
  } catch (error) {
    console.error('=== Error creating category ===');
    console.error('Error details:', error);
    res.status(500).json({ 
      message: "Error creating category", 
      error: error.message
    });
  }
};

// Update category with file upload
exports.updateCategory = async (req, res) => {
  try {
    console.log('Updating category with files:', req.files);
    console.log('Update data:', req.body);

    const id = req.params.id;
    const categoryData = req.body;
    
    const existingCategory = await Category.findById(id);
    if (!existingCategory) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Handle file updates
    let imageUrl = existingCategory.image;
    let videoUrl = existingCategory.video;

    if (req.files) {
      // Handle image update
      if (req.files.image && req.files.image[0]) {
        imageUrl = req.files.image[0].path;
        console.log('Updated category image:', imageUrl);
      }

      // Handle video update
      if (req.files.video && req.files.video[0]) {
        videoUrl = req.files.video[0].path;
        console.log('Updated category video:', videoUrl);
      }
    }

    // Update category object
    const updatedCategory = {
      name: categoryData.name || existingCategory.name,
      description: categoryData.description || existingCategory.description,
      image: imageUrl,
      video: videoUrl,
      sortOrder: categoryData.sortOrder ? parseInt(categoryData.sortOrder) : existingCategory.sortOrder,
      isActive: categoryData.isActive !== undefined ? (categoryData.isActive === 'true') : existingCategory.isActive
    };

    console.log('Updating category with data:', {
      id,
      imageUrl,
      videoUrl,
      filesReceived: req.files ? Object.keys(req.files) : 'none'
    });

    const savedCategory = await Category.findByIdAndUpdate(id, updatedCategory, { new: true });

    res.json({ 
      message: "Category updated successfully", 
      category: savedCategory,
      uploadedFiles: req.files
    });
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ message: "Error updating category", error: error.message });
  }
};

// Delete category
exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // If it's a main category with sub-categories, delete all sub-categories first
    if (category.categoryType === 'main' && category.subCategories.length > 0) {
      await Category.deleteMany({ _id: { $in: category.subCategories } });
    }

    // If it's a sub-category, remove it from parent's subCategories array
    if (category.categoryType === 'sub' && category.parentCategory) {
      await Category.findByIdAndUpdate(
        category.parentCategory,
        { $pull: { subCategories: category._id } }
      );
    }

    await Category.findByIdAndDelete(req.params.id);
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Error in deleteCategory:', error);
    res.status(500).json({ message: 'Error deleting category' });
  }
};

// Get sub-categories of a specific main category
exports.getSubCategories = async (req, res) => {
  try {
    const { parentId } = req.params;
    const subCategories = await Category.find({ 
      parentCategory: parentId, 
      isActive: true 
    }).sort({ sortOrder: 1, name: 1 });
    
    res.json({ subCategories });
  } catch (error) {
    console.error('Error in getSubCategories:', error);
    res.status(500).json({ message: 'Error fetching sub-categories' });
  }
};

// Get all main categories (for dropdown/selection)
exports.getMainCategories = async (req, res) => {
  try {
    const mainCategories = await Category.find({ 
      isActive: true, 
      categoryType: 'main' 
    }).select('name _id').sort({ sortOrder: 1, name: 1 });
    
    res.json({ mainCategories });
  } catch (error) {
    console.error('Error in getMainCategories:', error);
    res.status(500).json({ message: 'Error fetching main categories' });
  }
};

// Get category hierarchy (main categories with their sub-categories)
exports.getCategoryHierarchy = async (req, res) => {
  try {
    const categories = await Category.find({ 
      isActive: true, 
      categoryType: 'main' 
    })
    .populate({
      path: 'subCategories',
      match: { isActive: true },
      select: 'name description image slug sortOrder',
      options: { sort: { sortOrder: 1, name: 1 } }
    })
    .sort({ sortOrder: 1, name: 1 });
    
    res.json({ categories });
  } catch (error) {
    console.error('Error in getCategoryHierarchy:', error);
    res.status(500).json({ message: 'Error fetching category hierarchy' });
  }
}; 
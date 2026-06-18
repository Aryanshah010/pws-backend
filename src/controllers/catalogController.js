const Product = require("../models/Product");

// @desc    Get all products (with search & category filters)
// @route   GET /api/products
exports.getProducts = async (req, res) => {
  try {
    const { search, category } = req.query;
    let queryObject = {};

    // 1. Localized Multilingual Search Logic
    if (search) {
      // Clean up search keywords to safely run inside regular expressions
      const searchRegex = new RegExp(search.trim(), "i");

      queryObject.$or = [
        { name: searchRegex },
        { category: searchRegex },
        { aliases: { $in: [searchRegex] } }, // Queries array variations
      ];
    }

    // 2. Category Dropdown Filter Logic
    if (category) {
      queryObject.category = category;
    }

    const products = await Product.find(queryObject).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get single product details
// @route   GET /api/products/:id
exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.status(200).json({
      success: true,
      product,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Create a product (Admin Only)
// @route   POST /api/products
exports.createProduct = async (req, res) => {
  try {
    const product = await Product.create(req.body);
    res.status(201).json({
      success: true,
      message: "Product created successfully",
      product,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

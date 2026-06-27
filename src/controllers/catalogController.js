const Product = require("../models/Product");

exports.getProducts = async (req, res) => {
  try {
    const { search, category } = req.query;
    let queryObject = {};

    if (search) {
      const searchRegex = new RegExp(search.trim(), "i");

      queryObject.$or = [
        { name: searchRegex },
        { category: searchRegex },
        { aliases: { $in: [searchRegex] } }, 
      ];
    }

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

const Product = require("../models/Product");
const RestockSubscription = require("../models/RestockSubscription");
const Notification = require("../models/Notification");
const StoreSettings = require("../models/StoreSettings");
const { broadcast } = require("../utils/realtime");
const notificationService = require("../services/notificationService");
const templates = require("../services/messageTemplates");
const { priceLadderErrors } = require("../config/pricing");

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const assertMargin = async (product) => {
  const settings = await StoreSettings.current();
  const errors = priceLadderErrors(product, {
    minMarginPercent: settings.minMarginPercent,
    maxDiscountPercent: settings.maxDiscountPercent,
  });
  if (errors.length) {
    const error = new Error(errors.join(" "));
    error.statusCode = 400;
    throw error;
  }
};

const fulfilRestockSubscriptions = async (product) => {
  try {
    const subscriptions = await RestockSubscription.find({
      product: product._id,
      status: "active",
    }).populate("user", "phone");
    if (!subscriptions.length) return;

    const copy = templates.productRestocked(product);

    for (const subscription of subscriptions) {
      if (!subscription.user) continue;
      await Notification.create({
        user: subscription.user._id,
        ...copy.inApp,
        type: "restock",
      });
      broadcast(
        "catalog-updated",
        {
          productId: product._id,
          action: "restocked",
          stockStatus: product.stockStatus,
          push: copy.push,
        },
        { userId: subscription.user._id },
      );
      await notificationService.notify(
        subscription.user.phone,
        { sms: copy.sms },
        `restock:${product.name}`,
      );
    }

    await RestockSubscription.updateMany(
      { product: product._id, status: "active" },
      { status: "notified" },
    );
  } catch (error) {
    console.error("Restock notification failed:", error.message);
  }
};

const productFilters = (query) => {
  const filter = { isActive: { $ne: false } };
  const { search, category, unit } = query;

  if (search?.trim()) {
    const searchRegex = new RegExp(escapeRegex(search.trim()), "i");
    filter.$or = [
      { name: searchRegex },
      { nameNe: searchRegex },
      { category: searchRegex },
      { aliases: searchRegex },
    ];
  }
  if (category && category !== "All") filter.category = category;
  if (unit) filter.unit = new RegExp(escapeRegex(unit), "i");
  return filter;
};

exports.getProducts = async (req, res) => {
  try {
    const products = await Product.find(productFilters(req.query)).sort({
      createdAt: -1,
    });

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

// Longest common prefix of an array of strings (used to derive a canonical
// product name when a search matches via alias/Nepali name).
const longestCommonPrefix = (strings) => {
  if (!strings.length) return "";
  let prefix = strings[0];
  for (let i = 1; i < strings.length; i++) {
    while (!strings[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (!prefix) return "";
    }
  }
  return prefix.trim();
};

exports.searchPreview = async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) {
      return res.status(200).json({
        success: true,
        products: [],
        totalCount: 0,
        aliasMatch: null,
      });
    }

    const searchRegex = new RegExp(escapeRegex(q), "i");
    const filter = {
      isActive: { $ne: false },
      $or: [
        { name: searchRegex },
        { nameNe: searchRegex },
        { category: searchRegex },
        { aliases: searchRegex },
      ],
    };

    const allMatches = await Product.find(filter).sort({ createdAt: -1 });
    const totalCount = allMatches.length;
    const products = allMatches.slice(0, 5);

    // Determine whether the search resolved through an alias or Nepali name
    let aliasMatch = null;
    if (totalCount > 0) {
      const directNameMatch = allMatches.some((p) => searchRegex.test(p.name));
      if (!directNameMatch) {
        // Matched via aliases or nameNe — compute the canonical resolved name
        const names = allMatches.map((p) => p.name);
        const prefix = longestCommonPrefix(names);
        const resolved = prefix || allMatches[0].name;
        aliasMatch = { query: q, resolved };
      }
    }

    res.status(200).json({
      success: true,
      products,
      totalCount,
      aliasMatch,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getCategories = async (_req, res) => {
  try {
    const categories = await Product.distinct("category", {
      isActive: { $ne: false },
    });
    res.status(200).json({ success: true, categories: categories.sort() });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Could not load categories" });
  }
};

exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      isActive: { $ne: false },
    });
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

exports.getAdminProducts = async (_req, res) => {
  try {
    const products = await Product.find()
      .select("+costPrice")
      .sort({ createdAt: -1 });
    const settings = await StoreSettings.current();
    res.status(200).json({
      success: true,
      count: products.length,
      minMarginPercent: settings.minMarginPercent,
      maxDiscountPercent: settings.maxDiscountPercent,
      products,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const product = new Product(req.body);
    await assertMargin(product);
    await product.save();
    res.status(201).json({
      success: true,
      message: "Product created successfully",
      product,
    });
    broadcast("catalog-updated", { productId: product._id, action: "created" });
  } catch (error) {

    res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
    });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).select("+costPrice");
    if (!product)
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });

    const wasOutOfStock = product.stock <= 0;

    Object.assign(product, req.body);
    await assertMargin(product);
    await product.save();
    broadcast("catalog-updated", {
      productId: product._id,
      action: "updated",
      stockStatus: product.stockStatus,
    });

    if (wasOutOfStock && product.stock > 0) {
      await fulfilRestockSubscriptions(product);
    }
    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      product,
    });
  } catch (error) {
    res
      .status(error.statusCode || 400)
      .json({ success: false, message: error.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true },
    );
    if (!product)
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    broadcast("catalog-updated", { productId: product._id, action: "removed" });
    res
      .status(200)
      .json({ success: true, message: "Product removed from catalogue" });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Could not remove product" });
  }
};

exports.subscribeToRestock = async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      isActive: { $ne: false },
    });
    if (!product)
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    if (product.stock > 0)
      return res
        .status(400)
        .json({ success: false, message: "This product is already in stock" });

    const subscription = await RestockSubscription.findOneAndUpdate(
      { product: product._id, user: req.user._id },
      { status: "active" },
      { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
    );
    res.status(200).json({
      success: true,
      message: "Restock notification requested",
      subscription,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not request restock notification",
    });
  }
};

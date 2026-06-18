const express = require("express");
const router = express.Router();
const {
  getProducts,
  getProductById,
  createProduct,
} = require("../controllers/catalogController");
const { protect, authorize } = require("../middleware/authMiddleware");

// Public routes: Browsers and Guests need instant catalog access
router.get("/", getProducts);
router.get("/:id", getProductById);

// Admin-only route: Locked down by authorization tokens
router.post("/", protect, authorize("admin"), createProduct);

module.exports = router;

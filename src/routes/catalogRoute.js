const express = require("express");
const router = express.Router();
const {
  getProducts,
  getProductById,
  createProduct,
} = require("../controllers/catalogController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.get("/", getProducts);
router.get("/:id", getProductById);

router.post("/", protect, authorize("admin"), createProduct);

module.exports = router;

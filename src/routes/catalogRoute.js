const express = require("express");
const router = express.Router();
const {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getCategories,
  subscribeToRestock,
  getAdminProducts,
} = require("../controllers/catalogController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.get("/", getProducts);
router.get("/categories", getCategories);
// Registered before "/:id" so the literal path is not swallowed by the
// parameter route.
router.get("/admin/list", protect, authorize("admin"), getAdminProducts);
router.get("/:id", getProductById);
router.post("/:id/restock-subscriptions", protect, subscribeToRestock);

router.post("/", protect, authorize("admin"), createProduct);
router.put("/:id", protect, authorize("admin"), updateProduct);
router.delete("/:id", protect, authorize("admin"), deleteProduct);

module.exports = router;

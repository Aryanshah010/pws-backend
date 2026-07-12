const express = require("express");
const router = express.Router();
const {
  createOrder,
  getMyOrders,
  getOrderById,
  updateOrderStatus,
} = require("../controllers/orderController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.use(protect);

router.post("/", createOrder);
router.get("/myorders", getMyOrders);
router.get("/:id", getOrderById);

router.put("/:id/status", authorize("admin"), updateOrderStatus);

module.exports = router;

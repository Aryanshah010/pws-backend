const express = require("express");
const router = express.Router();
const {
  createOrder,
  getMyOrders,
  getOrderById,
  updateOrderStatus,
  quoteOrder,
  submitPaymentProof,
  getBaskets,
  saveBasket,
  reviewBasket,
  createComplaint,
  getAdminOrders,
  updatePaymentStatus,
  getNotifications,
  markNotificationsRead,
  markNotificationRead,
} = require("../controllers/orderController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.use(protect);

router.post("/", createOrder);
router.post("/quote", quoteOrder);
router.get("/baskets", getBaskets);
router.post("/baskets", saveBasket);
router.get("/notifications", getNotifications);
router.put("/notifications/read", markNotificationsRead);
router.put("/notifications/:id/read", markNotificationRead);
router.get("/baskets/:id/review", reviewBasket);
router.get("/myorders", getMyOrders);
router.get("/admin/all", authorize("admin"), getAdminOrders);
router.get("/:id", getOrderById);
router.put("/:id/payment-proof", submitPaymentProof);
router.post("/:id/complaints", createComplaint);

router.put("/:id/status", authorize("admin"), updateOrderStatus);
router.put("/:id/payment-status", authorize("admin"), updatePaymentStatus);

module.exports = router;

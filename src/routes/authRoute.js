const express = require("express");
const { body } = require("express-validator");

const router = express.Router();

const {
  registerUser,
  loginUser,
  requestWholesale,
  getCurrentUser,
  requestPasswordReset,
  verifyPasswordReset,
  resetPassword,
  listWholesaleRequests,
  decideWholesaleRequest,
  getAdminUsers,
} = require("../controllers/authController");
const { protect, authorize } = require("../middleware/authMiddleware");

const validate = require("../middleware/validationMiddleware");

const phoneRule = body("phone")
  .trim()
  .matches(/^\d{10}$/)
  .withMessage("Enter a valid 10-digit Nepal mobile number");

router.post(
  "/register",
  [
    body("fullName")
      .trim()
      .isLength({ min: 2, max: 60 })
      .withMessage("Name must be 2–60 characters"),
    phoneRule,
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
    body("role")
      .isIn(["household/individual", "bulk/shop"])
      .withMessage("Choose a valid buyer type"),
  ],
  validate,
  registerUser,
);
router.post(
  "/login",
  [phoneRule, body("password").notEmpty().withMessage("Password is required")],
  validate,
  loginUser,
);
router.get("/me", protect, getCurrentUser);
router.get("/admin/users", protect, authorize("admin"), getAdminUsers);
router.put(
  "/wholesale-request",
  protect,
  [
    body("shopName")
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("Shop name is required"),
    body("shopLocation")
      .trim()
      .isLength({ min: 2, max: 150 })
      .withMessage("Shop location is required"),
    body("businessType")
      .trim()
      .isLength({ min: 2, max: 60 })
      .withMessage("Business type is required"),
    body("panNumber")
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ min: 9, max: 20 })
      .withMessage("Enter a valid PAN/VAT number"),
    body("estimatedMonthlyPurchase")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Monthly purchase must be positive"),
  ],
  validate,
  requestWholesale,
);
router.get(
  "/wholesale-requests",
  protect,
  authorize("admin"),
  listWholesaleRequests,
);
router.put(
  "/wholesale-requests/:userId",
  protect,
  authorize("admin"),
  body("decision")
    .isIn(["approved", "rejected"])
    .withMessage("Choose approved or rejected"),
  validate,
  decideWholesaleRequest,
);
router.post(
  "/password-reset/request",
  [phoneRule],
  validate,
  requestPasswordReset,
);
router.post(
  "/password-reset/verify",
  [
    phoneRule,
    body("otp")
      .matches(/^\d{6}$/)
      .withMessage("Enter the 6-digit OTP"),
  ],
  validate,
  verifyPasswordReset,
);
router.put(
  "/password-reset",
  [
    body("resetToken").notEmpty().withMessage("Reset session has expired"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
  ],
  validate,
  resetPassword,
);

module.exports = router;

const express = require("express");

const router = express.Router();

const {
  registerUser,
  loginUser,
  requestWholesale,
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

const validate = require("../middleware/validationMiddleware");

router.post("/register", validate, registerUser);
router.post("/login", validate, loginUser);
router.put("/wholesale-request", protect, requestWholesale);

module.exports = router;

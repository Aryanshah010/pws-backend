const express = require("express");
const router = express.Router();
const {
  getSettings,
  getAdminSettings,
  updateSettings,
} = require("../controllers/settingsController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.get("/", getSettings);

router.get("/admin", protect, authorize("admin"), getAdminSettings);
router.put("/", protect, authorize("admin"), updateSettings);

module.exports = router;

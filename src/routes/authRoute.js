const express = require("express");
const router = express.Router();
const { registerUser, loginUser } = require("../controllers/authController");

// Map endpoints to controller actions
router.post("/register", registerUser);
router.post("/login", loginUser);

module.exports = router;

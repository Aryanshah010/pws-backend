const express = require("express");

const router = express.Router();

const { registerUser, loginUser } = require("../controllers/authController");

const validate = require("../middleware/validationMiddleware");

router.post("/register", validate, registerUser);

router.post("/login", validate, loginUser);

module.exports = router;

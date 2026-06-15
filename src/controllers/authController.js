const User = require("../models/authModel");
const jwt = require("jsonwebtoken");
const { generateToken } = require("../middleware/authMiddleware");

// @desc    Register a new user
// @route   POST /api/auth/register
exports.registerUser = async (req, res) => {
  const { phone, password, fullName, role } = req.body;

  try {
    const userExists = await User.findOne({ phone });
    if (userExists) {
      return res
        .status(400)
        .json({ message: "A user with this phone number already exists" });
    }

    if (role === "admin") {
      return res.status(403).json({ message: "Unauthorized role assignment" });
    }

    const user = await User.create({
      phone,
      password,
      fullName,
      role, 
    });

    res.status(201).json({
      _id: user._id,
      phone: user.phone,
      fullName: user.fullName,
      role: user.role,
      token: generateToken(user._id),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.loginUser = async (req, res) => {
  const { phone, password } = req.body;

  try {

    const user = await User.findOne({ phone });
    if (!user) {
      return res
        .status(401)
        .json({ message: "Invalid phone number or password" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ message: "Invalid phone number or password" });
    }

    res.json({
      _id: user._id,
      phone: user.phone,
      fullName: user.fullName,
      role: user.role,
      token: generateToken(user._id),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

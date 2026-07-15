const User = require("../models/User");
const generateToken = require("../utils/generateToken");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const publicUser = (user) => ({
  id: user._id,
  fullName: user.fullName,
  phone: user.phone,
  role: user.role,
  wholesaleStatus: user.wholesaleStatus,
  wholesaleDetails: user.wholesaleDetails,
});

exports.registerUser = async (req, res) => {
  try {
    const { fullName, phone, password, role } = req.body;

    const existingUser = await User.findOne({ phone });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Phone number already registered",
      });
    }

    const user = await User.create({
      fullName,
      phone,
      password,
      role,
    });

    res.status(201).json({
      success: true,
      message: "Registration successful",
      user: publicUser(user),
      token: generateToken(user._id),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.loginUser = async (req, res) => {
  try {
    const { phone, password } = req.body;

    const user = await User.findOne({ phone }).select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const match = await user.matchPassword(password);

    if (!match) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    res.status(200).json({
      success: true,
      message: "Login successful",
      user: publicUser(user),
      token: generateToken(user._id),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.requestWholesale = async (req, res) => {
  try {
    const {
      shopName,
      shopLocation,
      businessType,
      panNumber,
      estimatedMonthlyPurchase,
    } = req.body;

    // req.user is set by authMiddleware
    const user = await User.findById(req.user.id);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (user.role === "verified_wholesale") {
      return res
        .status(400)
        .json({ success: false, message: "Already verified as wholesale" });
    }

    if (user.role === "pending_wholesale") {
      return res
        .status(400)
        .json({
          success: false,
          message: "Your wholesale request is already pending",
        });
    }

    user.role = "pending_wholesale";
    user.wholesaleStatus = "pending";
    user.wholesaleDetails = {
      shopName,
      shopLocation,
      businessType,
      panNumber,
      estimatedMonthlyPurchase,
    };

    await user.save();

    res.status(200).json({
      success: true,
      message: "Wholesale access requested successfully",
      user: publicUser(user),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.listWholesaleRequests = async (_req, res) => {
  try {
    const users = await User.find({ wholesaleStatus: "pending" }).sort({
      updatedAt: -1,
    });
    res.status(200).json({ success: true, users: users.map(publicUser) });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Could not load wholesale requests" });
  }
};

exports.decideWholesaleRequest = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user || user.wholesaleStatus !== "pending") {
      return res
        .status(404)
        .json({
          success: false,
          message: "Pending wholesale request not found",
        });
    }

    const approved = req.body.decision === "approved";
    user.wholesaleStatus = approved ? "approved" : "rejected";
    user.role = approved ? "verified_wholesale" : "bulk/shop";
    await user.save();
    res.status(200).json({
      success: true,
      message: approved
        ? "Wholesale request approved"
        : "Wholesale request rejected",
      user: publicUser(user),
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Could not update wholesale request" });
  }
};

exports.getCurrentUser = async (req, res) => {
  res.status(200).json({ success: true, user: publicUser(req.user) });
};

exports.requestPasswordReset = async (req, res) => {
  try {
    const user = await User.findOne({ phone: req.body.phone }).select(
      "+passwordResetCode +passwordResetExpiresAt +passwordResetAttempts",
    );
    // Always return the same result so phone numbers cannot be enumerated.
    if (!user)
      return res
        .status(200)
        .json({
          success: true,
          message: "If an account exists, an OTP has been sent.",
        });

    const otp = crypto.randomInt(100000, 1000000).toString();
    user.passwordResetCode = crypto
      .createHash("sha256")
      .update(otp)
      .digest("hex");
    user.passwordResetExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    user.passwordResetAttempts = 0;
    await user.save();

    const response = {
      success: true,
      message: "OTP created. It expires in 10 minutes.",
    };
    // SMS credentials are intentionally not bundled with source code. This lets the
    // university demo complete the real verification flow without exposing a provider.
    if (process.env.NODE_ENV !== "production") response.demoOtp = otp;
    res.status(200).json(response);
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Could not start password recovery" });
  }
};

exports.verifyPasswordReset = async (req, res) => {
  try {
    const user = await User.findOne({ phone: req.body.phone }).select(
      "+passwordResetCode +passwordResetExpiresAt +passwordResetAttempts",
    );
    const code = crypto.createHash("sha256").update(req.body.otp).digest("hex");
    const isValid =
      user &&
      user.passwordResetCode === code &&
      user.passwordResetExpiresAt > new Date() &&
      user.passwordResetAttempts < 5;

    if (!isValid) {
      if (user) {
        user.passwordResetAttempts += 1;
        await user.save();
      }
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired OTP" });
    }

    const resetToken = jwt.sign(
      { id: user._id, purpose: "password-reset" },
      process.env.JWT_SECRET,
      { expiresIn: "10m" },
    );
    res.status(200).json({ success: true, resetToken });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not verify OTP" });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const decoded = jwt.verify(req.body.resetToken, process.env.JWT_SECRET);
    if (decoded.purpose !== "password-reset")
      throw new Error("Invalid reset token");
    const user = await User.findById(decoded.id).select(
      "+passwordResetCode +passwordResetExpiresAt +passwordResetAttempts",
    );
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "Account not found" });

    user.password = req.body.password;
    user.passwordResetCode = undefined;
    user.passwordResetExpiresAt = undefined;
    user.passwordResetAttempts = 0;
    await user.save();
    res
      .status(200)
      .json({ success: true, message: "Password changed. Please log in." });
  } catch (error) {
    res
      .status(400)
      .json({
        success: false,
        message: "Your reset session has expired. Request a new OTP.",
      });
  }
};

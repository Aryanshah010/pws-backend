const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60,
    },

    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^\d{10}$/, "Phone must contain 10 digits"],
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },

    role: {
      type: String,
      enum: [
        "household/individual",
        "bulk/shop",
        "pending_wholesale",
        "verified_wholesale",
        "admin",
      ],
      default: "household/individual",
    },

    wholesaleStatus: {
      type: String,
      enum: ["not_requested", "pending", "approved", "rejected"],
      default: "not_requested",
    },

    wholesaleDetails: {
      shopName: { type: String, trim: true },
      shopLocation: { type: String, trim: true },
      businessType: { type: String, trim: true },
      panNumber: { type: String, trim: true },
      estimatedMonthlyPurchase: { type: Number, min: 0 },
    },

    lastLoginAt: { type: Date, default: null },

    passwordResetCode: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },
    passwordResetAttempts: { type: Number, default: 0, select: false },
  },
  {
    timestamps: true,
  },
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);

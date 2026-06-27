const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, "Quantity must be at least 1"],
    },

    priceAtPurchase: {
      type: Number,
      required: true,
    },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    items: [orderItemSchema],
    totalAmount: {
      type: Number,
      required: true,
    },
    pickupSlot: {
      type: String,
      required: [true, "Pickup time slot choice is required"],
    },

    orderStatus: {
      type: String,
      enum: ["Placed", "Acknowledged", "Ready", "Collected"],
      default: "Placed",
    },
    paymentMethod: {
      type: String,
      enum: ["Pay at Pickup", "Digital QR Transfer"],
      required: true,
    },

    paymentStatus: {
      type: String,
      enum: ["Unpaid", "Verifying", "Paid"],
      default: "Unpaid",
    },

    paymentProofUrl: {
      type: String,
      default: "",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Order", orderSchema);

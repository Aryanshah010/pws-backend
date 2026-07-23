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
    subtotalAmount: { type: Number, required: true },
    discountAmount: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },

    // What this order's stock cost the store, frozen at purchase so realised
    // margin stays true even after the supplier's price moves. Zero where the
    // storekeeper had not entered a cost for the items.
    // Withheld from every query unless explicitly asked for, so a buyer
    // fetching their own order never learns what the store paid.
    costAmount: { type: Number, default: 0, select: false },
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
      enum: ["Unpaid", "Pending Proof", "Verifying", "Paid", "Rejected"],
      default: "Unpaid",
    },

    paymentProofUrl: {
      type: String,
      default: "",
    },
    paymentProof: {
      transactionId: { type: String, trim: true, default: "" },
      note: { type: String, trim: true, maxlength: 500, default: "" },
      imageName: { type: String, trim: true, default: "" },
      imageDataUrl: { type: String, default: "" },
      submittedAt: { type: Date },
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

const mongoose = require("mongoose");

const restockSubscriptionSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["active", "notified"], default: "active" },
  },
  { timestamps: true },
);

restockSubscriptionSchema.index({ product: 1, user: 1 }, { unique: true });

module.exports = mongoose.model(
  "RestockSubscription",
  restockSubscriptionSchema,
);

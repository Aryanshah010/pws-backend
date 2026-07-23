const mongoose = require("mongoose");

const complaintSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    issueType: {
      type: String,
      enum: ["missing", "damaged", "wrong", "other"],
      required: true,
    },
    description: { type: String, trim: true, required: true, maxlength: 1200 },
    imageName: { type: String, default: "" },
    imageDataUrl: { type: String, default: "" },
    status: {
      type: String,
      enum: ["Open", "In Review", "Resolved"],
      default: "Open",
    },
    // What the storekeeper actually did about it, shown back to the buyer.
    resolutionNote: { type: String, trim: true, maxlength: 500, default: "" },
    handledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    resolvedAt: { type: Date },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Complaint", complaintSchema);

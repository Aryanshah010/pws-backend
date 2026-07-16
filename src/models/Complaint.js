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
    status: { type: String, enum: ["Open", "Resolved"], default: "Open" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Complaint", complaintSchema);

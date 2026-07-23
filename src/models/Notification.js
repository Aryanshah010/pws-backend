const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, required: true, maxlength: 100 },
    message: { type: String, required: true, maxlength: 300 },
    type: { type: String, default: "system" },
    link: { type: String, default: "" },
    key: { type: String, default: "" },
    read: { type: Boolean, default: false },
  },
  { timestamps: true },
);

notificationSchema.index(
  { user: 1, key: 1 },
  {
    unique: true,
    partialFilterExpression: { key: { $type: "string", $ne: "" } },
  },
);

module.exports = mongoose.model("Notification", notificationSchema);

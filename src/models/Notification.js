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
    // In-app route the bell should open when this notification is clicked.
    // Empty means the entry is informational only.
    link: { type: String, default: "" },
    // Identifies a notification that describes a *state* rather than an event
    // — "wholesale:approved" and the like. Unique per buyer, so the same state
    // can be reconciled into the bell repeatedly without ever duplicating.
    // Empty for ordinary one-off notifications.
    key: { type: String, default: "" },
    read: { type: Boolean, default: false },
  },
  { timestamps: true },
);

notificationSchema.index(
  { user: 1, key: 1 },
  { unique: true, partialFilterExpression: { key: { $type: "string", $ne: "" } } },
);

module.exports = mongoose.model("Notification", notificationSchema);

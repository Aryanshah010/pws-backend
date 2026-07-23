const mongoose = require("mongoose");

const pickupSlotSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, required: true, maxlength: 40 },
    available: { type: Boolean, default: true },
  },
  { _id: false },
);

const storeSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "store", unique: true, immutable: true },
    paymentQrImage: { type: String, default: "" },
    paymentQrName: { type: String, trim: true, default: "" },

    contactWhatsApp: {
      type: String,
      trim: true,
      default: "",
      match: [/^$|^\d{10,15}$/, "Enter the number in international form"],
    },

    pickupSlots: { type: [pickupSlotSchema], default: [] },
    businessTypes: { type: [String], default: [] },

    minMarginPercent: {
      type: Number,
      default: 10,
      min: [0, "Minimum margin cannot be negative"],
      max: [90, "Minimum margin must be below 90%"],
    },

    maxDiscountPercent: {
      type: Number,
      default: 40,
      min: [1, "Maximum discount must be at least 1%"],
      max: [90, "Maximum discount must be 90% or less"],
    },
  },
  { timestamps: true },
);

storeSettingsSchema.statics.current = function current() {
  return this.findOneAndUpdate(
    { key: "store" },
    { $setOnInsert: { key: "store" } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
};

module.exports = mongoose.model("StoreSettings", storeSettingsSchema);

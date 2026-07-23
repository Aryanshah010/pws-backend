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

    // The thinnest margin the store is willing to sell at. Every buyer price
    // and every discount tier is checked against it, so no product can be
    // saved with a ladder that gives away more than the store can afford.
    minMarginPercent: {
      type: Number,
      default: 10,
      min: [0, "Minimum margin cannot be negative"],
      max: [90, "Minimum margin must be below 90%"],
    },

    // The deepest any single tier may cut below the buyer price. Unlike the
    // margin floor this needs no cost price, so it is the guard that catches a
    // mistyped tier on a product whose cost was never entered.
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

const mongoose = require("mongoose");

const tierPriceSchema = new mongoose.Schema(
  {
    minQuantity: {
      type: Number,
      required: true,
      min: [1, "Minimum quantity for a tier must be at least 1"],
    },
    price: {
      type: Number,
      required: true,
      min: [0, "Tier price cannot be negative"],
    },
  },
  { _id: false },
);

const priceHistorySchema = new mongoose.Schema(
  {
    price: { type: Number, required: true },
    date: { type: Date, default: Date.now },
  },
  { _id: false },
);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
    },
    unit: {
      type: String,
      required: [
        true,
        "Unit of measurement (e.g., kg, liter, packet) is required",
      ],
      trim: true,
    },
    retailPrice: {
      type: Number,
      required: [true, "Base retail price is required"],
      min: [0, "Price cannot be negative"],
    },
    // Array holding bulk tier adjustments (e.g., Buy 10+ items, get it for X price)
    tierPrices: [tierPriceSchema],

    // Scrambled local string triggers for phonetic Nepali search matching
    aliases: {
      type: [String],
      default: [],
      index: true, // Indexed for rapid lookup performance
    },
    stock: {
      type: Number,
      required: [true, "Stock level count is required"],
      default: 0,
    },
    imageUrl: {
      type: String,
      default: "", // Fallback handled gracefully by React
    },
    // Array recording previous costs to populate frontend Recharts sparkline charts
    priceHistory: [priceHistorySchema],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Virtual field: Automatically determines live stock matrix badge parameters
productSchema.virtual("stockStatus").get(function () {
  if (this.stock <= 0) return "Out of Stock";
  if (this.stock <= 15) return "Low Stock"; // Warning threshold
  return "In Stock";
});

// Middleware: Automatically push the initial retailPrice into the history array upon creation
productSchema.pre("save", function () {
  if (this.isNew || this.isModified("retailPrice")) {
    this.priceHistory.push({ price: this.retailPrice, date: new Date() });
  }
});

module.exports = mongoose.model("Product", productSchema);

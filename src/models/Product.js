const mongoose = require("mongoose");

const tierPriceSchema = new mongoose.Schema(
  {
    minQuantity: {
      type: Number,
      required: true,
      min: [2, "A bulk tier must start at a quantity of 2 or more"],
    },
    price: {
      type: Number,
      required: true,
      min: [1, "Tier price must be greater than zero"],
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
    nameNe: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, maxlength: 1200, default: "" },
    descriptionNe: { type: String, trim: true, maxlength: 1200, default: "" },
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
    grade: { type: String, trim: true, default: "" },
    packCount: { type: String, trim: true, default: "" },
    shelfLife: { type: String, trim: true, default: "" },
    origin: { type: String, trim: true, default: "" },
    retailPrice: {
      type: Number,
      required: [true, "Base retail price is required"],
      min: [0, "Price cannot be negative"],
    },

    tierPrices: [tierPriceSchema],

    aliases: {
      type: [String],
      default: [],
      index: true,
    },
    stock: {
      type: Number,
      required: [true, "Stock level count is required"],
      default: 0,
    },
    imageUrl: {
      type: String,
      default: "",
    },
    isActive: { type: Boolean, default: true },

    priceHistory: [priceHistorySchema],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Tiers are a bulk discount, so each one must undercut retail and start at a
// higher quantity than the tier before it. Stored sorted so readers can rely
// on the order.
productSchema.pre("validate", function (next) {
  if (!this.tierPrices?.length) return next();

  this.tierPrices.sort((a, b) => a.minQuantity - b.minQuantity);

  for (let i = 0; i < this.tierPrices.length; i += 1) {
    const tier = this.tierPrices[i];
    if (tier.price >= this.retailPrice) {
      return next(
        new Error(
          `Tier price at quantity ${tier.minQuantity} must be below the retail price`,
        ),
      );
    }
    if (i > 0 && tier.minQuantity === this.tierPrices[i - 1].minQuantity) {
      return next(
        new Error(`Duplicate pricing tier for quantity ${tier.minQuantity}`),
      );
    }
  }
  return next();
});

productSchema.virtual("stockStatus").get(function () {
  if (this.stock <= 0) return "Out of Stock";
  if (this.stock <= 15) return "Low Stock";
  return "In Stock";
});

productSchema.pre("save", function () {
  if (this.isNew || this.isModified("retailPrice")) {
    this.priceHistory.push({ price: this.retailPrice, date: new Date() });
  }
});

productSchema.index({
  name: "text",
  nameNe: "text",
  aliases: "text",
  category: "text",
});

module.exports = mongoose.model("Product", productSchema);

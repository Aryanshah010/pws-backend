const mongoose = require("mongoose");

const discountTierSchema = new mongoose.Schema(
  {
    minQuantity: {
      type: Number,
      required: true,
      min: [2, "A bulk tier must start at a quantity of 2 or more"],
    },
    maxQuantity: { type: Number, default: null },
    discountAmount: {
      type: Number,
      required: true,
      min: [1, "Tier discount must be greater than zero"],
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

    costPrice: {
      type: Number,
      default: 0,
      min: [0, "Cost cannot be negative"],
      select: false,
    },
    discountable: { type: Boolean, default: true },
    discountTiers: [discountTierSchema],
    wholesaleDiscountTiers: [discountTierSchema],

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

productSchema.pre("validate", function () {
  for (const [label, tiers] of [
    ["", this.discountTiers],
    ["Wholesale ", this.wholesaleDiscountTiers],
  ]) {
    if (!tiers?.length) continue;

    tiers.sort((a, b) => a.minQuantity - b.minQuantity);

    for (let i = 0; i < tiers.length; i += 1) {
      const tier = tiers[i];
      const previous = tiers[i - 1];

      if (tier.maxQuantity != null && tier.maxQuantity < tier.minQuantity) {
        throw new Error(
          `${label}Tier starting at ${tier.minQuantity} ends at ${tier.maxQuantity}, which is before it begins`,
        );
      }

      if (tier.discountAmount >= this.retailPrice * tier.minQuantity) {
        throw new Error(
          `${label}Tier at ${tier.minQuantity}+ gives Rs. ${tier.discountAmount} off, but ${tier.minQuantity} of these only costs Rs. ${this.retailPrice * tier.minQuantity}`,
        );
      }

      if (!previous) continue;

      if (previous.maxQuantity == null) {
        throw new Error(
          `${label}Tier at ${previous.minQuantity}+ has no upper quantity, so no tier can follow it`,
        );
      }
      if (tier.minQuantity <= previous.maxQuantity) {
        throw new Error(
          `${label}Tier starting at ${tier.minQuantity} overlaps the one ending at ${previous.maxQuantity}`,
        );
      }

      if (tier.discountAmount <= previous.discountAmount) {
        throw new Error(
          `${label}Tier at ${tier.minQuantity}+ gives Rs. ${tier.discountAmount} off, which is no better than the Rs. ${previous.discountAmount} bracket below it`,
        );
      }
    }
  }
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

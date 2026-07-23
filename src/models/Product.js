const mongoose = require("mongoose");

/**
 * One bracket of the discount table.
 *
 * The discount is a flat amount off the line, not a per-unit price: buy
 * anything from 10 to 49 and Rs. 50 comes off the whole line, once. It does not
 * multiply with quantity, which is what keeps the giveaway bounded no matter
 * how large the order grows.
 */
const discountTierSchema = new mongoose.Schema(
  {
    minQuantity: {
      type: Number,
      required: true,
      min: [2, "A bulk tier must start at a quantity of 2 or more"],
    },
    // The last quantity in this bracket. Null means the bracket runs to any
    // quantity — the top rung of the table.
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

    // What the stock cost the store. Never sent to a buyer — it exists so the
    // margin floor can refuse a discount tier that would sell at a loss, and so
    // realised margin can be reported once the order is placed. Zero means the
    // storekeeper has not entered it yet and the floor stands down.
    costPrice: {
      type: Number,
      default: 0,
      min: [0, "Cost cannot be negative"],
      // Withheld from every query unless explicitly asked for, so no buyer
      // route can leak what the store paid by simply forgetting to filter.
      select: false,
    },

    // Staples like rice and cooking oil are price-transparent and thin on
    // margin; a deep tier on them gives away the most volume for the least
    // return. Turning this off keeps a product at one honest price for
    // everyone and pushes the bulk incentive onto the lines that can carry it.
    discountable: { type: Boolean, default: true },

    // The public discount table. It applies to every buyer — household, shop
    // and wholesale alike — so the bulk incentive on a product is the same
    // promise no matter who is looking at it.
    //
    // Renamed from tierPrices when the table stopped being a per-unit price and
    // became a flat per-bracket discount: the old field is left behind rather
    // than reinterpreted, so a Rs. 5 *price* can never be read as a Rs. 5
    // discount on a product nobody has re-saved yet.
    discountTiers: [discountTierSchema],

    // An optional deeper table that only verified wholesale accounts see. Left
    // empty (the default) the wholesale buyer simply gets the public table, so
    // a product is never without a discount ladder.
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

// Tiers are a bulk discount, so each one must undercut retail and start at a
// higher quantity than the tier before it. Stored sorted so readers can rely
// on the order.
// Mongoose 9 removed callback-style middleware: a hook that declares `next`
// is handed nothing and dies with "next is not a function" on every single
// save. Hooks here must be zero-argument and signal failure by throwing.
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

      // A flat discount cannot take the line below zero, and a discount worth
      // more than the goods at the bottom of its own bracket would do exactly
      // that.
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
      // Buying into a higher bracket must be worth more, or the cart's "add
      // more for the best rate" prompt leads to a smaller discount.
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

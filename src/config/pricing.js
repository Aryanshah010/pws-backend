/**
 * One place for every rupee the buyer is charged.
 *
 * Nepal levies a flat 13% VAT on the taxable value of goods (Value Added Tax
 * Act 2052). Because Pathivara Staples is pickup-only there is no delivery
 * charge, so VAT is the whole of the "Tax/fee" line the buyer sees. VAT is
 * charged on the value *after* any bulk discount, which is why the order of
 * operations below matters and must not be duplicated anywhere else.
 */
const VAT_RATE = 0.13;

// Every price in the catalogue is whole rupees, so the tax is rounded to the
// rupee too — a receipt that reads "Rs. 162.5" is not a receipt anyone in Jhapa
// would recognise.
const settleTotals = ({ subtotalAmount = 0, discountAmount = 0 } = {}) => {
  const netAmount = Math.max(0, subtotalAmount - discountAmount);
  const taxAmount = Math.round(netAmount * VAT_RATE);
  return { netAmount, taxAmount, totalAmount: netAmount + taxAmount };
};

/**
 * The discount table, cleaned into brackets that actually make sense.
 *
 * Each bracket is a quantity range with a flat rupee discount: 10–49 takes
 * Rs. 50 off the line, once, however many units are in it. Brackets are sorted,
 * and any that overlaps its predecessor or fails to beat it is dropped, so a
 * table saved before these rules existed can never promise a buyer a discount
 * that shrinks as they add more.
 */
const normaliseTiers = (tiers) => {
  let previousMax = 1;
  let previousDiscount = 0;
  return [...(tiers || [])]
    .map((tier) => ({
      minQuantity: Number(tier.minQuantity),
      maxQuantity:
        tier.maxQuantity == null || tier.maxQuantity === ""
          ? null
          : Number(tier.maxQuantity),
      discountAmount: Number(tier.discountAmount),
    }))
    .filter(
      (tier) =>
        Number.isFinite(tier.minQuantity) &&
        tier.minQuantity > 1 &&
        Number.isFinite(tier.discountAmount) &&
        tier.discountAmount > 0 &&
        (tier.maxQuantity == null || tier.maxQuantity >= tier.minQuantity),
    )
    .sort((a, b) => a.minQuantity - b.minQuantity)
    .filter((tier) => {
      if (tier.minQuantity <= previousMax) return false;
      if (tier.discountAmount <= previousDiscount) return false;
      previousMax = tier.maxQuantity ?? Infinity;
      previousDiscount = tier.discountAmount;
      return true;
    });
};

/** The bracket a quantity falls into, or null when it earns no discount yet. */
const tierAt = (tiers, quantity) =>
  tiers.find(
    (tier) =>
      quantity >= tier.minQuantity &&
      (tier.maxQuantity == null || quantity <= tier.maxQuantity),
  ) ?? null;

/** The next bracket up, for "add N more to reach it". */
const nextTierAfter = (tiers, quantity) =>
  tiers.find((tier) => quantity < tier.minQuantity) ?? null;

/**
 * The flat discount on one line. Capped at the line's own value so a generous
 * bracket can never hand back more than the goods are worth.
 */
const lineDiscount = (tiers, quantity, retailPrice) => {
  const tier = tierAt(tiers, quantity);
  if (!tier) return 0;
  return Math.min(tier.discountAmount, retailPrice * quantity);
};

/** The revenue a line must keep to clear the store's minimum margin. */
const requiredRevenue = (costTotal, minMarginPercent) =>
  costTotal > 0 ? Math.ceil(costTotal / (1 - minMarginPercent / 100)) : 0;

/** Margin on a selling price, or null when the cost is unknown. */
const marginPercent = (revenue, cost) =>
  cost > 0 && revenue > 0 ? ((revenue - cost) / revenue) * 100 : null;

/**
 * Checks a whole product's discount table against the store's limits.
 *
 * Every bracket is judged at its own *minimum* quantity, because that is where
 * a flat discount bites hardest: Rs. 50 off ten sacks is a far bigger cut than
 * Rs. 50 off forty-nine of them.
 */
const priceLadderErrors = (
  product,
  { minMarginPercent, maxDiscountPercent },
) => {
  const cost = Number(product.costPrice) || 0;
  const retail = Number(product.retailPrice) || 0;
  const errors = [];

  if (cost > 0 && retail < requiredRevenue(cost, minMarginPercent)) {
    const floor = requiredRevenue(cost, minMarginPercent);
    errors.push(
      `Buyer price Rs. ${retail} is below the Rs. ${floor} needed for a ${minMarginPercent}% margin on a cost of Rs. ${cost}.`,
    );
  }

  for (const [label, tiers] of [
    ["Discount tier", product.discountTiers],
    ["Wholesale tier", product.wholesaleDiscountTiers],
  ]) {
    (tiers || []).forEach((tier) => {
      const min = Number(tier.minQuantity);
      const discount = Number(tier.discountAmount);
      const lineValue = retail * min;
      if (!lineValue) return;

      const percentOff = (discount / lineValue) * 100;
      if (percentOff > maxDiscountPercent) {
        const most = Math.floor((lineValue * maxDiscountPercent) / 100);
        errors.push(
          `${label} at ${min}+ gives Rs. ${discount} off — ${percentOff.toFixed(1)}% of a Rs. ${lineValue} line, past the ${maxDiscountPercent}% limit. The most allowed here is Rs. ${most}.`,
        );
      }

      if (cost > 0) {
        const needed = requiredRevenue(cost * min, minMarginPercent);
        if (lineValue - discount < needed) {
          const most = Math.max(0, lineValue - needed);
          errors.push(
            `${label} at ${min}+ leaves Rs. ${lineValue - discount} against a Rs. ${cost * min} cost, under the ${minMarginPercent}% margin. The most allowed here is Rs. ${most}.`,
          );
        }
      }
    });
  }

  return errors;
};

module.exports = {
  VAT_RATE,
  settleTotals,
  normaliseTiers,
  tierAt,
  nextTierAfter,
  lineDiscount,
  requiredRevenue,
  marginPercent,
  priceLadderErrors,
};

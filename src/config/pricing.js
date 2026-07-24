const VAT_RATE = 0.13;

const settleTotals = ({ subtotalAmount = 0, discountAmount = 0 } = {}) => {
  const netAmount = Math.max(0, subtotalAmount - discountAmount);
  const taxAmount = Math.round(netAmount * VAT_RATE);
  return { netAmount, taxAmount, totalAmount: netAmount + taxAmount };
};

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

const tierAt = (tiers, quantity) =>
  tiers.find(
    (tier) =>
      quantity >= tier.minQuantity &&
      (tier.maxQuantity == null || quantity <= tier.maxQuantity),
  ) ?? null;

const nextTierAfter = (tiers, quantity) =>
  tiers.find((tier) => quantity < tier.minQuantity) ?? null;

// Folds several tier tables into one ladder where, at every quantity, the buyer
// gets the best discount any of the tables offers. Used to give wholesale buyers
// the shared default table plus their own extra brackets without the two ever
// cancelling each other out at a shared boundary.
const combineTiers = (lists) => {
  const flat = [];
  (lists || []).forEach((list) =>
    normaliseTiers(list).forEach((tier) => flat.push(tier)),
  );
  if (!flat.length) return [];

  const discountAt = (quantity) =>
    flat.reduce(
      (best, tier) =>
        quantity >= tier.minQuantity &&
        (tier.maxQuantity == null || quantity <= tier.maxQuantity)
          ? Math.max(best, tier.discountAmount)
          : best,
      0,
    );

  const points = new Set();
  flat.forEach((tier) => {
    points.add(tier.minQuantity);
    if (tier.maxQuantity != null) points.add(tier.maxQuantity + 1);
  });
  const sorted = [...points].sort((a, b) => a - b);

  const brackets = [];
  sorted.forEach((start, index) => {
    const discountAmount = discountAt(start);
    if (discountAmount <= 0) return;
    const nextPoint = sorted[index + 1];
    const maxQuantity = nextPoint == null ? null : nextPoint - 1;
    const previous = brackets[brackets.length - 1];
    if (
      previous &&
      previous.discountAmount === discountAmount &&
      previous.maxQuantity === start - 1
    ) {
      previous.maxQuantity = maxQuantity;
    } else {
      brackets.push({ minQuantity: start, maxQuantity, discountAmount });
    }
  });
  return brackets;
};

// Verified wholesale buyers get the default table AND their extra table (best
// discount wins); everyone else gets the default table only.
const tiersFor = (product, role) => {
  if (!product || product.discountable === false) return [];
  if (role === "verified_wholesale") {
    return combineTiers([product.discountTiers, product.wholesaleDiscountTiers]);
  }
  return normaliseTiers(product.discountTiers);
};

const wholesaleBasePrice = (product) =>
  product?.wholesalePrice != null && product.wholesalePrice > 0
    ? product.wholesalePrice
    : product?.retailPrice;

// The buyer's base unit price before bulk discounts: wholesale buyers get the
// admin-set wholesale price (falling back to retail when it is not set).
const unitPriceFor = (product, role) =>
  Number(
    role === "verified_wholesale"
      ? wholesaleBasePrice(product)
      : product?.retailPrice,
  ) || 0;

const lineDiscount = (tiers, quantity, unitPrice) => {
  const tier = tierAt(tiers, quantity);
  if (!tier) return 0;
  return Math.min(tier.discountAmount, unitPrice * quantity);
};

const requiredRevenue = (costTotal, minMarginPercent) =>
  costTotal > 0 ? Math.ceil(costTotal / (1 - minMarginPercent / 100)) : 0;

const marginPercent = (revenue, cost) =>
  cost > 0 && revenue > 0 ? ((revenue - cost) / revenue) * 100 : null;

const priceLadderErrors = (
  product,
  { minMarginPercent, maxDiscountPercent },
) => {
  const cost = Number(product.costPrice) || 0;
  const retail = Number(product.retailPrice) || 0;
  const wholesale = Number(wholesaleBasePrice(product)) || retail;
  const errors = [];

  if (cost > 0 && retail < requiredRevenue(cost, minMarginPercent)) {
    const floor = requiredRevenue(cost, minMarginPercent);
    errors.push(
      `Buyer price Rs. ${retail} is below the Rs. ${floor} needed for a ${minMarginPercent}% margin on a cost of Rs. ${cost}.`,
    );
  }

  if (
    cost > 0 &&
    product.wholesalePrice != null &&
    product.wholesalePrice > 0 &&
    wholesale < requiredRevenue(cost, minMarginPercent)
  ) {
    const floor = requiredRevenue(cost, minMarginPercent);
    errors.push(
      `Wholesale price Rs. ${wholesale} is below the Rs. ${floor} needed for a ${minMarginPercent}% margin on a cost of Rs. ${cost}.`,
    );
  }

  for (const [label, tiers, base] of [
    ["Discount tier", product.discountTiers, retail],
    ["Wholesale tier", product.wholesaleDiscountTiers, wholesale],
  ]) {
    (tiers || []).forEach((tier) => {
      const min = Number(tier.minQuantity);
      const discount = Number(tier.discountAmount);
      const lineValue = base * min;
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
  combineTiers,
  tiersFor,
  wholesaleBasePrice,
  unitPriceFor,
  lineDiscount,
  requiredRevenue,
  marginPercent,
  priceLadderErrors,
};

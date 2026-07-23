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


const lineDiscount = (tiers, quantity, retailPrice) => {
  const tier = tierAt(tiers, quantity);
  if (!tier) return 0;
  return Math.min(tier.discountAmount, retailPrice * quantity);
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

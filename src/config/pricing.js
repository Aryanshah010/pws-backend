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

module.exports = { VAT_RATE, settleTotals };

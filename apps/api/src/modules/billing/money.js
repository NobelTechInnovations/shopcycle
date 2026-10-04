const { env } = require("../../config/env");

/** Rupees, rounded to the paisa (never float drift). */
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const toPaise = (rupees) => Math.round(Number(rupees) * 100);
const fromPaise = (paise) => round2(Number(paise) / 100);
const num = (d) => (d == null ? 0 : Number(d));

const sameState = (buyerState) =>
  !buyerState || String(buyerState).trim().toLowerCase() === String(env.PLATFORM_STATE || "").trim().toLowerCase();

/**
 * GST on an amount before tax — added on top, never folded in. Same state
 * as Oyklane (or unknown) → CGST + SGST halves; another state → IGST.
 */
function tax(base, rate, buyerState) {
  const taxable = round2(base);
  const amount = round2((taxable * Number(rate)) / 100);
  if (sameState(buyerState)) {
    const cgst = round2(amount / 2);
    return { taxable, rate: Number(rate), amount, taxType: "cgst_sgst", cgst, sgst: round2(amount - cgst), igst: 0, total: round2(taxable + amount) };
  }
  return { taxable, rate: Number(rate), amount, taxType: "igst", cgst: 0, sgst: 0, igst: amount, total: round2(taxable + amount) };
}

module.exports = { round2, toPaise, fromPaise, num, tax, sameState };

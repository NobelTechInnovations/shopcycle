const { round2, num } = require("./money");

/**
 * What a plan costs, before tax.
 *   monthly  = the plan's monthly price
 *   yearly   = monthly × 12 × (1 − annual discount)   e.g. ₹599 → ₹5,750.40
 * The discount is on the subscription only — never on checkout fees.
 */
function periodPrice(plan, interval, settings) {
  const monthly = num(plan.priceMonthly);
  if (interval === "year") return round2(monthly * 12 * (1 - Number(settings.annualDiscountPercent) / 100));
  return round2(monthly);
}

/** Price per day of a period — how plans compare for up/downgrades. */
function dailyRate(plan, interval, settings) {
  return periodPrice(plan, interval, settings) / (interval === "year" ? 365 : 30);
}

const DAY = 24 * 60 * 60 * 1000;

/** Adds one billing interval to a date (calendar months; the 31st rolls
 * to the month's last day). */
function addInterval(date, interval, count = 1) {
  const d = new Date(date);
  const day = d.getUTCDate();
  const months = interval === "year" ? 12 * count : count;
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

const addDays = (date, days) => new Date(new Date(date).getTime() + days * DAY);

/** Admin free plan: no plan fee for a period starting at `at`. Order
 * commission and paid apps are still billed. */
function isFreePlan(sub, at = new Date()) {
  return Boolean(sub?.freePlanUntil && new Date(at) < new Date(sub.freePlanUntil));
}

/**
 * The price of the next regular period starting at `at`: ₹0 on an admin
 * free plan, else an admin promotion (a fixed price for the next N
 * periods), else the plan's price.
 */
function regularPrice(sub, plan, interval, settings, at = new Date()) {
  if (isFreePlan(sub, at)) return 0;
  if (sub.promoPrice != null && (sub.promoCyclesLeft == null || sub.promoCyclesLeft > 0)) return round2(num(sub.promoPrice));
  return periodPrice(plan, interval, settings);
}

/**
 * Upgrade proration: the unused part of what was paid for the current
 * period is credited against the new plan for the same remaining time.
 *   same interval   → charge (new − old) × remaining share; period unchanged
 *   month → year    → a new yearly period starts now; charge yearly − credit
 */
function proration({ fromPlan, fromInterval, toPlan, toInterval, periodStart, periodEnd, now, settings, paidAmount }) {
  const total = Math.max(1, new Date(periodEnd) - new Date(periodStart));
  const remaining = Math.max(0, new Date(periodEnd) - now);
  const share = Math.min(1, remaining / total);
  const oldPrice = paidAmount != null ? num(paidAmount) : periodPrice(fromPlan, fromInterval, settings);
  const credit = round2(oldPrice * share);
  if (toInterval === fromInterval) {
    const charge = round2(periodPrice(toPlan, toInterval, settings) * share - credit);
    return { charge: Math.max(0, charge), credit, newPeriod: null, share };
  }
  // A longer interval starts afresh today.
  const newPeriod = { start: now, end: addInterval(now, toInterval) };
  const charge = round2(periodPrice(toPlan, toInterval, settings) - credit);
  return { charge: Math.max(0, charge), credit, newPeriod, share };
}

module.exports = { periodPrice, dailyRate, addInterval, addDays, regularPrice, isFreePlan, proration, DAY };

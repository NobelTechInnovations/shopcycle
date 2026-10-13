const { env } = require("../../config/env");
const { round2, num } = require("./money");
const appCharges = require("./app-charges");

/**
 * Pay-per-use charges billed like paid apps (AppCharge, in arrears, with
 * the store's next billing cycle). Today: SMS sign-in codes — Oyklane
 * sends them (APITXT) for any store with Phone Login or One-Click
 * checkout, and the store whose shopper got the code pays SMS_OTP_PRICE
 * (₹0.50) per SMS. One running line per billing period:
 * "SMS sign-in codes (23 × ₹0.50)".
 */

const SMS = { appId: "usage-sms-otp", appKey: "sms-otp" };
const label = (count, price) => `SMS sign-in codes (${count} × ₹${price.toFixed(2)})`;

async function chargeSmsCode(prisma, storeId, { now = new Date() } = {}) {
  const price = round2(env.SMS_OTP_PRICE);
  if (!(price > 0)) return null;
  const sub = await prisma.subscription.findUnique({ where: { storeId } });
  if (!sub) return null; // a store without billing (shouldn't happen) isn't charged
  let periodStart = await appCharges.currentPeriodStart(prisma, sub, now);

  const add = () => prisma.appCharge.updateMany({ where: { storeId, appId: SMS.appId, periodStart, status: "pending" }, data: { amount: { increment: price } } });
  let { count } = await add();
  if (!count) {
    // This period's line was already billed (a cycle just closed): start
    // a fresh line, collected by the next bill.
    if (await prisma.appCharge.findUnique({ where: { storeId_appId_periodStart: { storeId, appId: SMS.appId, periodStart } } })) periodStart = now;
    try {
      await prisma.appCharge.create({ data: { storeId, subscriptionId: sub.id, appId: SMS.appId, appKey: SMS.appKey, appName: label(1, price), amount: price, periodStart } });
      count = 1;
    } catch (err) {
      if (err.code !== "P2002") throw err;
      ({ count } = await add()); // another code created it a moment ago
    }
  }
  // Keep the line's description in step with its amount.
  const row = await prisma.appCharge.findFirst({ where: { storeId, appId: SMS.appId, periodStart, status: "pending" } });
  if (row) {
    const codes = Math.round(num(row.amount) / price);
    const name = label(codes, price);
    if (row.appName !== name) await prisma.appCharge.update({ where: { id: row.id }, data: { appName: name } });
  }
  return row;
}

/** SMS codes this store has used in the current period (for its admin). */
async function smsUsage(prisma, storeId) {
  const price = round2(env.SMS_OTP_PRICE);
  const rows = await prisma.appCharge.findMany({ where: { storeId, appId: SMS.appId, status: "pending" }, select: { amount: true } });
  const amount = round2(rows.reduce((s, r) => s + num(r.amount), 0));
  return { price, codes: price > 0 ? Math.round(amount / price) : 0, amount };
}

module.exports = { SMS, chargeSmsCode, smsUsage };

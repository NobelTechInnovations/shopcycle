const { env } = require("../../config/env");
const { round2, num, tax } = require("./money");

/**
 * GST invoices from Oyklane to a seller — one for every paid billing
 * cycle. Amounts on the lines are before tax; GST is shown separately
 * (CGST + SGST when the seller is in Oyklane's state, else IGST) and a
 * TaxTransaction row records it for GST returns.
 */
function seller() {
  return {
    name: env.PLATFORM_LEGAL_NAME,
    gstin: env.PLATFORM_GSTIN || null,
    address: env.PLATFORM_ADDRESS || null,
    state: env.PLATFORM_STATE,
    sac: env.PLATFORM_SAC || null,
  };
}

function buyer(store) {
  return {
    name: store.billingName || store.name,
    gstin: store.gstin || null,
    address: store.billingAddress || null,
    state: store.billingState || null,
  };
}

async function nextNumber(db) {
  const last = await db.platformInvoice.findFirst({ orderBy: { number: "desc" }, select: { number: true } });
  const n = last ? Number(last.number.replace(/\D/g, "")) + 1 : 1;
  return `OYK-${String(n).padStart(6, "0")}`;
}

const KIND = { intro: "subscription", regular: "subscription", reactivation: "subscription", proration: "proration", fees: "fees" };

/** The invoice lines for a cycle (before tax). */
function cycleLines(cycle, { planName, feeOrders = 0, apps = [] }) {
  const lines = [];
  const plan = num(cycle.planAmount);
  const range = `${fmt(cycle.periodStart)} – ${fmt(cycle.periodEnd)}`;
  if (cycle.kind === "intro") lines.push({ description: `${planName} plan — first month (introductory price), ${range}`, amount: plan });
  else if (cycle.kind === "proration") lines.push({ description: `${planName} plan — upgrade for the rest of the period, ${range}`, amount: plan });
  else if (cycle.kind !== "fees") lines.push({ description: `${planName} plan — ${cycle.interval === "year" ? "yearly" : "monthly"} subscription, ${range}`, amount: plan });
  if (num(cycle.creditAmount) > 0) lines.push({ description: "Credit for the unused part of your previous plan", amount: -num(cycle.creditAmount) });
  if (num(cycle.feesAmount) !== 0) {
    lines.push({
      description: `Checkout fees — commission on ${feeOrders} order${feeOrders === 1 ? "" : "s"}${num(cycle.feesAmount) < 0 ? " (net of refunds)" : ""}`,
      amount: num(cycle.feesAmount),
    });
  }
  for (const a of apps) lines.push({ description: `${a.appName} app — billing period from ${fmt(a.periodStart)}`, amount: num(a.amount) });
  return lines;
}

function fmt(d) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

/**
 * Issues the invoice for a paid cycle inside the caller's transaction.
 * Unique on cycleId and paymentId, so it's issued once however many times
 * a payment is reported.
 */
async function issueForCycle(tx, { store, cycle, payment, planName }) {
  const existing = await tx.platformInvoice.findUnique({ where: { cycleId: cycle.id } });
  if (existing) return existing;

  const feeOrders = await tx.commissionTransaction.count({ where: { cycleId: cycle.id, kind: "accrual" } });
  const apps = num(cycle.appsAmount) > 0 ? await tx.appCharge.findMany({ where: { cycleId: cycle.id }, orderBy: [{ periodStart: "asc" }, { appName: "asc" }] }) : [];
  const lines = cycleLines(cycle, { planName, feeOrders, apps });
  const b = buyer(store);
  const t = tax(num(cycle.subtotal), num(cycle.taxRate), b.state);

  const invoice = await tx.platformInvoice.create({
    data: {
      storeId: store.id,
      number: await nextNumber(tx),
      kind: KIND[cycle.kind] || "subscription",
      paymentId: payment?.id || null,
      cycleId: cycle.id,
      razorpayPaymentId: payment?.providerPaymentId || null,
      periodStart: cycle.periodStart,
      periodEnd: cycle.periodEnd,
      lines,
      subtotal: t.taxable,
      taxRate: t.rate,
      cgst: t.cgst,
      sgst: t.sgst,
      igst: t.igst,
      taxableValue: t.taxable,
      taxType: t.taxType,
      taxAmount: t.amount,
      total: round2(num(cycle.total)),
      status: "paid",
      seller: seller(),
      buyer: b,
    },
  });
  await tx.taxTransaction.create({
    data: {
      storeId: store.id,
      invoiceId: invoice.id,
      taxableAmount: t.taxable,
      rate: t.rate,
      taxType: t.taxType,
      cgst: t.cgst,
      sgst: t.sgst,
      igst: t.igst,
      taxAmount: t.amount,
    },
  });
  return invoice;
}

/** A P2002 on the invoice number — two invoices issued in the same instant.
 * The caller retries its whole transaction. */
const isNumberClash = (err) => err?.code === "P2002" && String(err.meta?.target || "").includes("number");

module.exports = { issueForCycle, isNumberClash, seller, buyer };

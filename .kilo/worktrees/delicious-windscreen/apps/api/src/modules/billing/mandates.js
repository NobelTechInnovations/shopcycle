const crypto = require("crypto");
const { HttpError } = require("@shopcycle/utils");
const { provider, billingMode } = require("./providers");
const { getSettings } = require("./settings");
const { num, round2 } = require("./money");
const { addInterval } = require("./pricing");
const { logEvent } = require("./state");
const { ownerContact } = require("./notifications");
const charges = require("./charges");
const cycles = require("./cycles");

/**
 * Autopay mandates (Razorpay recurring tokens). Only Razorpay's own ids
 * and a display label ("UPI · ra***@okhdfc", "Visa •••• 4242") are kept —
 * never card or bank details.
 *
 *   created  → the seller opened the checkout
 *   pending  → authorised, waiting for the bank (e-mandates take days)
 *   active   → the engine may charge it
 *   rejected · cancelled · paused · expired
 *
 * A store has at most one live mandate: activating a new one cancels the
 * old one with the provider.
 */
const METHODS = ["upi", "card", "emandate"];
const METHOD_LABEL = { upi: "UPI AutoPay", card: "Card", emandate: "Bank e-mandate" };

async function ensureCustomer(prisma, store, sub, p) {
  if (sub.providerCustomerId && sub.provider === p.key) return sub.providerCustomerId;
  const who = await ownerContact(prisma, store.id);
  const c = await p.createCustomer({ name: store.billingName || store.name, email: who.email, contact: who.contact, notes: { storeId: store.id } });
  await prisma.subscription.update({ where: { id: sub.id }, data: { providerCustomerId: c.id, provider: p.key } });
  return c.id;
}

/**
 * Opens a mandate checkout. With something due (`cycle`), the first
 * payment pays it; with nothing due, card/UPI take a ₹1 check that is
 * refunded at once. An e-mandate carries no payment — the engine charges
 * it once the bank confirms.
 */
async function createSetup(prisma, store, sub, { method, cycle = null, now = new Date(), log, actorId = null }) {
  if (!METHODS.includes(method)) throw new HttpError(400, "Choose UPI AutoPay, a card, or a bank e-mandate.");
  if (billingMode() === "unconfigured") throw new HttpError(503, "Payments aren't switched on for Oyklane yet. Please try again later.");
  const p = provider();
  const settings = await getSettings(prisma);
  const due = cycle ? round2(num(cycle.total)) : 0;
  const limit = Number(settings.mandateMaxAmount[method]);
  if (due > limit) {
    throw new HttpError(400, `${METHOD_LABEL[method]} can take up to ₹${limit.toLocaleString("en-IN")} per payment — choose a card or bank e-mandate for this plan.`);
  }
  const customerId = await ensureCustomer(prisma, store, sub, p);

  // An earlier checkout the seller never finished is closed, not reused.
  await prisma.mandate.updateMany({ where: { subscriptionId: sub.id, status: "created" }, data: { status: "expired", failureReason: "Checkout not completed" } });

  const amount = method === "emandate" ? 0 : due > 0 ? due : 1;
  const expiresAt = addInterval(now, "year", Number(settings.mandateYears));
  const mandate = await prisma.mandate.create({
    data: { storeId: store.id, subscriptionId: sub.id, provider: p.key, providerCustomerId: customerId, method, status: "created", maxAmount: limit, expiresAt, livemode: p.livemode() },
  });
  const notes = { storeId: store.id, subscriptionId: sub.id, mandateId: mandate.id, purpose: "mandate_setup", cycleId: cycle?.id || "" };
  const order = await p.createMandateOrder({ customerId, method, amount, maxAmount: limit, expireAt: expiresAt, receipt: `mdt_${mandate.id}`, notes });
  await prisma.mandate.update({ where: { id: mandate.id }, data: { providerOrderId: order.orderId } });
  const payment = await prisma.billingPayment.create({
    data: {
      storeId: store.id,
      subscriptionId: sub.id,
      cycleId: amount > 0 && cycle ? cycle.id : null,
      mandateId: mandate.id,
      purpose: "mandate_setup",
      provider: p.key,
      providerOrderId: order.orderId,
      amount: order.amount,
      status: "created",
      method,
      attemptedAt: now,
    },
  });
  await logEvent(prisma, sub, "mandate.setup_started", { actorType: "seller", actorId, data: { method, amount: order.amount, mandateId: mandate.id } });

  if (p.key === "sandbox") {
    // Local development: the "bank" approves at once.
    const tokenId = `tok_sbx${crypto.randomBytes(6).toString("hex")}`;
    const paymentId = `pay_sbx${crypto.randomBytes(6).toString("hex")}`;
    await prisma.billingPayment.update({ where: { id: payment.id }, data: { providerPaymentId: paymentId } });
    await charges.applyProviderPayment(
      prisma,
      { ...payment, providerPaymentId: paymentId },
      { id: paymentId, orderId: order.orderId, status: "captured", amount: order.amount, method, tokenId, display: { type: method === "emandate" ? "netbanking" : method, label: `Sandbox ${METHOD_LABEL[method]}` } },
      { now, log }
    );
    return { completed: true, amount: order.amount, method };
  }

  const who = await ownerContact(prisma, store.id);
  return {
    completed: false,
    amount: order.amount,
    method,
    checkout: p.checkoutOptions({
      orderId: order.orderId,
      customerId,
      amount: order.amount,
      recurring: true,
      name: "Oyklane",
      description: due > 0 ? `${store.name} — subscription` : `${store.name} — set up autopay`,
      prefill: { name: who.name || "", email: who.email || "", contact: who.contact || "" },
      notes,
    }),
  };
}

/** The mandate's first payment went through (checkout verified or webhook). */
async function onSetupCaptured(prisma, payment, pp, { now = new Date(), log } = {}) {
  const mandate = payment.mandateId ? await prisma.mandate.findUnique({ where: { id: payment.mandateId } }) : null;
  if (!mandate) return;
  const p = provider(mandate.provider);

  // Pay what this checkout was for before the mandate goes live — so the
  // engine never also charges the same cycle on the new mandate.
  if (payment.cycleId && num(payment.amount) > 0) {
    await charges.settleCycle(prisma, payment.cycleId, { paymentId: payment.id, now, log });
  } else if (num(payment.amount) > 0) {
    // The ₹1 check — back to the seller straight away.
    try {
      const r = await p.refund({ paymentId: pp.id, amount: num(payment.amount), notes: { purpose: "mandate_check", storeId: payment.storeId } });
      await prisma.$transaction([
        prisma.billingRefund.create({ data: { storeId: payment.storeId, paymentId: payment.id, providerRefundId: r.id, amount: num(payment.amount), reason: "Autopay verification", status: r.status === "processed" ? "processed" : "pending" } }),
        prisma.billingPayment.update({ where: { id: payment.id }, data: { status: "refunded", refundedAmount: num(payment.amount) } }),
      ]);
    } catch (err) {
      log?.warn({ err, paymentId: payment.id }, "billing: couldn't refund the ₹1 autopay check");
    }
  }

  let status = mandate.method === "emandate" ? "pending" : "active";
  let display = pp.display;
  let failureReason = null;
  if (pp.tokenId) {
    try {
      const t = await p.fetchMandate({ customerId: mandate.providerCustomerId, tokenId: pp.tokenId });
      status = t.status;
      failureReason = t.failureReason;
      if (t.display?.label && t.display.type !== "unknown") display = t.display;
    } catch (err) {
      log?.warn({ err, mandateId: mandate.id }, "billing: couldn't read the new mandate; using the payment");
    }
  }
  await setState(prisma, mandate, { tokenId: pp.tokenId, status, display, failureReason, now, log });
}

/** Records the token as soon as a payment names it (e-mandates are
 * pending until the bank confirms — the webhook then finds it by id). */
async function recordToken(prisma, payment, pp) {
  if (!pp?.tokenId || !payment?.mandateId) return;
  await prisma.mandate.updateMany({ where: { id: payment.mandateId, providerTokenId: null }, data: { providerTokenId: pp.tokenId, status: "pending" } });
}

/** Applies a mandate's new state; activating one retires the others and
 * collects anything outstanding. */
async function setState(prisma, mandate, { tokenId, status, display, failureReason = null, now = new Date(), log }) {
  const was = mandate.status;
  const data = { status, failureReason };
  if (tokenId) data.providerTokenId = tokenId;
  if (status === "active" && !mandate.activatedAt) data.activatedAt = now;
  if (status === "cancelled" && !mandate.cancelledAt) data.cancelledAt = now;
  const updated = await prisma.mandate.update({ where: { id: mandate.id }, data });

  if (display?.label) {
    const pm = { type: display.type || mandate.method, label: String(display.label).slice(0, 120), brand: display.brand || null, last4: display.last4 || null, bank: display.bank || null };
    await prisma.paymentMethod.upsert({ where: { mandateId: mandate.id }, update: pm, create: { storeId: mandate.storeId, mandateId: mandate.id, ...pm } });
  }
  if (was === status) return updated;

  const sub = { id: mandate.subscriptionId, storeId: mandate.storeId };
  await logEvent(prisma, sub, `mandate.${status}`, { actorType: "provider", data: { mandateId: mandate.id, method: mandate.method, reason: failureReason } });

  if (status === "active") {
    const others = await prisma.mandate.findMany({ where: { subscriptionId: mandate.subscriptionId, id: { not: mandate.id }, status: { in: ["active", "pending", "paused"] } } });
    for (const o of others) await cancel(prisma, o, { reason: "Replaced by a new payment method", log });
    await collectOutstanding(prisma, mandate.subscriptionId, { now, log });
  }
  return updated;
}

/** Charges an unpaid cycle on a newly active mandate. */
async function collectOutstanding(prisma, subscriptionId, { now = new Date(), log } = {}) {
  const cycle = await cycles.outstanding(prisma, subscriptionId);
  if (!cycle || !["due", "failed"].includes(cycle.status)) return null;
  // A checkout for this cycle that's still waiting on the bank pays it.
  const inFlight = await prisma.billingPayment.count({ where: { cycleId: cycle.id, status: { in: ["pending", "captured"] } } });
  if (inFlight) return null;
  return charges.chargeCycle(prisma, cycle.id, { now, log });
}

async function cancel(prisma, mandate, { reason, log, actorType = "system", actorId = null } = {}) {
  if (mandate.providerTokenId && ["active", "pending", "paused"].includes(mandate.status)) {
    try {
      await provider(mandate.provider).cancelMandate({ customerId: mandate.providerCustomerId, tokenId: mandate.providerTokenId });
    } catch (err) {
      log?.warn({ err, mandateId: mandate.id }, "billing: provider refused the mandate cancellation; marking it cancelled here");
    }
  }
  await prisma.mandate.update({ where: { id: mandate.id }, data: { status: "cancelled", cancelledAt: new Date(), failureReason: reason || null } });
  await logEvent(prisma, { id: mandate.subscriptionId, storeId: mandate.storeId }, "mandate.cancelled", { actorType, actorId, data: { mandateId: mandate.id, reason } });
}

/** Asks the provider about a mandate (reconciliation, webhooks we missed). */
async function sync(prisma, mandate, { now = new Date(), log } = {}) {
  if (!mandate.providerTokenId) return mandate;
  const t = await provider(mandate.provider).fetchMandate({ customerId: mandate.providerCustomerId, tokenId: mandate.providerTokenId });
  return setState(prisma, mandate, { status: t.status, display: t.display, failureReason: t.failureReason, now, log });
}

/** A token webhook (token.confirmed / rejected / cancelled / paused). */
async function onTokenEvent(prisma, token, { now = new Date(), log } = {}) {
  const mandate = await prisma.mandate.findUnique({ where: { providerTokenId: token.id } });
  if (!mandate) return "unknown";
  await setState(prisma, mandate, { status: token.status, display: token.display, failureReason: token.failureReason, now, log });
  return "applied";
}

function serialize(m) {
  if (!m) return null;
  return {
    id: m.id,
    method: m.method,
    methodLabel: METHOD_LABEL[m.method] || m.method,
    status: m.status,
    label: m.paymentMethod?.label || METHOD_LABEL[m.method],
    brand: m.paymentMethod?.brand || null,
    last4: m.paymentMethod?.last4 || null,
    bank: m.paymentMethod?.bank || null,
    maxAmount: num(m.maxAmount),
    livemode: m.livemode,
    providerCustomerId: m.providerCustomerId,
    providerTokenId: m.providerTokenId,
    createdAt: m.createdAt,
    activatedAt: m.activatedAt,
    cancelledAt: m.cancelledAt,
    expiresAt: m.expiresAt,
    failureReason: m.failureReason,
  };
}

module.exports = { METHODS, METHOD_LABEL, createSetup, onSetupCaptured, recordToken, setState, collectOutstanding, cancel, sync, onTokenEvent, serialize, ensureCustomer };

const { round2, num } = require("./money");
const { getSettings } = require("./settings");
const { addInterval, addDays } = require("./pricing");
const { provider } = require("./providers");
const { transition, logEvent, syncStorePlan, UNPAID } = require("./state");
const { issueForCycle, isNumberClash } = require("./invoices");
const commission = require("./commission");
const { notify, ownerContact, inr } = require("./notifications");

/**
 * Collecting money and acting on the result. A payment's outcome only
 * ever comes from the provider (a verified webhook, or the engine asking
 * the provider directly) — never from the browser saying it worked.
 * Settling and failing are idempotent: a second report of the same
 * outcome changes nothing.
 */

/** The mandate the engine may charge: active, and made in the same mode
 * (live/test) as the keys this server runs with. */
async function activeMandate(prisma, subscriptionId) {
  const p = provider();
  return prisma.mandate.findFirst({
    where: { subscriptionId, status: "active", provider: p.key, livemode: p.livemode(), providerTokenId: { not: null } },
    orderBy: { activatedAt: "desc" },
    include: { paymentMethod: true },
  });
}

/** Retries happen `retryOffsetsDays` after the first failure, inside the
 * grace period. The next one after `now`, or null. */
function nextRetryAt(firstFailureAt, now, settings, graceEndsAt) {
  const offsets = [...(settings.retryOffsetsDays || [])].map(Number).sort((a, b) => a - b);
  for (const d of offsets) {
    const at = addDays(firstFailureAt, d);
    if (at > now && (!graceEndsAt || at < new Date(graceEndsAt))) return at;
  }
  return null;
}

/**
 * Charges a cycle on the store's mandate. Usually the result is "pending"
 * (UPI debits wait for the bank's pre-debit notice); the webhook or the
 * engine's reconciliation settles it later.
 */
async function chargeCycle(prisma, cycleId, { now = new Date(), log } = {}) {
  const cycle = await prisma.billingCycle.findUnique({ where: { id: cycleId } });
  if (!cycle || !["due", "failed"].includes(cycle.status)) return { status: cycle?.status || "missing" };

  const total = num(cycle.total);
  if (total < 1) {
    // Nothing to collect (a ₹0 promo, fees fully credited back).
    await settleCycle(prisma, cycle.id, { now, log, waived: true });
    return { status: "waived" };
  }

  const mandate = await activeMandate(prisma, cycle.subscriptionId);
  if (!mandate) {
    await prisma.billingCycle.update({ where: { id: cycle.id }, data: { attempts: { increment: 1 }, lastAttemptAt: now } });
    await failCycle(prisma, cycle.id, "No autopay payment method is set up.", { now, log, code: "no_mandate" });
    return { status: "failed", reason: "no_mandate" };
  }

  // Claim the cycle — two engine runs never charge it twice.
  const claimed = await prisma.billingCycle.updateMany({
    where: { id: cycle.id, status: { in: ["due", "failed"] } },
    data: { status: "processing", attempts: { increment: 1 }, lastAttemptAt: now },
  });
  if (!claimed.count) return { status: "processing" };

  const p = provider(mandate.provider);
  const store = await prisma.store.findUnique({ where: { id: cycle.storeId }, select: { name: true } });
  const who = await ownerContact(prisma, cycle.storeId);
  const notes = { storeId: cycle.storeId, subscriptionId: cycle.subscriptionId, cycleId: cycle.id, purpose: "charge" };
  let res;
  try {
    res = await p.charge({
      customerId: mandate.providerCustomerId,
      tokenId: mandate.providerTokenId,
      amount: total,
      receipt: `cyc_${cycle.id}`,
      description: `Oyklane — ${store?.name || "subscription"}`,
      notes,
      email: who.email,
      contact: who.contact,
    });
  } catch (err) {
    const reason = err.message || "The charge was declined.";
    await prisma.billingPayment.create({
      data: {
        storeId: cycle.storeId,
        subscriptionId: cycle.subscriptionId,
        cycleId: cycle.id,
        mandateId: mandate.id,
        purpose: "charge",
        provider: p.key,
        amount: total,
        status: "failed",
        method: mandate.method,
        failureCode: err.providerCode || null,
        failureReason: reason,
        failedAt: now,
        attemptedAt: now,
      },
    });
    await failCycle(prisma, cycle.id, reason, { now, log, code: err.providerCode || "charge_error" });
    return { status: "failed", reason };
  }

  const payment = await prisma.billingPayment.create({
    data: {
      storeId: cycle.storeId,
      subscriptionId: cycle.subscriptionId,
      cycleId: cycle.id,
      mandateId: mandate.id,
      purpose: "charge",
      provider: p.key,
      providerOrderId: res.orderId,
      providerPaymentId: res.paymentId,
      amount: total,
      status: "pending",
      method: mandate.method,
      attemptedAt: now,
    },
  });
  await logEvent(prisma, { id: cycle.subscriptionId, storeId: cycle.storeId }, "payment.attempted", { data: { cycleId: cycle.id, amount: total, paymentId: payment.id } });

  if (res.status === "captured" && res.paymentId) {
    // The sandbox answers at once; Razorpay reports through the webhook.
    await applyProviderPayment(prisma, payment, await p.fetchPayment(res.paymentId), { now, log });
  }
  return { status: "processing", paymentId: payment.id };
}

/**
 * The single place a provider's word about a payment is applied —
 * webhooks, checkout verification and reconciliation all end here.
 */
async function applyProviderPayment(prisma, paymentRow, pp, { now = new Date(), log } = {}) {
  if (!pp || !paymentRow) return "ignored";
  if (pp.status === "captured") {
    const claimed = await prisma.billingPayment.updateMany({
      where: { id: paymentRow.id, status: { in: ["created", "pending", "failed"] } },
      data: { status: "captured", capturedAt: now, providerPaymentId: pp.id || paymentRow.providerPaymentId, method: pp.method || paymentRow.method, failureCode: null, failureReason: null, raw: pp },
    });
    if (!claimed.count) return "duplicate";
    const fresh = await prisma.billingPayment.findUnique({ where: { id: paymentRow.id } });
    if (fresh.purpose === "mandate_setup") {
      await require("./mandates").onSetupCaptured(prisma, fresh, pp, { now, log });
    } else if (fresh.cycleId) {
      await settleCycle(prisma, fresh.cycleId, { paymentId: fresh.id, now, log });
    }
    return "captured";
  }
  if (pp.status === "failed") {
    const claimed = await prisma.billingPayment.updateMany({
      where: { id: paymentRow.id, status: { in: ["created", "pending"] } },
      data: { status: "failed", failedAt: now, providerPaymentId: pp.id || paymentRow.providerPaymentId, failureCode: pp.errorCode, failureReason: pp.errorReason, raw: pp },
    });
    if (!claimed.count) return "duplicate";
    // Only an automatic charge counts against the subscription; a failed
    // attempt in the checkout window can simply be tried again there.
    if (paymentRow.purpose === "charge" && paymentRow.cycleId) {
      await failCycle(prisma, paymentRow.cycleId, pp.errorReason || "The bank declined the payment.", { now, log, paymentId: paymentRow.id, code: pp.errorCode });
    }
    return "failed";
  }
  return "pending";
}

/** Marks a cycle paid (or waived) and brings the subscription up to date. */
async function settleCycle(prisma, cycleId, { paymentId = null, now = new Date(), log, waived = false, actor = null } = {}) {
  const settings = await getSettings(prisma);
  let out = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      out = await prisma.$transaction(async (tx) => {
        const claim = await tx.billingCycle.updateMany({
          where: { id: cycleId, status: { notIn: ["paid", "waived"] } },
          data: { status: waived ? "waived" : "paid", paidAt: now },
        });
        if (!claim.count) return null;
        let cycle = await tx.billingCycle.findUnique({ where: { id: cycleId } });
        const sub = await tx.subscription.findUnique({ where: { id: cycle.subscriptionId } });
        const store = await tx.store.findUnique({ where: { id: cycle.storeId } });
        const plan = await tx.plan.findUnique({ where: { id: cycle.planId || sub.planId } });
        const payment = paymentId ? await tx.billingPayment.findUnique({ where: { id: paymentId } }) : null;

        // The period this payment buys. Paid on time → the cycle's own
        // period; paid after the dashboard was locked (or to come back
        // after it ended) → a fresh period from the moment of payment.
        const periodKinds = ["intro", "regular", "reactivation"];
        if (periodKinds.includes(cycle.kind)) {
          const late = ["PENDING_PAYMENT", "PAST_DUE", "SUSPENDED", "EXPIRED", "CANCELLED"].includes(sub.status) || cycle.kind === "reactivation";
          if (late) {
            cycle = await tx.billingCycle.update({
              where: { id: cycle.id },
              data: { periodStart: now, periodEnd: addInterval(now, cycle.kind === "intro" ? "month" : cycle.interval) },
            });
          }
        }

        let invoice = null;
        if (!waived && num(cycle.total) > 0) {
          invoice = await issueForCycle(tx, { store, cycle, payment, planName: plan?.name || "Oyklane" });
          await tx.billingCycle.update({ where: { id: cycle.id }, data: { invoiceId: invoice.id } });
        }
        await commission.settle(tx, cycle.id, waived ? "waived" : "paid", invoice?.id || null);

        const patch = {};
        if (periodKinds.includes(cycle.kind)) {
          const start = cycle.periodStart;
          const end = cycle.periodEnd;
          Object.assign(patch, {
            currentPeriodStart: start,
            currentPeriodEnd: end,
            nextBillingAt: end,
            startedAt: sub.startedAt || start,
            feesSettledThrough: start,
            planId: cycle.planId || sub.planId,
          });
          if (cycle.kind === "intro") patch.introUsedAt = now;
          else patch.interval = cycle.interval;
          if (cycle.meta?.promo && sub.promoCyclesLeft != null) patch.promoCyclesLeft = Math.max(0, sub.promoCyclesLeft - 1);
          if (cycle.kind === "reactivation") {
            Object.assign(patch, { autoRenew: true, cancelRequestedAt: null, cancelReason: null, cancelledAt: null, expiredAt: null, pendingPlanId: null, pendingInterval: null });
          }
        } else if (cycle.kind === "fees") {
          patch.feesSettledThrough = cycle.periodEnd;
        }

        const stillOwed = await tx.billingCycle.count({ where: { subscriptionId: sub.id, status: { in: ["due", "failed"] }, id: { not: cycle.id } } });
        let to = sub.status;
        if (!stillOwed) {
          if (["TRIALING", ...UNPAID, "CANCELLED"].includes(sub.status)) to = "ACTIVE";
          Object.assign(patch, { consecutiveFailures: 0, graceEndsAt: null, lockedAt: null, suspendedAt: null, nextRetryAt: null, dunningNextAt: null });
          await tx.billingFailure.updateMany({ where: { subscriptionId: sub.id, resolvedAt: null }, data: { resolvedAt: now, resolution: waived ? "waived" : "paid" } });
        }
        const updated = await transition(tx, sub, to, {
          type: waived ? "cycle.waived" : "payment.succeeded",
          data: { cycleId: cycle.id, kind: cycle.kind, amount: num(cycle.total), invoiceId: invoice?.id || null },
          patch,
          actorType: actor ? "admin" : "system",
          actorId: actor,
        });
        if (patch.planId && patch.planId !== store.planId) await syncStorePlan(tx, store.id, patch.planId);
        return { cycle, sub: updated, fromStatus: sub.status, store, plan, invoice };
      });
      break;
    } catch (err) {
      if (isNumberClash(err) && attempt < 4) continue;
      throw err;
    }
  }
  if (!out) return null;

  // Tell the seller. One email per event; the rest only on the dashboard.
  const { cycle, sub, fromStatus, store, plan } = out;
  const rows = [];
  if (num(cycle.planAmount) > 0) rows.push([cycle.kind === "intro" ? `${plan?.name} — first month` : `${plan?.name} plan`, inr(cycle.planAmount)]);
  if (num(cycle.creditAmount) > 0) rows.push(["Credit for unused time", `−${inr(cycle.creditAmount)}`]);
  if (num(cycle.feesAmount) !== 0) rows.push(["Checkout fees", inr(cycle.feesAmount)]);
  rows.push([`GST (${num(cycle.taxRate)}%)`, inr(cycle.taxAmount)]);
  rows.push(["Total paid", inr(cycle.total), true]);

  if (!waived) {
    let lifecycle = null;
    if (fromStatus === "SUSPENDED") lifecycle = ["store_restored", {}];
    else if (["TRIALING", "PENDING_PAYMENT", "EXPIRED", "CANCELLED"].includes(fromStatus) && cycle.kind !== "fees") {
      lifecycle = ["subscription_activated", { planName: plan?.name, interval: sub.interval, nextBillingAt: sub.nextBillingAt }];
    } else if (cycle.kind === "regular") lifecycle = ["subscription_renewed", { planName: plan?.name, periodEnd: sub.currentPeriodEnd }];
    await notify(prisma, store, "payment_successful", { amount: num(cycle.total), rows }, { dedupeKey: `paid:${cycle.id}`, email: !lifecycle || lifecycle[0] === "subscription_renewed", log });
    if (lifecycle) {
      await notify(prisma, store, lifecycle[0], lifecycle[1], { dedupeKey: `${lifecycle[0]}:${cycle.id}`, email: lifecycle[0] !== "subscription_renewed", log });
    }
  }
  return out;
}

/**
 * A cycle couldn't be collected. The first failure opens the grace period
 * (full access, automatic retries); later failures of the same cycle just
 * schedule the next retry. The engine takes it from there: grace over →
 * dashboard locked; more unpaid cycles → store suspended.
 */
async function failCycle(prisma, cycleId, reason, { now = new Date(), log, paymentId = null, code = null } = {}) {
  const settings = await getSettings(prisma);
  const out = await prisma.$transaction(async (tx) => {
    const cycle = await tx.billingCycle.findUnique({ where: { id: cycleId } });
    if (!cycle || ["paid", "waived", "void"].includes(cycle.status)) return null;
    await tx.billingCycle.update({ where: { id: cycleId }, data: { status: "failed", failedAt: now, failureReason: String(reason).slice(0, 500) } });
    const sub = await tx.subscription.findUnique({ where: { id: cycle.subscriptionId } });

    if (!UNPAID.includes(sub.status)) {
      const failureNumber = sub.consecutiveFailures + 1;
      const graceEndsAt = addDays(now, settings.graceDays);
      const updated = await transition(tx, sub, "GRACE_PERIOD", {
        type: "payment.failed",
        data: { cycleId, reason, code, failureNumber },
        patch: {
          consecutiveFailures: failureNumber,
          lastFailureAt: now,
          graceEndsAt,
          nextRetryAt: code === "no_mandate" ? null : nextRetryAt(now, now, settings, graceEndsAt),
          dunningNextAt: addInterval(now, "month"),
        },
      });
      await tx.billingFailure.create({ data: { storeId: sub.storeId, subscriptionId: sub.id, cycleId, paymentId, failureNumber, reason: String(reason).slice(0, 500), graceEndsAt } });
      return { first: true, sub: updated, cycle };
    }
    // A retry of an already-failed cycle.
    const retry = sub.status === "GRACE_PERIOD" && code !== "no_mandate" ? nextRetryAt(sub.lastFailureAt || now, now, settings, sub.graceEndsAt) : null;
    const updated = await tx.subscription.update({ where: { id: sub.id }, data: { nextRetryAt: retry } });
    await logEvent(tx, sub, "payment.retry_failed", { data: { cycleId, reason, code, nextRetryAt: retry } });
    return { first: false, sub: updated, cycle };
  });
  if (out?.first) {
    const store = await prisma.store.findUnique({ where: { id: out.sub.storeId } });
    await notify(
      prisma,
      store,
      "payment_failed",
      { reason, graceDays: settings.graceDays, graceEndsAt: out.sub.graceEndsAt, amount: num(out.cycle.total) },
      { dedupeKey: `failed:${cycleId}`, log }
    );
  }
  return out;
}

/** Refunds (part of) a captured payment — super admin only. */
async function refundPayment(prisma, paymentId, { amount, reason, actor, log } = {}) {
  const payment = await prisma.billingPayment.findUnique({ where: { id: paymentId } });
  if (!payment || !["captured", "partially_refunded"].includes(payment.status)) {
    throw Object.assign(new Error("Only a captured payment can be refunded."), { statusCode: 400 });
  }
  const left = round2(num(payment.amount) - num(payment.refundedAmount));
  const value = round2(amount == null ? left : Number(amount));
  if (!(value > 0) || value > left) throw Object.assign(new Error(`Refund between ₹0.01 and ${inr(left)}.`), { statusCode: 400 });
  const p = provider(payment.provider);
  const r = await p.refund({ paymentId: payment.providerPaymentId, amount: value, notes: { storeId: payment.storeId, reason: reason || "" } });
  const refunded = round2(num(payment.refundedAmount) + value);
  await prisma.$transaction([
    prisma.billingRefund.create({
      data: { storeId: payment.storeId, paymentId: payment.id, providerRefundId: r.id, amount: value, reason: reason || null, status: r.status === "processed" ? "processed" : r.status === "failed" ? "failed" : "pending", createdBy: actor || null },
    }),
    prisma.billingPayment.update({ where: { id: payment.id }, data: { refundedAmount: refunded, status: refunded >= num(payment.amount) ? "refunded" : "partially_refunded" } }),
  ]);
  await logEvent(prisma, { id: payment.subscriptionId, storeId: payment.storeId }, "payment.refunded", { actorType: actor ? "admin" : "system", actorId: actor, data: { paymentId, amount: value, reason } });
  return { refunded: value, providerRefundId: r.id };
}

module.exports = { activeMandate, chargeCycle, applyProviderPayment, settleCycle, failCycle, refundPayment, nextRetryAt };

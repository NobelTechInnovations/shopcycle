const { HttpError } = require("@shopcycle/utils");
const { PROVIDERS } = require("./providers");
const charges = require("./charges");
const mandates = require("./mandates");

/**
 * Provider webhooks. Each event is stored once (unique provider event id)
 * before it's applied, so a retried delivery is acknowledged without
 * being applied twice, and one that failed half-way is replayed by the
 * engine. Trust comes only from the signature.
 */
async function receive(prisma, providerKey, { body, headers, rawBody, log }) {
  const p = PROVIDERS[providerKey];
  if (!p) throw new HttpError(404, "Unknown provider");
  const signature = headers["x-razorpay-signature"];
  if (!p.verifyWebhook(rawBody, signature)) throw new HttpError(400, "Invalid signature");

  const evt = p.parseWebhook(body, headers, rawBody);
  if (!evt) return { ok: true, ignored: true };

  let row;
  try {
    row = await prisma.paymentWebhookEvent.create({ data: { provider: p.key, providerEventId: evt.eventId, eventType: evt.type, payload: body } });
  } catch (err) {
    if (err.code !== "P2002") throw err;
    row = await prisma.paymentWebhookEvent.findUnique({ where: { providerEventId: evt.eventId } });
    if (row.processed) return { ok: true, duplicate: true };
  }
  await processEvent(prisma, row, evt, { log });
  return { ok: true };
}

async function processEvent(prisma, row, evt, { log }) {
  await prisma.paymentWebhookEvent.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
  try {
    const outcome = await apply(prisma, evt, { log });
    if (outcome === "retry") {
      await prisma.paymentWebhookEvent.update({ where: { id: row.id }, data: { error: "Not matched yet — will retry" } });
      return outcome;
    }
    await prisma.paymentWebhookEvent.update({ where: { id: row.id }, data: { processed: true, processedAt: new Date(), error: null } });
    return outcome;
  } catch (err) {
    log?.error({ err, eventId: row.providerEventId, type: evt.type }, "billing: webhook failed; it will be replayed");
    await prisma.paymentWebhookEvent.update({ where: { id: row.id }, data: { error: String(err.message || err).slice(0, 500) } }).catch(() => {});
    return "error";
  }
}

async function apply(prisma, evt, { log }) {
  if (evt.payment && evt.type.startsWith("payment.")) {
    const pp = evt.payment;
    let row = await prisma.billingPayment.findUnique({ where: { providerPaymentId: pp.id } });
    if (!row && pp.orderId) row = await prisma.billingPayment.findUnique({ where: { providerOrderId: pp.orderId } });
    if (!row && pp.notes?.purpose === "charge" && pp.notes.cycleId) {
      // A charge whose record was never written (the process stopped
      // mid-call): rebuild it from the notes we sent.
      const cycle = await prisma.billingCycle.findUnique({ where: { id: String(pp.notes.cycleId) } });
      if (cycle) {
        row = await prisma.billingPayment
          .create({
            data: { storeId: cycle.storeId, subscriptionId: cycle.subscriptionId, cycleId: cycle.id, purpose: "charge", provider: "razorpay", providerOrderId: pp.orderId, providerPaymentId: pp.id, amount: pp.amount, status: "pending", method: pp.method },
          })
          .catch(() => prisma.billingPayment.findUnique({ where: { providerPaymentId: pp.id } }));
      }
    }
    if (!row) return "ignored"; // not a billing payment of ours
    if (!row.providerPaymentId) {
      await prisma.billingPayment.update({ where: { id: row.id }, data: { providerPaymentId: pp.id } }).catch(() => {});
    }
    if (row.purpose === "mandate_setup") await mandates.recordToken(prisma, row, pp);
    await charges.applyProviderPayment(prisma, { ...row, providerPaymentId: pp.id }, pp, { log });
    return "applied";
  }
  if (evt.token) {
    const r = await mandates.onTokenEvent(prisma, evt.token, { log });
    return r === "unknown" ? "retry" : "applied";
  }
  if (evt.refund) {
    const r = await prisma.billingRefund.updateMany({ where: { providerRefundId: evt.refund.id }, data: { status: evt.refund.status } });
    return r.count ? "applied" : "ignored";
  }
  return "ignored";
}

/** Replays events that failed or couldn't be matched yet. */
async function replayFailed(prisma, { log } = {}) {
  const rows = await prisma.paymentWebhookEvent.findMany({
    where: { processed: false, attempts: { lt: 6 }, receivedAt: { lt: new Date(Date.now() - 2 * 60 * 1000) } },
    orderBy: { receivedAt: "asc" },
    take: 20,
  });
  let done = 0;
  for (const row of rows) {
    const p = PROVIDERS[row.provider];
    if (!p) continue;
    const evt = p.parseWebhook(row.payload, { "x-razorpay-event-id": row.providerEventId }, null);
    if (!evt) continue;
    const r = await processEvent(prisma, row, evt, { log });
    if (r !== "retry" && r !== "error") done += 1;
  }
  return done;
}

module.exports = { receive, replayFailed, apply };

const { env } = require("./config/env");
const { sweepAbandonedCheckouts } = require("./modules/checkout/abandoned");
const domains = require("./modules/domains/service");
const webhooksService = require("./modules/developer/webhooks");
const { cancelOrder } = require("./modules/orders/operations");
const { PROVIDER_KEYS } = require("./modules/payments/providers");
const billingEngine = require("./modules/billing/engine");

// The billing engine bills real stores, and local development shares the
// production database — so it runs only in production unless BILLING_JOBS
// says otherwise (config/env.js).
const billingJobsOn = () => (env.BILLING_JOBS ? env.BILLING_JOBS === "true" : env.NODE_ENV === "production");

/** Online orders whose payment was never completed (the shopper closed the
 * gateway's page) hold stock and any gift card money — after two hours
 * they're cancelled, which puts both back. */
async function releaseUnpaidOnlineOrders(prisma, log) {
  const stale = await prisma.order.findMany({
    where: {
      paymentStatus: "pending",
      paymentMethod: { in: PROVIDER_KEYS },
      cancelledAt: null,
      createdAt: { lt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    },
    select: { id: true, storeId: true },
    take: 25,
  });
  for (const o of stale) {
    const store = await prisma.store.findUnique({ where: { id: o.storeId } });
    await cancelOrder(prisma, store, o.id, { reason: "Payment not completed", restock: true, refund: false, notify: false }, { actorName: "Oyklane", log }).catch(
      (err) => log.warn({ err, orderId: o.id }, "jobs: couldn't release unpaid order")
    );
  }
  return stale.length;
}

/**
 * Background work that runs inside the API process on a timer — small
 * enough not to need a separate worker or queue. Every job must be safe to
 * run from several API processes at once (they claim rows atomically) and
 * must never crash the server.
 */
function startJobs(fastify) {
  if (env.JOBS_DISABLED) {
    fastify.log.info("jobs: disabled by JOBS_DISABLED");
    return () => {};
  }

  let running = false;
  async function tick() {
    if (running) return;
    running = true;
    try {
      const result = await sweepAbandonedCheckouts(fastify.prisma, {
        delayMinutes: env.ABANDONED_CHECKOUT_DELAY_MINUTES,
        log: fastify.log,
      });
      if (result.sent) fastify.log.info(result, "jobs: abandoned-checkout reminders sent");
    } catch (err) {
      fastify.log.error({ err }, "jobs: abandoned-checkout sweep failed");
    }
    try {
      const released = await releaseUnpaidOnlineOrders(fastify.prisma, fastify.log);
      if (released) fastify.log.info({ released }, "jobs: unpaid online orders released");
    } catch (err) {
      fastify.log.error({ err }, "jobs: releasing unpaid orders failed");
    }
    try {
      const result = await webhooksService.processDue(fastify.prisma);
      if (result.retried) fastify.log.info(result, "jobs: webhook retries");
    } catch (err) {
      fastify.log.error({ err }, "jobs: webhook retries failed");
    }
    if (billingJobsOn()) {
      try {
        const result = await billingEngine.tick(fastify.prisma, { log: fastify.log });
        if (result.processed || result.reminders || result.payments || result.mandates || result.webhooks) fastify.log.info(result, "jobs: billing engine");
      } catch (err) {
        fastify.log.error({ err }, "jobs: billing engine failed");
      }
    }
    try {
      const result = await domains.recheckPending(fastify.prisma);
      if (result.live) fastify.log.info(result, "jobs: custom domains went live");
    } catch (err) {
      fastify.log.error({ err }, "jobs: domain re-check failed");
    } finally {
      running = false;
    }
  }

  const first = setTimeout(tick, 30 * 1000);
  const every = setInterval(tick, env.JOBS_INTERVAL_SECONDS * 1000);
  first.unref();
  every.unref();
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}

module.exports = { startJobs };

const { env } = require("./config/env");
const { sweepAbandonedCheckouts } = require("./modules/checkout/abandoned");
const domains = require("./modules/domains/service");

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

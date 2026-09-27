const { env } = require("./config/env");
const { buildApp } = require("./app");
const { startJobs } = require("./jobs");
const { backfillFromDisk } = require("./modules/uploads/serve");
const { bootstrap: billingBootstrap } = require("./modules/billing/bootstrap");

const app = buildApp();

app
  .listen({ port: env.API_PORT, host: env.API_HOST })
  .then((address) => {
    app.log.info(`ShopCycle API listening at ${address}`);
    // Plans, billing settings and a subscription for every store — only
    // fills in what's missing (modules/billing/bootstrap.js).
    billingBootstrap(app.prisma, { log: app.log })
      .catch((err) => app.log.error({ err }, "billing bootstrap failed"))
      .finally(() => startJobs(app));
    backfillFromDisk(app.prisma, app.log).catch((err) => app.log.warn(`uploads backfill: ${err.message}`));
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });

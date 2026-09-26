const { env } = require("./config/env");
const { buildApp } = require("./app");
const { startJobs } = require("./jobs");

const app = buildApp();

app
  .listen({ port: env.API_PORT, host: env.API_HOST })
  .then((address) => {
    app.log.info(`ShopCycle API listening at ${address}`);
    startJobs(app);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });

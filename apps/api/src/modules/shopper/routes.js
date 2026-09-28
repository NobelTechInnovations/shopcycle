const controller = require("./controller");

// Public — called by the storefront server for shopper accounts, order
// status pages and checkout. Abuse limits are per shopper identity (see
// lib/throttle.js); the per-IP limits here are only a flood guard, set
// high because every shopper arrives from the storefront server's IP.
const flood = { rateLimit: { max: 600, timeWindow: "1 minute" } };

async function shopperRoutes(fastify) {
  fastify.post("/:handle/account/code", { config: flood }, controller.requestCodeHandler);
  fastify.post("/:handle/account/code/verify", { config: flood }, controller.verifyCodeHandler);
  fastify.post("/:handle/account/register", { config: flood }, controller.registerHandler);
  fastify.post("/:handle/account/password-login", { config: flood }, controller.passwordLoginHandler);
  fastify.post("/:handle/account/phone/code", { config: flood }, controller.phoneCodeHandler);
  fastify.post("/:handle/account/phone/verify", { config: flood }, controller.phoneVerifyHandler);
  fastify.post("/:handle/account/phone/complete", { config: flood }, controller.phoneCompleteHandler);
  fastify.post("/:handle/account/google/exchange", { config: flood }, controller.googleExchangeHandler);
  fastify.post("/:handle/account/password", { config: flood }, controller.setPasswordHandler);
  fastify.post("/:handle/account/profile", { config: flood }, controller.updateProfileHandler);
  fastify.post("/:handle/account/sign-out-everywhere", { config: flood }, controller.signOutEverywhereHandler);
  fastify.post("/:handle/orders/lookup", { config: flood }, controller.lookupHandler);
  fastify.post("/:handle/orders/:token/returns", { config: flood }, controller.requestReturnHandler);
  fastify.get("/:handle/orders/:token/invoice", { config: flood }, controller.invoiceHandler);
  fastify.post("/:handle/checkout/contact", { config: flood }, controller.contactHandler);
  fastify.post("/:handle/checkout/express/code", { config: flood }, controller.expressCodeHandler);
  fastify.post("/:handle/checkout/express/verify", { config: flood }, controller.expressVerifyHandler);
  fastify.post("/:handle/cart/recover", { config: flood }, controller.recoverHandler);
}

module.exports = shopperRoutes;

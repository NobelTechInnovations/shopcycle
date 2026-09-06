const controller = require("./controller");

// Public — anonymous storefront checkout, keyed by :handle like cart/*.
async function checkoutRoutes(fastify) {
  fastify.get("/:handle/checkout", controller.getHandler);
  fastify.post("/:handle/checkout", controller.placeOrderHandler);
  fastify.get("/:handle/checkout/orders/:id", controller.getOrderHandler);
  // Not nested under :handle — the order id (a globally unique cuid) plus a
  // valid Razorpay signature is the whole trust boundary here, and the
  // order itself already knows which store it belongs to.
  fastify.post("/checkout/razorpay/verify", controller.verifyHandler);
}

module.exports = checkoutRoutes;

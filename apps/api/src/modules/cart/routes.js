const controller = require("./controller");

// Public — anonymous storefront visitors, identified by an opaque cartId
// the storefront app manages as a cookie (see apps/storefront/lib/cart.js).
async function cartRoutes(fastify) {
  fastify.get("/:handle/cart", controller.getHandler);
  fastify.post("/:handle/cart/add", controller.addHandler);
  fastify.post("/:handle/cart/update", controller.updateHandler);
  fastify.post("/:handle/cart/discount", controller.applyDiscountHandler);
  fastify.post("/:handle/cart/discount/remove", controller.removeDiscountHandler);
}

module.exports = cartRoutes;

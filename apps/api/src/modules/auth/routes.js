const controller = require("./controller");

async function authRoutes(fastify) {
  fastify.post("/register", controller.registerHandler);
  fastify.post("/login", controller.loginHandler);
  fastify.post("/logout", controller.logoutHandler);
  fastify.get("/me", { preHandler: [fastify.authenticate] }, controller.meHandler);

  // Multi-store (Phase 7): listing/creating/switching only ever need to
  // know who the user is, never "the current store" — a user with no
  // current store yet is exactly who needs these.
  fastify.get("/my-stores", { preHandler: [fastify.authenticate] }, controller.myStoresHandler);
  fastify.post("/stores", { preHandler: [fastify.authenticate] }, controller.createStoreHandler);
  fastify.post("/switch-store", { preHandler: [fastify.authenticate] }, controller.switchStoreHandler);
}

module.exports = authRoutes;

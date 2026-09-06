const controller = require("./controller");

// Public — no auth. This is what apps/storefront calls to get rendered
// HTML and raw theme assets for anonymous visitors.
async function storefrontRoutes(fastify) {
  fastify.get("/resolve-domain", controller.resolveDomainHandler);
  fastify.get("/:handle/render/:template", controller.renderHandler);
  fastify.get("/:handle/assets/:themeId/*", controller.assetHandler);
}

module.exports = storefrontRoutes;

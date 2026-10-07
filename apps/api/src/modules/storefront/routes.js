const rentals = require("../rentals/service");
const rentalsNotify = require("../rentals/notify");
const { throttle } = require("../../lib/throttle");
const controller = require("./controller");
const { redirectsToDomain } = require("../../lib/storefront-url");
const service = require("./service");
const growth = require("./growth");
const reviews = require("../reviews/service");
const contact = require("../contact/service");
const shopperService = require("../shopper/service");

// Public — no auth. This is what apps/storefront calls to get rendered
// HTML and raw theme assets for anonymous visitors.
async function storefrontRoutes(fastify) {
  fastify.get("/resolve-domain", controller.resolveDomainHandler);
  // For the storefront's {handle}.<root> requests: the store's own domain,
  // once it's live — the storefront redirects there. Null otherwise.
  fastify.get("/primary-domain", async (request, reply) => {
    const handle = String(request.query.handle || "").toLowerCase().slice(0, 80);
    const store = handle ? await fastify.prisma.store.findUnique({ where: { handle }, select: { domain: true, domainVerifiedAt: true, settings: true } }) : null;
    reply.header("cache-control", "public, max-age=60");
    return { domain: store?.domain && store.domainVerifiedAt && redirectsToDomain(store) ? store.domain : null };
  });
  fastify.get("/platform-assets/:file", controller.platformAssetHandler);

  // Growth (growth.js): search engines and newsletter signups.
  fastify.get("/:handle/robots.txt", async (request, reply) => {
    const store = await service.loadStoreOrThrow(fastify.prisma, request.params.handle);
    reply.header("content-type", "text/plain; charset=utf-8").header("cache-control", "public, max-age=3600").send(growth.robotsTxt(store));
  });
  fastify.get("/:handle/sitemap.xml", async (request, reply) => {
    const store = await service.loadStoreOrThrow(fastify.prisma, request.params.handle);
    reply.header("content-type", "application/xml; charset=utf-8").header("cache-control", "public, max-age=900").send(await growth.sitemapXml(fastify.prisma, store));
  });
  fastify.post("/:handle/newsletter", { config: { rateLimit: { max: 600, timeWindow: "1 minute" } } }, async (request, reply) => {
    const store = await service.loadStoreOrThrow(fastify.prisma, request.params.handle);
    reply.send(await growth.subscribe(fastify, store, request.body));
  });
  fastify.get("/:handle/render/:template", controller.renderHandler);
  // The Contact page's form (contact/service.js): saved for the seller's
  // Customers ▸ Queries; the seller answers by email.
  fastify.post("/:handle/contact", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (request) => {
    const store = await service.loadStoreOrThrow(fastify.prisma, request.params.handle);
    const token = request.headers["x-shopper-token"];
    const customer = token ? await shopperService.customerFromToken(fastify, store, token).catch(() => null) : null;
    return contact.submit(fastify, store, request.body, { customerId: customer?.id || null, log: request.log });
  });
  // A review written on the product page (Product Reviews app).
  fastify.post("/:handle/products/:slug/reviews", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (request) => {
    const store = await service.loadStoreOrThrow(fastify.prisma, request.params.handle);
    return reviews.submit(fastify.prisma, store, request.params.slug, request.body || {});
  });
  // Rentals app, request mode: a shopper asks to rent (the storefront
  // app's /apps/rentals/request form). The seller confirms it later.
  fastify.post("/:handle/apps/rentals/request", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request) => {
    const store = await service.loadStoreOrThrow(fastify.prisma, request.params.handle);
    const body = request.body || {};
    const phone = String(body.phone || "").replace(/\D/g, "").slice(-10) || "none";
    await throttle(fastify, `rental-request:${store.id}:${phone}`, { max: 6, windowSeconds: 60 * 60, message: "You've sent a few requests already — the store will call you soon." });
    const booking = await rentals.requestBooking(fastify.prisma, store, body);
    await rentalsNotify.requestMade(fastify.prisma, store, booking, request.log).catch((err) => request.log.warn({ err }, "rentals: request emails failed"));
    return { ok: true, bookingId: booking.id, message: `Request sent! ${store.name} will call you to confirm your booking.` };
  });
  // Quick add on product cards (platform cart-drawer.js).
  fastify.get("/:handle/products/:slug/quick", async (request, reply) => {
    reply.header("cache-control", "no-store");
    return service.quickProduct(fastify.prisma, request.params.handle, request.params.slug);
  });
  fastify.get("/:handle/assets/:themeId/*", controller.assetHandler);
}

module.exports = storefrontRoutes;

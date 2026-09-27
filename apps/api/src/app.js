const Fastify = require("fastify");
const cors = require("@fastify/cors");
const helmet = require("@fastify/helmet");
const rateLimit = require("@fastify/rate-limit");
const multipart = require("@fastify/multipart");
const { ZodError } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const { env } = require("./config/env");

const prismaPlugin = require("./plugins/prisma");
const jwtAuthPlugin = require("./plugins/jwt-auth");
const redisPlugin = require("./plugins/redis");

const authRoutes = require("./modules/auth/routes");
const storeRoutes = require("./modules/stores/routes");
const dashboardRoutes = require("./modules/dashboard/routes");
const productRoutes = require("./modules/products/routes");
const collectionRoutes = require("./modules/collections/routes");
const brandRoutes = require("./modules/brands/routes");
const categoryRoutes = require("./modules/categories/routes");
const orderRoutes = require("./modules/orders/routes");
const customerRoutes = require("./modules/customers/routes");
const themeRoutes = require("./modules/themes/routes");
const storefrontRoutes = require("./modules/storefront/routes");
const cartRoutes = require("./modules/cart/routes");
const checkoutRoutes = require("./modules/checkout/routes");
const discountRoutes = require("./modules/discounts/routes");
const shippingRoutes = require("./modules/shipping/routes");
const taxRoutes = require("./modules/taxes/routes");
const pageRoutes = require("./modules/pages/routes");
const menuRoutes = require("./modules/menus/routes");
const uploadRoutes = require("./modules/uploads/routes");
const { uploadsServe } = require("./modules/uploads/serve");
const teamRoutes = require("./modules/team/routes");
const analyticsRoutes = require("./modules/analytics/routes");
const superAdminRoutes = require("./modules/super-admin/routes");
const appsRoutes = require("./modules/apps/routes");
const webhookRoutes = require("./modules/webhooks/routes");
const metaRoutes = require("./modules/meta/routes");
const metaAdsRoutes = require("./modules/meta-ads/routes");
const whatsappRoutes = require("./modules/whatsapp/routes");
const platformCustomersRoutes = require("./modules/platform-customers/routes");
const shopperRoutes = require("./modules/shopper/routes");
const { shopperGoogleRoutes } = require("./modules/shopper/google");
const blogRoutes = require("./modules/blog/routes");
const giftCardRoutes = require("./modules/gift-cards/routes");
const searchRoutes = require("./modules/search/routes");
const domainRoutes = require("./modules/domains/routes");
const paymentRoutes = require("./modules/payments/routes");
const developerAdminRoutes = require("./modules/developer/admin-routes");
const metafieldRoutes = require("./modules/metafields/routes");
const reviewRoutes = require("./modules/reviews/routes");
const publicApiRoutes = require("./modules/developer/public-routes");
const inventoryRoutes = require("./modules/inventory/routes");
const exportRoutes = require("./modules/exports/routes");
const emailLogRoutes = require("./modules/email-log/routes");
const billingRoutes = require("./modules/billing/routes");

// The browser origins allowed to call this API with credentials. Every
// shopper-facing request reaches the API server-to-server (the storefront
// app's route handlers/server actions), never from a shopper's browser, so
// stores on their own custom domains never need to be listed here.
// Browsers send Origin without a trailing slash, so a configured
// "https://superadmin.oyklane.com/" would never match.
const TRUSTED_ORIGINS = [env.ADMIN_ORIGIN, env.STOREFRONT_ORIGIN, env.SUPER_ADMIN_ORIGIN].map((o) => String(o).trim().replace(/\/+$/, ""));
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "development" ? "info" : "warn",
      transport: env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
    },
    // See TRUST_PROXY in config/env.js — needed behind Hostinger/Vercel so
    // request.ip (rate limits, audit log) is the visitor, not the proxy.
    trustProxy: env.TRUST_PROXY,
  });

  // Cross-site request forgery guard, second layer after SameSite=Lax
  // cookies (lib/session.js). A browser always sends Origin on a
  // cross-site POST/PATCH/DELETE; if it's present and isn't one of our own
  // apps, the request came from someone else's page riding the user's
  // session. Requests with no Origin (webhooks, server-to-server calls
  // from the storefront) aren't from a browser page, so aren't CSRF.
  app.addHook("onRequest", async (request, reply) => {
    if (SAFE_METHODS.has(request.method)) return;
    const origin = request.headers.origin;
    if (origin && !TRUSTED_ORIGINS.includes(origin)) {
      reply.code(403).send({ error: "Request origin not allowed" });
    }
  });

  // Security headers. The API serves JSON plus a few static files (theme
  // CSS/JS, uploaded images) that storefronts on other origins embed, so:
  // - CSP `default-src 'none'` + `sandbox`: nothing served from here ever
  //   runs script when opened directly — including any SVG uploaded before
  //   SVG uploads were blocked.
  // - Cross-Origin-Resource-Policy must be cross-origin, or browsers refuse
  //   to show product images and theme CSS on the storefront.
  app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], sandbox: [] },
    },
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });

  // Per-route limits only (global: false) — each sensitive route opts in
  // via `config.rateLimit` (see modules/auth/routes.js). A global per-IP
  // limit would throttle the storefront server itself, since every
  // shopper's page render arrives from that one server's IP. Counts are
  // in-memory per API process; the per-account lockout (lib/login-guard.js)
  // is in Redis and covers what spans processes.
  app.register(rateLimit, {
    global: false,
    // v10 throws this into setErrorHandler below, which reads `.message`.
    errorResponseBuilder: (request, context) => ({
      statusCode: 429,
      message: `Too many requests. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
    }),
  });

  // Admin and super-admin both need credentialed CORS (cookie session).
  // content-disposition is exposed so CSV downloads keep their filenames.
  app.register(cors, { origin: TRUSTED_ORIGINS, credentials: true, exposedHeaders: ["content-disposition"] });
  app.register(prismaPlugin);
  app.register(jwtAuthPlugin);
  app.register(redisPlugin);
  app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
  // Uploaded images: from the disk cache, else from the database (a new
  // deploy starts with an empty disk) — see modules/uploads/serve.js.
  app.register(uploadsServe);

  app.get("/health", async () => ({ ok: true, service: "@shopcycle/api" }));

  app.register(authRoutes, { prefix: "/api/auth" });
  app.register(storeRoutes, { prefix: "/api/store" });
  app.register(billingRoutes, { prefix: "/api/billing" });
  app.register(dashboardRoutes, { prefix: "/api/dashboard" });
  app.register(productRoutes, { prefix: "/api/products" });
  app.register(collectionRoutes, { prefix: "/api/collections" });
  app.register(brandRoutes, { prefix: "/api/brands" });
  app.register(categoryRoutes, { prefix: "/api/categories" });
  app.register(orderRoutes, { prefix: "/api/orders" });
  app.register(customerRoutes, { prefix: "/api/customers" });
  app.register(themeRoutes, { prefix: "/api/themes" });
  app.register(storefrontRoutes, { prefix: "/api/storefront" });
  app.register(cartRoutes, { prefix: "/api/storefront" });
  app.register(checkoutRoutes, { prefix: "/api/storefront" });
  app.register(shopperRoutes, { prefix: "/api/storefront" });
  app.register(shopperGoogleRoutes, { prefix: "/api/shopper" });
  app.register(inventoryRoutes, { prefix: "/api/inventory" });
  app.register(exportRoutes, { prefix: "/api/data" });
  app.register(emailLogRoutes, { prefix: "/api/email-log" });
  app.register(discountRoutes, { prefix: "/api/discounts" });
  app.register(shippingRoutes, { prefix: "/api/shipping" });
  app.register(taxRoutes, { prefix: "/api/taxes" });
  app.register(pageRoutes, { prefix: "/api/pages" });
  app.register(blogRoutes, { prefix: "/api/blog" });
  app.register(giftCardRoutes, { prefix: "/api/gift-cards" });
  app.register(searchRoutes, { prefix: "/api/search" });
  app.register(domainRoutes, { prefix: "/api/store/domain" });
  app.register(paymentRoutes, { prefix: "/api/payments" });
  app.register(developerAdminRoutes, { prefix: "/api/developer" });
  app.register(metafieldRoutes, { prefix: "/api/metafields" });
  app.register(reviewRoutes, { prefix: "/api/reviews" });
  app.register(publicApiRoutes, { prefix: "/api/v1" });
  app.register(menuRoutes, { prefix: "/api/menus" });
  app.register(uploadRoutes, { prefix: "/api/files" });
  app.register(teamRoutes, { prefix: "/api/team" });
  app.register(analyticsRoutes, { prefix: "/api/analytics" });
  app.register(superAdminRoutes, { prefix: "/api/super-admin" });
  app.register(appsRoutes, { prefix: "/api/apps" });
  app.register(webhookRoutes, { prefix: "/api/webhooks" });
  app.register(metaRoutes, { prefix: "/api/meta" });
  app.register(metaAdsRoutes, { prefix: "/api/meta-ads" });
  app.register(whatsappRoutes, { prefix: "/api/whatsapp" });
  app.register(platformCustomersRoutes, { prefix: "/api/super-admin/platform-customers" });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      reply.code(400).send({
        error: "Validation failed",
        details: error.flatten().fieldErrors,
      });
      return;
    }

    if (error instanceof HttpError) {
      reply.code(error.statusCode).send({ error: error.message, details: error.details });
      return;
    }

    // Rate-limit rejections and other deliberate 4xx from plugins carry a
    // safe, user-facing message; only true 5xx get the generic one, so
    // internal details (SQL, stack traces) never reach a client.
    const status = error.statusCode || 500;
    if (status < 500) {
      reply.code(status).send({ error: error.message });
      return;
    }
    request.log.error(error);
    reply.code(status).send({ error: "Internal server error" });
  });

  return app;
}

module.exports = { buildApp };

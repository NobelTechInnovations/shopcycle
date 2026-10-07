const service = require("./service");
const analyticsService = require("../analytics/service");
const platform = require("./platform");

async function renderHandler(request, reply) {
  const { handle, template } = request.params;
  const {
    slug,
    themeId,
    cartId,
    discountError,
    checkoutError,
    giftCardError,
    orderId,
    visitorId,
    path,
    q,
    domainMode,
    orderToken,
    loginStep,
    loginMode,
    loginEmail,
    loginPhone,
    formError,
    notice,
    sort,
    in_stock: inStock,
    price_min: priceMin,
    price_max: priceMax,
    brand,
    category,
    size,
    colour,
    variant,
    page,
    tag,
    returnTo,
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    utm_term: utmTerm,
    utm_content: utmContent,
  } = request.query;

  // `?themeId=` only ever appears when the admin's Themes page is
  // previewing a (possibly inactive) theme through the real storefront
  // route — that's the merchant testing their own site, not a visitor,
  // so it's deliberately excluded from analytics. Recorded while the page
  // renders, not after, so it adds nothing to the wait.
  const tracking = themeId
    ? null
    : analyticsService
        .trackPageView(request.server.prisma, request.server.redis, handle, {
          sessionId: visitorId,
          path: path || `/store/${handle}/${template}`,
          templateName: template,
          referrer: request.headers.referer || request.headers.referrer || null,
          utm: { source: utmSource, medium: utmMedium, campaign: utmCampaign, term: utmTerm, content: utmContent },
          userAgent: request.headers["user-agent"],
          headers: request.headers,
          fastify: request.server,
          shopperToken: request.headers["x-shopper-token"],
        })
        .catch((err) => {
          // Analytics must never break the storefront for a real visitor.
          request.log.warn({ err }, "Failed to record page view");
          return null;
        });

  const { html, cartId: resolvedCartId } = await service.renderPage(request.server.prisma, {
    handle,
    localAssets: true,
    templateName: template,
    slug,
    themeId,
    cartId,
    discountError,
    checkoutError,
    giftCardError: typeof giftCardError === "string" ? giftCardError.slice(0, 200) : undefined,
    orderId,
    searchQuery: q,
    // Set by the storefront app (see lib/render.js) when the visitor
    // reached this store through its own (sub)domain rather than the
    // internal /store/:handle preview path — every generated link should
    // then be root-relative, never leaking that internal path.
    rootless: domainMode === "1",
    // The signed-in shopper, if any — forwarded by the storefront server
    // from its HttpOnly cookie (see apps/storefront/lib/render.js).
    fastify: request.server,
    shopperToken: request.headers["x-shopper-token"],
    orderToken,
    loginStep,
    loginMode,
    loginEmail,
    loginPhone: typeof loginPhone === "string" ? loginPhone.slice(0, 24) : undefined,
    formError: typeof formError === "string" ? formError.slice(0, 300) : undefined,
    notice: typeof notice === "string" ? notice.slice(0, 300) : undefined,
    sort: typeof sort === "string" ? sort : undefined,
    inStock: inStock === "1",
    filters: Object.fromEntries(
      Object.entries({ price_min: priceMin, price_max: priceMax, brand, category, size, colour })
        .filter(([, v]) => typeof v === "string" && v)
        .map(([k, v]) => [k, v.slice(0, 500)])
    ),
    variant: typeof variant === "string" ? variant : undefined,
    page: Number(page) || 1,
    tag: typeof tag === "string" ? tag : undefined,
    returnTo: returnTo === "checkout" || returnTo === "cart" ? returnTo : undefined,
  });

  reply.header("content-type", "text/html; charset=utf-8");
  reply.header("x-cart-id", resolvedCartId);

  const sessionId = await tracking;
  if (sessionId) reply.header("x-visitor-id", sessionId);

  reply.send(html);
}

async function assetHandler(request, reply) {
  const { handle, themeId } = request.params;
  const assetPath = request.params["*"];
  const { content, contentType } = await service.getAsset(request.server.prisma, { handle, themeId, assetPath });
  reply.header("content-type", `${contentType}; charset=utf-8`);
  reply.header("cache-control", "no-cache"); // theme files change often enough in Phase 3 to not want stale caching
  reply.send(content);
}

/** The platform pages' shared CSS/JS. Versioned URLs (?v=<hash>) are
 * cached for a year; the hash changes whenever the file does. */
async function platformAssetHandler(request, reply) {
  const file = await platform.asset(request.params.file);
  if (!file) {
    reply.code(404).send({ error: "Not found" });
    return;
  }
  reply.header("content-type", `${file.contentType}; charset=utf-8`);
  reply.header("cache-control", request.query.v === file.version ? "public, max-age=31536000, immutable" : "public, max-age=300");
  reply.send(file.content);
}

async function resolveDomainHandler(request, reply) {
  const domain = String(request.query.domain || "").toLowerCase();
  const result = domain ? await service.resolveDomain(request.server.prisma, domain) : null;
  if (!result) {
    reply.code(404).send({ error: "No store is mapped to this domain" });
    return;
  }
  reply.send(result);
}

module.exports = { renderHandler, assetHandler, resolveDomainHandler, platformAssetHandler };

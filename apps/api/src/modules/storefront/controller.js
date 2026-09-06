const service = require("./service");
const analyticsService = require("../analytics/service");

async function renderHandler(request, reply) {
  const { handle, template } = request.params;
  const {
    slug,
    themeId,
    cartId,
    discountError,
    checkoutError,
    orderId,
    visitorId,
    path,
    q,
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    utm_term: utmTerm,
    utm_content: utmContent,
  } = request.query;

  const { html, cartId: resolvedCartId } = await service.renderPage(request.server.prisma, request.server.redis, {
    handle,
    templateName: template,
    slug,
    themeId,
    cartId,
    discountError,
    checkoutError,
    orderId,
    searchQuery: q,
  });

  reply.header("content-type", "text/html; charset=utf-8");
  reply.header("x-cart-id", resolvedCartId);

  // `?themeId=` only ever appears when the admin's Themes page is
  // previewing a (possibly inactive) theme through the real storefront
  // route — that's the merchant testing their own site, not a visitor,
  // so it's deliberately excluded from analytics.
  if (!themeId) {
    try {
      const sessionId = await analyticsService.trackPageView(request.server.prisma, request.server.redis, handle, {
        sessionId: visitorId,
        path: path || `/store/${handle}/${template}`,
        templateName: template,
        referrer: request.headers.referer || request.headers.referrer || null,
        utm: { source: utmSource, medium: utmMedium, campaign: utmCampaign, term: utmTerm, content: utmContent },
        userAgent: request.headers["user-agent"],
        headers: request.headers,
      });
      reply.header("x-visitor-id", sessionId);
    } catch (err) {
      // Analytics must never break the storefront for a real visitor.
      request.log.warn({ err }, "Failed to record page view");
    }
  }

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

async function resolveDomainHandler(request, reply) {
  const domain = String(request.query.domain || "").toLowerCase();
  const result = domain ? await service.resolveDomain(request.server.prisma, domain) : null;
  if (!result) {
    reply.code(404).send({ error: "No store is mapped to this domain" });
    return;
  }
  reply.send(result);
}

module.exports = { renderHandler, assetHandler, resolveDomainHandler };

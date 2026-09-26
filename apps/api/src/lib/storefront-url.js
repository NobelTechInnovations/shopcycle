const { env } = require("../config/env");

/**
 * A store's public addresses — the only place they're built, so no link
 * anywhere (emails, sitemap, admin "View store") can point at a hosting
 * provider's domain.
 *
 *   oyklaneAddress  https://{handle}.<root domain> — every store, always
 *                   (the /store/:handle path on the storefront app in local
 *                   dev, where the root domain is "localhost")
 *   storefrontBaseUrl  the store's own domain once it's live over HTTPS,
 *                   otherwise its Oyklane address
 */
function oyklaneAddress(store) {
  const root = (env.STOREFRONT_ROOT_DOMAIN || "localhost").toLowerCase();
  if (root !== "localhost") return `https://${store.handle}.${root}`;
  if (env.NODE_ENV === "production") return null; // not configured — never guess
  return `${env.STOREFRONT_ORIGIN.replace(/\/$/, "")}/store/${store.handle}`;
}

function storefrontBaseUrl(store) {
  if (store.domain && store.domainVerifiedAt) return `https://${store.domain}`;
  return oyklaneAddress(store) || "";
}

function storefrontUrl(store, path = "/") {
  return `${storefrontBaseUrl(store)}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Whether visitors to the Oyklane address are sent to the store's own
 * domain (Settings ▸ Domains; on by default, like Shopify). */
function redirectsToDomain(store) {
  const s = store.settings && typeof store.settings === "object" ? store.settings : {};
  return s.domainRedirect !== false;
}

module.exports = { oyklaneAddress, storefrontBaseUrl, storefrontUrl, redirectsToDomain };

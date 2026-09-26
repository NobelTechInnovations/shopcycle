const { env } = require("../config/env");

/**
 * A store's public web address, for links that leave the platform (order
 * emails, sign-in codes, abandoned-checkout reminders):
 *   1. its own connected domain, if it has one
 *   2. its free {handle}.<root domain> address in production
 *   3. the /store/:handle path on the storefront app in local dev, where
 *      the root domain is just "localhost"
 */
function storefrontBaseUrl(store) {
  if (store.domain) return `https://${store.domain}`;
  const root = (env.STOREFRONT_ROOT_DOMAIN || "localhost").toLowerCase();
  if (root !== "localhost") return `https://${store.handle}.${root}`;
  return `${env.STOREFRONT_ORIGIN.replace(/\/$/, "")}/store/${store.handle}`;
}

function storefrontUrl(store, path = "/") {
  return `${storefrontBaseUrl(store)}${path.startsWith("/") ? path : `/${path}`}`;
}

module.exports = { storefrontBaseUrl, storefrontUrl };

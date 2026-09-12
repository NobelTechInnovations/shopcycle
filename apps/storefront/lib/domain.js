// Shared between proxy.js (decides how to rewrite an incoming request) and
// render.js (decides whether the resulting page's links should be
// root-relative) — both need the exact same "is this host the platform
// itself, or a real store domain" answer, so it lives in one place.

// STOREFRONT_ROOT_DOMAIN is the bare domain every store's default
// subdomain hangs off of, e.g. "oyklane.com" for "{handle}.oyklane.com".
// Defaults to "localhost" so "{handle}.localhost" (which every modern
// browser/OS resolves to 127.0.0.1 with zero /etc/hosts setup) works the
// same way in local dev without any env configuration — production must
// set the real value explicitly.
export const ROOT_DOMAIN = (process.env.STOREFRONT_ROOT_DOMAIN || "localhost").toLowerCase();

// Handles no store may ever be provisioned with — each is either a
// reserved platform subdomain (store., admin., api., www., ...) or a
// non-store technical host (assets/cdn/mail/ftp) that a `{handle}.<root>`
// lookup must never resolve as if it were a real store.
export const RESERVED_HANDLES = [
  "www", "store", "admin", "api", "app", "assets", "cdn", "static",
  "mail", "smtp", "ftp", "blog", "help", "support", "status", "docs",
];

const PLATFORM_HOSTS = (process.env.STOREFRONT_PLATFORM_HOSTS || "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

function bareHost(host) {
  return (host || "").split(":")[0].toLowerCase();
}

/** True for the platform's own bare entrypoints — local dev, the apex
 * marketing domain, or any other host explicitly listed in
 * STOREFRONT_PLATFORM_HOSTS. Never true for a store's own subdomain or a
 * connected custom domain. */
export function isPlatformHost(host) {
  const hostname = bareHost(host);
  if (!hostname || hostname === "localhost" || hostname === "127.0.0.1") return true;
  if (ROOT_DOMAIN && hostname === ROOT_DOMAIN) return true; // bare apex, e.g. oyklane.com itself
  return PLATFORM_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));
}

/** If `host` is exactly `{handle}.<ROOT_DOMAIN>`, returns that handle —
 * the platform-assigned default storefront address every store gets
 * automatically (mirrors Shopify's {shop}.myshopify.com), resolved
 * locally with zero DB lookup, unlike a merchant's connected custom
 * domain which still goes through /api/storefront/resolve-domain. */
export function subdomainHandle(host) {
  const hostname = bareHost(host);
  if (!ROOT_DOMAIN || !hostname.endsWith(`.${ROOT_DOMAIN}`)) return null;
  const label = hostname.slice(0, -(ROOT_DOMAIN.length + 1));
  if (!label || label.includes(".") || RESERVED_HANDLES.includes(label)) return null;
  return label;
}

/** True whenever a visitor reached the storefront through a real store
 * address (either kind) rather than the internal /store/:handle preview
 * path — the signal render.js uses to ask the API for root-relative links. */
export function isDomainRequest(host) {
  return !isPlatformHost(host);
}

/** Builds a redirect/link target for `suffix` (e.g. "/cart") that matches
 * how the current request arrived: root-relative on a real store domain,
 * or /store/:handle-prefixed on the internal preview path. Every POST
 * handler that redirects after a mutation (add to cart, apply a discount,
 * place an order) needs this — a rendered page's links already come back
 * correct from the API (see routes.rootless in context.js), but a
 * server-built redirect Location header has to make the same call itself. */
export function storefrontPath(host, handle, suffix = "") {
  return isDomainRequest(host) ? suffix || "/" : `/store/${handle}${suffix}`;
}

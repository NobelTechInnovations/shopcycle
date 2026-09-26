const STOREFRONT_URL = process.env.NEXT_PUBLIC_STOREFRONT_URL || "http://localhost:3002";
// A bare domain; tolerates a pasted URL ("https://oyklane.com/").
const ROOT_DOMAIN =
  (process.env.NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN || "localhost")
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .split(/[/:]/)[0] || "localhost";

/** Where a store's live storefront is — the merchant's own connected domain
 * if they have one, else their free {handle}.<root> subdomain, else (local
 * dev, where wildcard subdomains aren't set up) the /store/:handle preview
 * path. Mirrors apps/storefront/lib/domain.js's routing rules. */
export function storefrontUrlFor(store) {
  if (!store) return STOREFRONT_URL;
  // The store's own domain only once it's live (Settings ▸ Domains).
  if (store.domain && store.domainVerifiedAt) return `https://${store.domain}`;
  if (ROOT_DOMAIN !== "localhost") return `https://${store.handle}.${ROOT_DOMAIN}`;
  return `${STOREFRONT_URL}/store/${store.handle}`;
}

/** Display form of the same address — no scheme, for showing to a person. */
export function storefrontLabelFor(store) {
  return storefrontUrlFor(store).replace(/^https?:\/\//, "");
}

export function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

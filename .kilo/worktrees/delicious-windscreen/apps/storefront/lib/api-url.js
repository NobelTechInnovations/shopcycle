/**
 * Where the storefront reaches the API (API_INTERNAL_URL).
 *
 * A plain-http address on a public host is upgraded to https: the API's
 * host redirects http → https, and fetch re-sends a redirected POST as a
 * GET — so add to cart, checkout and sign-in would all hit "Not Found"
 * while pages (GETs) still worked. Local and private-network addresses
 * (localhost, 10.x, *.internal such as Railway's private network) stay as
 * they are. A trailing slash is dropped so paths don't double up.
 */
const LOCAL = /^http:\/\/(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\]|[^/:]+\.internal(?::|\/|$)|[^/.:]+(?::|\/|$))/i;

export function normalizeApiUrl(raw) {
  let url = String(raw || "").trim().replace(/\/+$/, "") || "http://localhost:4100";
  if (/^http:\/\//i.test(url) && !LOCAL.test(url)) url = url.replace(/^http:/i, "https:");
  return url;
}

export const API_URL = normalizeApiUrl(process.env.API_INTERNAL_URL);

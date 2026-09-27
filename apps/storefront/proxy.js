import { NextResponse } from "next/server";
import { isPlatformHost, subdomainHandle, ROOT_DOMAIN } from "@/lib/domain";

import { API_URL } from "@/lib/api-url";

/**
 * Every store gets two ways in, resolved here with zero awareness needed
 * anywhere else in the app (every route is written against /store/:handle):
 *
 *  1. Its free address, {handle}.<root domain> (like {shop}.myshopify.com),
 *     resolved from the hostname alone. Once the store's own domain is
 *     live, this address redirects there so shoppers see one address.
 *  2. The merchant's own domain (Settings ▸ Domains), resolved via the
 *     API's /resolve-domain endpoint.
 *
 * Either way we rewrite to /store/:handle/... and tag the response with
 * x-oyklane-store, which is how the API checks a domain is really live.
 */

// Small per-instance caches so a page view doesn't cost an API call.
const TTL_MS = 60_000;
const primaryCache = new Map(); // handle → { domain, at }
const resolveCache = new Map(); // host → { handle, at }

async function cached(map, key, load) {
  const hit = map.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await load();
  map.set(key, { value, at: Date.now() });
  if (map.size > 5000) map.clear();
  return value;
}

function rewrite(request, handle, suffix) {
  const url = request.nextUrl.clone();
  url.pathname = `/store/${handle}${suffix}`;
  const response = NextResponse.rewrite(url);
  response.headers.set("x-oyklane-store", handle);
  return response;
}

export async function proxy(request) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/store/")) return NextResponse.next();

  const host = (request.headers.get("host") || "").split(":")[0].toLowerCase();
  if (isPlatformHost(host)) return NextResponse.next();

  const suffix = pathname === "/" ? "" : pathname;

  // {handle}.store.<root> was never a store address (store.<root> is the
  // admin) — old links built that way go to {handle}.<root>.
  if (ROOT_DOMAIN !== "localhost" && host.endsWith(`.store.${ROOT_DOMAIN}`)) {
    const label = host.slice(0, -`.store.${ROOT_DOMAIN}`.length);
    if (label && !label.includes(".")) {
      return NextResponse.redirect(new URL(`https://${label}.${ROOT_DOMAIN}${pathname}${request.nextUrl.search}`), 308);
    }
  }

  const handle = subdomainHandle(host);
  if (handle) {
    const primary = await cached(primaryCache, handle, async () => {
      try {
        const res = await fetch(`${API_URL}/api/storefront/primary-domain?handle=${encodeURIComponent(handle)}`, { cache: "no-store" });
        return res.ok ? (await res.json()).domain : null;
      } catch {
        return null;
      }
    }).catch(() => null);
    if (primary && primary !== host) {
      const target = new URL(`https://${primary}${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(target, 308);
    }
    return rewrite(request, handle, suffix);
  }

  const resolved = await cached(resolveCache, host, async () => {
    try {
      const res = await fetch(`${API_URL}/api/storefront/resolve-domain?domain=${encodeURIComponent(host)}`, { cache: "no-store" });
      if (!res.ok) return null;
      return (await res.json()).handle || null;
    } catch {
      return undefined; // API unreachable — don't cache the failure
    }
  });
  if (resolved === undefined) resolveCache.delete(host);
  if (!resolved) return NextResponse.next(); // no store mapped — this app's own 404
  return rewrite(request, resolved, suffix);
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};

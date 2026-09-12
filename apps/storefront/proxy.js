import { NextResponse } from "next/server";
import { isPlatformHost, subdomainHandle } from "@/lib/domain";

const API_URL = process.env.API_INTERNAL_URL || "http://localhost:4100";

/**
 * Every store gets two ways in, resolved here with zero awareness needed
 * anywhere else in the app (every route is written against /store/:handle):
 *
 *  1. Its platform-assigned default address, {handle}.<root domain> —
 *     mirrors Shopify's {shop}.myshopify.com. Resolved locally from the
 *     hostname alone (see lib/domain.js#subdomainHandle), no DB round trip.
 *  2. A merchant's own connected domain (Settings ▸ Domain) — resolved via
 *     the API's /resolve-domain endpoint (storefront/service.js#resolveDomain),
 *     since arbitrary external hosts can't be mapped to a handle by pattern.
 *
 * Either way we rewrite to /store/:handle/... and tag the request so
 * lib/render.js knows to ask the API for root-relative links — a visitor
 * on ksff34.oyklane.com should never see /store/ksff34 in their address bar.
 */
export async function proxy(request) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/store/")) return NextResponse.next();

  const host = request.headers.get("host") || "";
  if (isPlatformHost(host)) return NextResponse.next();

  const suffix = pathname === "/" ? "" : pathname;

  const handle = subdomainHandle(host);
  if (handle) {
    const url = request.nextUrl.clone();
    url.pathname = `/store/${handle}${suffix}`;
    return NextResponse.rewrite(url);
  }

  try {
    const res = await fetch(`${API_URL}/api/storefront/resolve-domain?domain=${encodeURIComponent(host.split(":")[0])}`, {
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.next(); // no store mapped — this app's own 404
    const { handle: resolvedHandle } = await res.json();
    if (!resolvedHandle) return NextResponse.next();

    const url = request.nextUrl.clone();
    url.pathname = `/store/${resolvedHandle}${suffix}`;
    return NextResponse.rewrite(url);
  } catch {
    // API unreachable — don't take the storefront down over a domain
    // lookup; just fall through to this app's normal (unmapped) behavior.
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};

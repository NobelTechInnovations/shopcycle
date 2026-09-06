import { NextResponse } from "next/server";

const API_URL = process.env.API_INTERNAL_URL || "http://localhost:4100";

// Anything that's clearly this app's own entrypoint (local dev, the bare
// deployed platform domain) skips domain resolution — paths under
// /store/:handle already say which store they mean, same as always.
function isPlatformHost(hostname) {
  return !hostname || hostname === "localhost" || hostname === "127.0.0.1";
}

/**
 * Phase 7 multi-tenant SaaS: a merchant's own domain (set in Settings >
 * Domains) rewrites transparently to /store/:handle/... here, so every
 * other route in this app (cart, checkout, product pages, ...) needs zero
 * awareness that a request arrived on a custom domain instead of the
 * platform's own /store/:handle path.
 */
export async function proxy(request) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/store/")) return NextResponse.next();

  const hostname = (request.headers.get("host") || "").split(":")[0].toLowerCase();
  if (isPlatformHost(hostname)) return NextResponse.next();

  try {
    const res = await fetch(`${API_URL}/api/storefront/resolve-domain?domain=${encodeURIComponent(hostname)}`, {
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.next();
    const { handle } = await res.json();

    const url = request.nextUrl.clone();
    url.pathname = `/store/${handle}${pathname}`;
    return NextResponse.rewrite(url);
  } catch {
    // API unreachable — fall through to the normal (likely 404) routing
    // rather than hanging the request on a proxy that can't decide.
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};

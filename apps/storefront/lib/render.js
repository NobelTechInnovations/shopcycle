import { cookies } from "next/headers";

const API_URL = process.env.API_INTERNAL_URL || "http://localhost:4100";
export const CART_COOKIE = "sc_cart_id";
const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

// Long-lived (1 year) — this cookie identifies the *session row*, not a
// stable cross-visit "customer" (see analytics/service.js's 30-minute
// staleness rule for what actually starts a new session server-side).
export const VISITOR_COOKIE = "sc_visitor_id";
const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const UTM_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

function errorPage(status, message) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${status}</title>
  <style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f6f6f7;color:#1a1a1a}
  .box{text-align:center;max-width:420px}h1{font-size:22px}p{color:#6b7280}</style></head>
  <body><div class="box"><h1>${status === 404 ? "Not found" : "Something went wrong"}</h1><p>${message}</p></div></body></html>`;
}

/** Proxies a render request to the API and forwards the storefront's
 * anonymous cart + visitor cookies both ways. This is the entire job of
 * the storefront app for GET requests — it never talks to Prisma/Redis
 * directly, only the API does (see apps/api/src/modules/storefront).
 *
 * `request`, when passed, is the original Next.js request for this page —
 * its pathname and any utm_* query params ride along so the API can
 * record an accurate page view (see analytics/service.js). It's optional
 * because a couple of callers (e.g. the discount/checkout POST redirects)
 * only ever call this for a GET they already know the path for. */
export async function proxyRender(handle, template, extraParams = {}, request = null) {
  const cookieStore = await cookies();
  const cartId = cookieStore.get(CART_COOKIE)?.value;
  const visitorId = cookieStore.get(VISITOR_COOKIE)?.value;

  const params = new URLSearchParams(extraParams);
  if (cartId) params.set("cartId", cartId);
  if (visitorId) params.set("visitorId", visitorId);
  if (request) {
    params.set("path", request.nextUrl.pathname);
    for (const key of UTM_PARAMS) {
      const value = request.nextUrl.searchParams.get(key);
      if (value) params.set(key, value);
    }
  }

  let res;
  try {
    res = await fetch(`${API_URL}/api/storefront/${handle}/render/${template}?${params}`, {
      cache: "no-store",
    });
  } catch {
    return new Response(errorPage(503, "The storefront service is unavailable right now."), {
      status: 503,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  if (!res.ok) {
    let message = "Please try again later.";
    try {
      message = (await res.json()).error || message;
    } catch {
      /* non-JSON error body — keep default message */
    }
    return new Response(errorPage(res.status, message), {
      status: res.status,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const html = await res.text();
  const newCartId = res.headers.get("x-cart-id");
  const newVisitorId = res.headers.get("x-visitor-id");
  const response = new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
  if (newCartId && newCartId !== cartId) {
    response.headers.append(
      "set-cookie",
      `${CART_COOKIE}=${newCartId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${CART_COOKIE_MAX_AGE}`
    );
  }
  if (newVisitorId && newVisitorId !== visitorId) {
    response.headers.append(
      "set-cookie",
      `${VISITOR_COOKIE}=${newVisitorId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${VISITOR_COOKIE_MAX_AGE}`
    );
  }
  return response;
}

export { API_URL };

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isDomainRequest } from "./domain";
import { oyklaneSignIn, applyOyklane, userNavigated, OYKLANE_WELCOME } from "./shopper";

import { API_URL } from "@/lib/api-url";
export const CART_COOKIE = "sc_cart_id";
const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

// Long-lived (1 year) — this cookie identifies the *session row*, not a
// stable cross-visit "customer" (see analytics/service.js's 30-minute
// staleness rule for what actually starts a new session server-side).
export const VISITOR_COOKIE = "sc_visitor_id";
const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const UTM_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

// Previewing a theme that isn't live (the admin's Themes page, the Oyklane
// Store): ?themeId=… on any page; the cookie keeps it while you click
// around, ?themeId=exit ends it. The API only renders a theme that
// belongs to this store.
const PREVIEW_COOKIE = "oy_preview_theme";
const THEME_ID = /^[a-z0-9]{10,40}$/i;

/** The bar on a previewed page, and a script that keeps the preview on
 * every link (a preview inside the Oyklane Store's frame can't rely on
 * cookies). */
function previewTags(themeId) {
  return `<div id="oy-preview-bar" style="position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:2147483646;background:#111114;color:#fff;font:600 13px/1.2 system-ui,-apple-system,sans-serif;padding:9px 10px 9px 16px;border-radius:999px;box-shadow:0 8px 28px rgba(0,0,0,.25);display:flex;gap:12px;align-items:center">Theme preview<a href="?themeId=exit" style="color:#111114;background:#fff;border-radius:999px;padding:6px 12px;text-decoration:none">Exit preview</a></div>
<script>(function(){var id=${JSON.stringify(themeId)};if(window.top!==window){var b=document.getElementById("oy-preview-bar");if(b)b.remove();}
function keep(u){try{var x=new URL(u,location.href);if(x.origin!==location.origin||x.searchParams.has("themeId"))return null;x.searchParams.set("themeId",id);return x.toString();}catch(e){return null;}}
document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[href]");if(!a||a.target==="_blank")return;var u=keep(a.getAttribute("href"));if(u)a.setAttribute("href",u);},true);
document.addEventListener("submit",function(e){var f=e.target;if(!f||f.method&&f.method.toLowerCase()!=="get")return;if(f.querySelector('input[name="themeId"]'))return;var i=document.createElement("input");i.type="hidden";i.name="themeId";i.value=id;f.appendChild(i);},true);})();</script>`;
}

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
/** Collection and search filters from the page's URL, for the API's
 * render (storefront/service.js applyListing): several ticks of one filter
 * travel joined with "|". */
export function listingParams(sp) {
  const out = {};
  for (const key of ["sort", "price_min", "price_max"]) {
    const v = sp.get(key);
    if (v) out[key] = v.slice(0, 40);
  }
  if (sp.get("in_stock") === "1") out.in_stock = "1";
  for (const key of ["brand", "category", "size", "colour"]) {
    const values = sp.getAll(key).map((v) => v.replace(/\|/g, " ").trim()).filter(Boolean).slice(0, 30);
    if (values.length) out[key] = values.join("|").slice(0, 500);
  }
  return out;
}

// Pages where opening them means the shopper wants to use their account
// here — their Oyklane account may then make one (lib/shopper.js).
const ACCOUNT_PAGES = new Set(["account", "account-login", "account-register", "checkout"]);

/** `options.oyklane`: a sign-in the caller already did (oyklaneSignIn). */
export async function proxyRender(handle, template, extraParams = {}, request = null, options = {}) {
  const cookieStore = await cookies();
  const cartId = cookieStore.get(CART_COOKIE)?.value;
  const visitorId = cookieStore.get(VISITOR_COOKIE)?.value;
  // The signed-in shopper (lib/shopper.js). Sent as a header, never in the
  // URL, so it can't end up in logs or a shared link.
  let shopperSession = cookieStore.get("sc_customer")?.value;
  // No session here yet: their Oyklane account (another Oyklane store's
  // sign-in) may sign them in.
  const oyklane = shopperSession
    ? null
    : options.oyklane !== undefined
      ? options.oyklane
      : request
        ? await oyklaneSignIn(request, handle, { create: ACCOUNT_PAGES.has(template) && userNavigated(request) })
        : null;
  if (oyklane?.token) shopperSession = oyklane.token;

  const params = new URLSearchParams(extraParams);
  let previewTheme = null;
  let previewChange = null;
  if (oyklane?.created && !params.get("notice")) params.set("notice", OYKLANE_WELCOME);
  if (cartId) params.set("cartId", cartId);
  if (visitorId) params.set("visitorId", visitorId);
  if (request) {
    params.set("path", request.nextUrl.pathname);
    // Flash messages from a form's POST/redirect/GET (newsletter signups,
    // account forms) reach whichever page the visitor lands back on.
    // Previewing an unpublished theme (Online Store ▸ Themes ▸ Preview) —
    // on any page, not just the home page. The API only renders a theme
    // that belongs to this store.
    const fromUrl = request.nextUrl.searchParams.get("themeId");
    const fromCookie = cookieStore.get(PREVIEW_COOKIE)?.value;
    previewTheme = fromUrl === "exit" ? null : THEME_ID.test(fromUrl || "") ? fromUrl : THEME_ID.test(fromCookie || "") ? fromCookie : null;
    previewChange = fromUrl === "exit" ? "exit" : fromUrl && fromUrl === previewTheme && fromUrl !== fromCookie ? "set" : null;
    params.delete("themeId");
    if (previewTheme) params.set("themeId", previewTheme);
    for (const key of ["notice", "formError"]) {
      const value = request.nextUrl.searchParams.get(key);
      if (value && !params.has(key)) params.set(key, value.slice(0, 300));
    }
    for (const key of UTM_PARAMS) {
      const value = request.nextUrl.searchParams.get(key);
      if (value) params.set(key, value);
    }
    // The Host header survives proxy.js's rewrite untouched, so this is
    // reliable even though request.nextUrl.pathname is already the
    // internal /store/:handle path by the time we see it here.
    if (isDomainRequest(request.headers.get("host"))) params.set("domainMode", "1");
  }

  let res;
  try {
    const get = () =>
      fetch(`${API_URL}/api/storefront/${handle}/render/${template}?${params}`, {
        cache: "no-store",
        headers: shopperSession ? { "x-shopper-token": shopperSession } : {},
      });
    res = await get();
    // A remembered preview whose theme is gone: back to the live theme.
    if (res.status === 404 && previewTheme && previewChange !== "set" && /theme not found/i.test((await res.clone().json().catch(() => ({}))).error || "")) {
      params.delete("themeId");
      previewTheme = null;
      previewChange = "exit";
      res = await get();
    }
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

  let html = await res.text();
  if (previewTheme && THEME_ID.test(previewTheme)) html = html.includes("</body>") ? html.replace("</body>", `${previewTags(previewTheme)}</body>`) : html + previewTags(previewTheme);
  const newCartId = res.headers.get("x-cart-id");
  const newVisitorId = res.headers.get("x-visitor-id");
  const response = new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
  if (request) applyOyklane(response, request, handle, oyklane);
  // Session cookie: a preview never outlives the browser.
  if (previewChange === "set") response.headers.append("set-cookie", `${PREVIEW_COOKIE}=${previewTheme}; Path=/; HttpOnly; SameSite=Lax`);
  if (previewChange === "exit") response.headers.append("set-cookie", `${PREVIEW_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
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

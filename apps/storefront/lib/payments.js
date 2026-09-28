import { NextResponse } from "next/server";
import { storefrontPath } from "./domain";

/** The store's base URL on the address the shopper is using right now —
 * {handle}.<root>, its own domain, or /store/:handle in local dev. */
export function storeBase(request, handle) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = (request.headers.get("x-forwarded-proto") || new URL(request.url).protocol.replace(":", "")).split(",")[0];
  return `${proto}://${host}${storefrontPath(host, handle, "")}`.replace(/\/+$/, "");
}

/** Where a One-Click checkout started (the page the popup opened on): a
 * payment that doesn't finish sends the shopper back there, with the popup
 * reopened, instead of to the full checkout page. Kept in a short-lived
 * cookie for the gateway's return; only a same-site path is accepted. */
export const ONE_CLICK_RETURN_COOKIE = "oy_ckret";

export function safeReturnPath(value) {
  const path = String(value || "");
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || path.length > 500) return null;
  if (/\/checkout(\/|$|\?)/.test(path)) return null;
  return path;
}

/** The page to send a shopper back to after a payment didn't finish:
 * `path` with the One-Click popup asked to reopen and say why. */
export function retryUrl(request, path, message) {
  const url = new URL(path, request.url);
  url.searchParams.set("oyCheckout", "retry");
  if (message) url.searchParams.set("oyError", message.slice(0, 200));
  return url;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;background:#f7f7f8;color:#111}
.box{text-align:center;padding:24px;max-width:380px}.spin{width:28px;height:28px;margin:0 auto 16px;border:3px solid #ddd;border-top-color:#111;border-radius:50%;animation:s .8s linear infinite}
@keyframes s{to{transform:rotate(360deg)}}button{margin-top:14px;padding:10px 18px;border:0;border-radius:8px;background:#111;color:#fff;font:inherit;cursor:pointer}</style></head>
<body><div class="box"><div class="spin"></div><p>Taking you to secure payment…</p>${body}</div></body></html>`;
}

/** Stops the hand-off page re-sending the shopper to the gateway when they
 * come back to it with the browser's Back button: they go to `back` (the
 * page they checked out from) instead. */
function backGuard(back, orderId) {
  const key = JSON.stringify(`oy-handoff-${orderId || ""}`);
  const to = JSON.stringify(back || "/").replace(/</g, "\\u003c");
  return `<script>(function(){var k=${key};try{if(sessionStorage.getItem(k)){window.__oyBack=1;location.replace(${to});return;}sessionStorage.setItem(k,"1");}catch(e){}
window.addEventListener("pageshow",function(e){if(e.persisted)location.replace(${to});});})();</script>`;
}

/** An HTML page that hands the shopper to a gateway that needs more than
 * a plain redirect: PayU (a signed form POST) or Cashfree (its JS SDK). */
export function gatewayHandoff(payment, { back, orderId } = {}) {
  let html;
  if (payment.kind === "form") {
    const inputs = Object.entries(payment.fields)
      .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
      .join("");
    html = page(
      "Secure payment",
      `${backGuard(back, orderId)}<form id="pay" method="post" action="${esc(payment.action)}">${inputs}<noscript><button type="submit">Continue to payment</button></noscript></form><script>if(!window.__oyBack)document.getElementById("pay").submit()</script>`
    );
  } else if (payment.kind === "cashfree") {
    html = page(
      "Secure payment",
      `${backGuard(back, orderId)}<script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script><script>
window.addEventListener("load",function(){if(window.__oyBack)return;try{Cashfree({mode:${JSON.stringify(payment.mode)}}).checkout({paymentSessionId:${JSON.stringify(payment.sessionId).replace(/</g, "\\u003c")},redirectTarget:"_self"});}catch(e){document.querySelector("p").textContent="Couldn't open the payment page. Please go back and try again.";}});
</script>`
    );
  } else {
    html = page("Payment", "<p>Unsupported payment method.</p>");
  }
  return new NextResponse(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

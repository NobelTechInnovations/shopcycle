import { NextResponse } from "next/server";
import { storefrontPath } from "./domain";

/** The store's base URL on the address the shopper is using right now —
 * {handle}.<root>, its own domain, or /store/:handle in local dev. */
export function storeBase(request, handle) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = (request.headers.get("x-forwarded-proto") || new URL(request.url).protocol.replace(":", "")).split(",")[0];
  return `${proto}://${host}${storefrontPath(host, handle, "")}`.replace(/\/+$/, "");
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;background:#f7f7f8;color:#111}
.box{text-align:center;padding:24px;max-width:380px}.spin{width:28px;height:28px;margin:0 auto 16px;border:3px solid #ddd;border-top-color:#111;border-radius:50%;animation:s .8s linear infinite}
@keyframes s{to{transform:rotate(360deg)}}button{margin-top:14px;padding:10px 18px;border:0;border-radius:8px;background:#111;color:#fff;font:inherit;cursor:pointer}</style></head>
<body><div class="box"><div class="spin"></div><p>Taking you to secure payment…</p>${body}</div></body></html>`;
}

/** An HTML page that hands the shopper to a gateway that needs more than
 * a plain redirect: PayU (a signed form POST) or Cashfree (its JS SDK). */
export function gatewayHandoff(payment) {
  let html;
  if (payment.kind === "form") {
    const inputs = Object.entries(payment.fields)
      .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
      .join("");
    html = page(
      "Secure payment",
      `<form id="pay" method="post" action="${esc(payment.action)}">${inputs}<noscript><button type="submit">Continue to payment</button></noscript></form><script>document.getElementById("pay").submit()</script>`
    );
  } else if (payment.kind === "cashfree") {
    html = page(
      "Secure payment",
      `<script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script><script>
window.addEventListener("load",function(){try{Cashfree({mode:${JSON.stringify(payment.mode)}}).checkout({paymentSessionId:${JSON.stringify(payment.sessionId).replace(/</g, "\\u003c")},redirectTarget:"_self"});}catch(e){document.querySelector("p").textContent="Couldn't open the payment page. Please go back and try again.";}});
</script>`
    );
  } else {
    html = page("Payment", "<p>Unsupported payment method.</p>");
  }
  return new NextResponse(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { API_URL, CART_COOKIE } from "@/lib/render";
import { storefrontPath } from "@/lib/domain";
import { retryUrl, safeReturnPath, ONE_CLICK_RETURN_COOKIE } from "@/lib/payments";

/**
 * Where a payment gateway sends the shopper back (GET from Stripe, PayPal
 * and Cashfree; a form POST from PayU). The API confirms the payment with
 * the gateway itself — nothing here is trusted on its own — and the
 * shopper lands on the thank-you page, or (payment not done, or cancelled
 * on the gateway: ?cancelled=1) back where they checked out from: the
 * page they opened the One-Click popup on (reopened), else checkout.
 */
async function handle(request, { params }, formParams = {}) {
  const { handle, provider } = await params;
  const sp = request.nextUrl.searchParams;
  const orderId = sp.get("order") || formParams.order || "";
  const all = { ...Object.fromEntries(sp.entries()), ...formParams };
  const cancelled = all.cancelled === "1";
  delete all.order;
  delete all.cancelled;
  const jar = await cookies();
  const oneClickFrom = safeReturnPath(jar.get(ONE_CLICK_RETURN_COOKIE)?.value);

  const host = request.headers.get("host");
  const to = (suffix, query) => {
    const url = new URL(storefrontPath(host, handle, suffix), request.url);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    return NextResponse.redirect(url, { status: 303 });
  };

  let result = null;
  try {
    const res = await fetch(`${API_URL}/api/storefront/${encodeURIComponent(handle)}/checkout/payments/${encodeURIComponent(provider)}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId, params: all, cartId: jar.get(CART_COOKIE)?.value }),
      cache: "no-store",
    });
    result = await res.json().catch(() => null);
    if (!res.ok) result = { paid: false, message: result?.error };
  } catch {
    result = { paid: false, message: "We couldn't reach the store to confirm your payment. If you were charged, contact the store." };
  }

  if (result?.paid) {
    const response = to("/checkout/confirmation", { order: orderId });
    response.cookies.set(CART_COOKIE, "", { path: "/", maxAge: 0 });
    response.cookies.set(ONE_CLICK_RETURN_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  }
  const message = cancelled
    ? "Payment was cancelled. Try again, or choose another way to pay."
    : result?.message || "Your payment wasn't completed. Try again, or choose another way to pay.";
  if (oneClickFrom) return NextResponse.redirect(retryUrl(request, oneClickFrom, message), { status: 303 });
  return to("/checkout", { checkoutError: message });
}

export async function GET(request, ctx) {
  return handle(request, ctx);
}

export async function POST(request, ctx) {
  const form = await request.formData().catch(() => null);
  const formParams = form ? Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)])) : {};
  return handle(request, ctx, formParams);
}

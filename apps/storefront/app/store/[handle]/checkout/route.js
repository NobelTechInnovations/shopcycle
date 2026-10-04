import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { proxyRender, API_URL, CART_COOKIE, VISITOR_COOKIE } from "@/lib/render";
import { storefrontPath } from "@/lib/domain";
import { shopperToken, setShopperCookie, clearCookie, PHONE_TICKET_COOKIE } from "@/lib/shopper";
import { storeBase, gatewayHandoff, safeReturnPath, retryUrl, ONE_CLICK_RETURN_COOKIE } from "@/lib/payments";

export async function GET(request, { params }) {
  const { handle } = await params;
  const sp = request.nextUrl.searchParams;
  const flash = Object.fromEntries(["checkoutError", "giftCardError"].filter((k) => sp.get(k)).map((k) => [k, sp.get(k)]));
  return proxyRender(handle, "checkout", flash, request);
}

/** Places the order server-side (never trusting anything the client could
 * have tampered with beyond what it typed into the form itself — the API
 * re-hydrates the cart from Redis/the DB to compute the real totals), then
 * either redirects straight to the confirmation page (Cash on Delivery,
 * fully settled at this point) or to the Razorpay payment page (order
 * exists server-side already, pending its online payment). */
export async function POST(request, { params }) {
  const { handle } = await params;
  const cookieStore = await cookies();
  const cartId = cookieStore.get(CART_COOKIE)?.value;
  const sessionId = cookieStore.get(VISITOR_COOKIE)?.value;

  const form = await request.formData();
  const body = {
    cartId,
    sessionId,
    email: form.get("email"),
    phone: form.get("phone") || undefined,
    // Asked for only when the store turns them on (Settings ▸ Checkout).
    company: form.get("company") || undefined,
    gstin: form.get("gstin") || undefined,
    note: form.get("note") || undefined,
    shippingName: form.get("shippingName"),
    shippingAddress1: form.get("shippingAddress1"),
    shippingAddress2: form.get("shippingAddress2") || undefined,
    shippingCity: form.get("shippingCity"),
    shippingProvince: form.get("shippingProvince"),
    shippingZip: form.get("shippingZip"),
    shippingCountry: form.get("shippingCountry"),
    // The checkout page sends "gateway:method" (e.g. "razorpay:upi"); the
    // One-Click popup sends the two separately.
    paymentMethod: String(form.get("paymentMethod") || "cod").split(":")[0],
    payMode: form.get("payMode") || String(form.get("paymentMethod") || "").split(":")[1] || undefined,
    acceptsMarketing: form.get("acceptsMarketing") === "true",
    oneClick: form.get("oneClick") === "1",
    // The popup's "number confirmed" ticket (HttpOnly cookie): the order
    // links the number to its shopper and signs them in.
    ...(form.get("oneClick") === "1" && cookieStore.get(PHONE_TICKET_COOKIE)?.value && { phoneTicket: cookieStore.get(PHONE_TICKET_COOKIE).value }),
    // Where a payment gateway sends the shopper back — the address they're
    // shopping on right now.
    returnBase: storeBase(request, handle),
  };

  const token = await shopperToken();
  const res = await fetch(`${API_URL}/api/storefront/${handle}/checkout`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token && { "x-shopper-token": token }) },
    body: JSON.stringify(body),
  });

  let result = null;
  try {
    result = await res.json();
  } catch {
    /* non-JSON error body — result stays null, generic message below */
  }

  const host = request.headers.get("host");
  // A One-Click checkout goes back to the page it started on — popup
  // reopened — whenever it doesn't finish, never to the full checkout page.
  const oneClickFrom = body.oneClick ? safeReturnPath(form.get("returnTo")) : null;
  const checkoutPath = storefrontPath(host, handle, "/checkout");

  if (!res.ok) {
    const message = result?.error || "Could not place your order. Please try again.";
    if (oneClickFrom) return NextResponse.redirect(retryUrl(request, oneClickFrom, message), { status: 303 });
    const target = new URL(checkoutPath, request.url);
    target.searchParams.set("checkoutError", message);
    return NextResponse.redirect(target, { status: 303 });
  }

  const { order, razorpay, payment, session } = result;
  const signIn = (response) => {
    if (session) {
      setShopperCookie(response, request, handle, session);
      clearCookie(response, request, handle, PHONE_TICKET_COOKIE);
    }
    return response;
  };
  const remember = (response) => {
    signIn(response);
    if (oneClickFrom) response.cookies.set(ONE_CLICK_RETURN_COOKIE, oneClickFrom, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 });
    else response.cookies.set(ONE_CLICK_RETURN_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  };

  // Gateways that take the shopper to their own page (Stripe, PayPal,
  // Cashfree, PayU). The cart stays until the payment is confirmed, so a
  // shopper who cancels comes back to a full cart.
  if (payment && payment.kind !== "razorpay") {
    return remember(
      payment.kind === "redirect"
        ? NextResponse.redirect(payment.url, { status: 303 })
        : gatewayHandoff(payment, { orderId: order.id, back: oneClickFrom ? retryUrl(request, oneClickFrom, "Payment wasn't completed.").toString() : checkoutPath })
    );
  }

  let target;
  if (razorpay) {
    target = new URL(storefrontPath(host, handle, "/checkout/pay"), request.url);
    target.searchParams.set("order", order.id);
    target.searchParams.set("rzpOrderId", razorpay.orderId);
    target.searchParams.set("amount", String(razorpay.amount));
    target.searchParams.set("key", razorpay.keyId);
    if (razorpay.method) target.searchParams.set("method", razorpay.method);
    if (oneClickFrom) target.searchParams.set("back", oneClickFrom);
    // Razorpay's window: the cart stays until the payment is verified.
    return remember(NextResponse.redirect(target, { status: 303 }));
  } else {
    target = new URL(storefrontPath(host, handle, "/checkout/confirmation"), request.url);
    target.searchParams.set("order", order.id);
  }

  const response = signIn(NextResponse.redirect(target, { status: 303 }));
  // Cash on delivery (or a gift card): the order is fully placed — the
  // cart's job is done, clear its cookie too so a shopper who navigates
  // back to the cart sees it empty rather than a cart the server has
  // already discarded.
  response.cookies.set(CART_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}

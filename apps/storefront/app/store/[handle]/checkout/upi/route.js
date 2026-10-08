import { cookies } from "next/headers";
import { proxyRender, CART_COOKIE } from "@/lib/render";
import { apiPost, redirectTo } from "@/lib/shopper";

const ORDER_ID = /^[a-z0-9]{10,40}$/i;

/** UPI QR app: the QR for an order (only for the cart paying for it). */
export async function GET(request, { params }) {
  const { handle } = await params;
  const orderId = request.nextUrl.searchParams.get("order") || "";
  if (!ORDER_ID.test(orderId)) return redirectTo(request, handle, "/checkout");
  return proxyRender(handle, "upi-pay", { orderId }, request);
}

/** "I've paid" (with the UPI reference) or "Show a new QR". */
export async function POST(request, { params }) {
  const { handle } = await params;
  const form = await request.formData();
  const orderId = String(form.get("order") || "");
  if (!ORDER_ID.test(orderId)) return redirectTo(request, handle, "/checkout");
  const cartId = (await cookies()).get(CART_COOKIE)?.value;
  const back = (extra = {}) => redirectTo(request, handle, "/checkout/upi", { order: orderId, ...extra });

  if (form.get("action") === "renew") {
    await apiPost(handle, `/checkout/upi/${orderId}/renew`, { cartId });
    return back();
  }
  const res = await apiPost(handle, `/checkout/upi/${orderId}/submit`, { cartId, utr: String(form.get("utr") || "") });
  if (!res.ok) {
    const details = res.data?.details && Object.values(res.data.details).flat().find((m) => typeof m === "string");
    return back({ formError: details || res.data?.error || "That didn't go through. Check the reference and try again." });
  }
  // The order is placed: the cart is done (as after cash on delivery).
  const response = redirectTo(request, handle, "/checkout/confirmation", { order: orderId });
  response.cookies.set(CART_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}

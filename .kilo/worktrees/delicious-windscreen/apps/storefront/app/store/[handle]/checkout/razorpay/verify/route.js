import { cookies } from "next/headers";
import { API_URL, CART_COOKIE } from "@/lib/render";

/** Called by the client-side Razorpay handler (checkout/pay/page.jsx) —
 * kept same-origin so the browser never talks to the API directly, same as
 * every other storefront mutation in this app. */
export async function POST(request) {
  const body = await request.json();
  // The cart is kept until the payment is confirmed (a cancelled payment
  // comes back to a full cart) — so the confirmation clears it.
  const cartId = (await cookies()).get(CART_COOKIE)?.value;
  const res = await fetch(`${API_URL}/api/storefront/checkout/razorpay/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, ...(cartId && { cartId }) }),
  });
  const text = await res.text();
  const response = new Response(text, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
  if (res.ok) response.headers.append("set-cookie", `${CART_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  return response;
}

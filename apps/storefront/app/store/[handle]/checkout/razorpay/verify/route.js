import { API_URL } from "@/lib/render";

/** Called by the client-side Razorpay handler (checkout/pay/page.jsx) —
 * kept same-origin so the browser never talks to the API directly, same as
 * every other storefront mutation in this app. */
export async function POST(request) {
  const body = await request.json();
  const res = await fetch(`${API_URL}/api/storefront/checkout/razorpay/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}

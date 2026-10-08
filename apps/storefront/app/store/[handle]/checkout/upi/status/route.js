import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { API_URL, CART_COOKIE } from "@/lib/render";

/** The UPI QR page's watcher: confirmed, reported, or timed out? */
export async function GET(request, { params }) {
  const { handle } = await params;
  const orderId = request.nextUrl.searchParams.get("order") || "";
  if (!/^[a-z0-9]{10,40}$/i.test(orderId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const cartId = (await cookies()).get(CART_COOKIE)?.value || "";
  try {
    const res = await fetch(`${API_URL}/api/storefront/${handle}/checkout/upi/${orderId}/status?cartId=${encodeURIComponent(cartId)}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status, headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }
}

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { API_URL, CART_COOKIE } from "@/lib/render";
import { publicCart } from "@/lib/cart-actions";

/** The visitor's cart as JSON, for the cart drawer. */
export async function GET(request, { params }) {
  const { handle } = await params;
  const cartId = (await cookies()).get(CART_COOKIE)?.value;
  if (!cartId) return NextResponse.json({ cart: { items: [], item_count: 0, subtotal: 0, total: 0 } }, { headers: { "cache-control": "no-store" } });
  try {
    const res = await fetch(`${API_URL}/api/storefront/${handle}/cart?cartId=${encodeURIComponent(cartId)}`, { cache: "no-store" });
    const body = await res.json();
    if (!res.ok) return NextResponse.json({ error: body.error || "Cart unavailable" }, { status: res.status });
    return NextResponse.json({ cart: publicCart(body.cart, request, handle) }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Cart unavailable" }, { status: 503 });
  }
}

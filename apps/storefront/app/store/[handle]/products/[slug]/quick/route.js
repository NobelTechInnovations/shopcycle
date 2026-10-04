import { NextResponse } from "next/server";
import { API_URL } from "@/lib/api-url";
import { storeImageUrl } from "@/lib/cart-actions";

/** A product's options and variants as JSON, for quick add on product cards. */
export async function GET(request, { params }) {
  const { handle, slug } = await params;
  try {
    const res = await fetch(`${API_URL}/api/storefront/${encodeURIComponent(handle)}/products/${encodeURIComponent(slug)}/quick`, { cache: "no-store" });
    const body = await res.json();
    if (!res.ok) return NextResponse.json({ error: body.error || "Product not found" }, { status: res.status });
    const host = request.headers.get("host");
    body.product.images = (body.product.images || []).map((img) => ({ ...img, url: storeImageUrl(img.url, host, handle) }));
    return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Product unavailable" }, { status: 503 });
  }
}

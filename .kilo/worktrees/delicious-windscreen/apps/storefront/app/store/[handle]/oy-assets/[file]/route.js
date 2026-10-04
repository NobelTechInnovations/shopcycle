import { passthrough } from "@/lib/passthrough";

// The platform's shared stylesheet and scripts (product, cart, checkout
// pages and the cart drawer). Versioned with ?v=, so cached for good.
export async function GET(request, { params }) {
  const { file } = await params;
  const v = request.nextUrl.searchParams.get("v");
  return passthrough(`/api/storefront/platform-assets/${encodeURIComponent(file)}${v ? `?v=${encodeURIComponent(v)}` : ""}`, { immutable: Boolean(v) });
}

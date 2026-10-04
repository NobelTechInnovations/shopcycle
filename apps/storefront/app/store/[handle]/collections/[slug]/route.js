import { proxyRender, listingParams } from "@/lib/render";

export async function GET(request, { params }) {
  const { handle, slug } = await params;
  const sp = request.nextUrl.searchParams;
  const themeId = sp.get("themeId");
  return proxyRender(handle, "collection", { slug, ...(themeId && { themeId }), ...listingParams(sp) }, request);
}

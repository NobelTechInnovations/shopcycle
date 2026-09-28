import { proxyRender, listingParams } from "@/lib/render";

export async function GET(request, { params }) {
  const { handle } = await params;
  const sp = request.nextUrl.searchParams;
  const q = sp.get("q");
  return proxyRender(handle, "search", { ...(q && { q }), ...listingParams(sp) }, request);
}

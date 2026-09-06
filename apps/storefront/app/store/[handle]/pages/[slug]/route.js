import { proxyRender } from "@/lib/render";

export async function GET(request, { params }) {
  const { handle, slug } = await params;
  const themeId = request.nextUrl.searchParams.get("themeId");
  return proxyRender(handle, "page", { slug, ...(themeId && { themeId }) }, request);
}

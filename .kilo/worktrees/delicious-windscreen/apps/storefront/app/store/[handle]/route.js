import { proxyRender } from "@/lib/render";

export async function GET(request, { params }) {
  const { handle } = await params;
  // `?themeId=` lets the admin's Themes page preview a theme that isn't
  // the store's active one, without ever touching what's live.
  const themeId = request.nextUrl.searchParams.get("themeId");
  return proxyRender(handle, "index", themeId ? { themeId } : {}, request);
}

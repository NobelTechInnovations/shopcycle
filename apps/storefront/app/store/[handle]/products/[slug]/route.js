import { proxyRender } from "@/lib/render";

export async function GET(request, { params }) {
  const { handle, slug } = await params;
  const sp = request.nextUrl.searchParams;
  const themeId = sp.get("themeId");
  return proxyRender(
    handle,
    "product",
    { slug, ...(themeId && { themeId }), ...(sp.get("variant") && { variant: sp.get("variant") }) },
    request
  );
}

import { proxyRender } from "@/lib/render";

export async function GET(request, { params }) {
  const { handle, slug } = await params;
  const sp = request.nextUrl.searchParams;
  const themeId = sp.get("themeId");
  return proxyRender(
    handle,
    "collection",
    {
      slug,
      ...(themeId && { themeId }),
      ...(sp.get("sort") && { sort: sp.get("sort") }),
      ...(sp.get("in_stock") === "1" && { in_stock: "1" }),
    },
    request
  );
}

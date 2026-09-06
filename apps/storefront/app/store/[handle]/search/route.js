import { proxyRender } from "@/lib/render";

export async function GET(request, { params }) {
  const { handle } = await params;
  const q = request.nextUrl.searchParams.get("q");
  return proxyRender(handle, "search", q ? { q } : {}, request);
}

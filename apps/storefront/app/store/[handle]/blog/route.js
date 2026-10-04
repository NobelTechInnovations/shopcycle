import { proxyRender } from "@/lib/render";

/** The store's blog: newest posts first, ?page= and ?tag= supported. */
export async function GET(request, { params }) {
  const { handle } = await params;
  const sp = request.nextUrl.searchParams;
  return proxyRender(handle, "blog", { page: sp.get("page") || "1", ...(sp.get("tag") && { tag: sp.get("tag") }) }, request);
}

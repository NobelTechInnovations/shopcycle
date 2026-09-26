import { proxyRender } from "@/lib/render";

export async function GET(request, { params }) {
  const { handle, slug } = await params;
  return proxyRender(handle, "article", { slug }, request);
}

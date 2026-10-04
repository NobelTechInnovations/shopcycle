import { passthrough } from "@/lib/passthrough";

// A theme's own CSS/JS/images (the `asset_url` filter).
export async function GET(request, { params }) {
  const { handle, themeId, path } = await params;
  const file = path.map(encodeURIComponent).join("/");
  return passthrough(`/api/storefront/${encodeURIComponent(handle)}/assets/${encodeURIComponent(themeId)}/${file}`);
}

import { passthrough } from "@/lib/passthrough";

// Uploaded images (random file names — never rewritten, cached for good).
export async function GET(request, { params }) {
  const { storeId, file } = await params;
  return passthrough(`/uploads/${encodeURIComponent(storeId)}/${encodeURIComponent(file)}`, { immutable: true });
}

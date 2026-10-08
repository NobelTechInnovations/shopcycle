import { cookies } from "next/headers";
import { API_URL, PARTNER_COOKIE } from "@/lib/config";

/** An icon or screenshot, passed on to the API with the developer's token. */
export async function POST(request) {
  const token = (await cookies()).get(PARTNER_COOKIE)?.value;
  if (!token) return Response.json({ error: "Please sign in." }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") return Response.json({ error: "Choose an image." }, { status: 400 });
  const out = new FormData();
  out.append("file", file, file.name || "image");
  const res = await fetch(`${API_URL}/api/partners/media`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: out });
  return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
}

import { cookies } from "next/headers";
import { API_URL, PARTNER_COOKIE } from "@/lib/config";

/** A new version: the theme's .zip (or an app release), to the API. */
export async function POST(request, { params }) {
  const { id } = await params;
  const token = (await cookies()).get(PARTNER_COOKIE)?.value;
  if (!token) return Response.json({ error: "Please sign in." }, { status: 401 });
  const form = await request.formData();
  const out = new FormData();
  // Fields first: the API reads them before the file.
  out.append("version", String(form.get("version") || ""));
  out.append("changelog", String(form.get("changelog") || ""));
  const file = form.get("file");
  let res;
  if (file && typeof file !== "string" && file.size > 0) {
    out.append("file", file, file.name || "theme.zip");
    res = await fetch(`${API_URL}/api/partners/listings/${encodeURIComponent(id)}/versions`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: out });
  } else {
    res = await fetch(`${API_URL}/api/partners/listings/${encodeURIComponent(id)}/versions`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ version: form.get("version"), changelog: form.get("changelog") }),
    });
  }
  return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
}

import { apiPost, visitorAllowed } from "@/lib/shopper";

/**
 * The One-Click Checkout popup's two calls, same-origin so they work on a
 * store's own domain:
 *   { action: "code",   phone }       → sends a code (or { otp: false })
 *   { action: "verify", phone, code } → { phone, name, email, addresses }
 * The API limits codes per number and per store; this adds a per-visitor
 * limit so one visitor can't spray codes at many numbers.
 */
export async function POST(request, { params }) {
  const { handle } = await params;
  let body = {};
  try {
    body = await request.json();
  } catch {
    /* ignore */
  }
  const phone = typeof body.phone === "string" ? body.phone.slice(0, 24) : "";

  if (body.action === "code") {
    if (!visitorAllowed(request, `express-code:${handle}`, { max: 6, windowMs: 10 * 60 * 1000 })) {
      return Response.json({ error: "Too many codes requested. Please wait a few minutes and try again." }, { status: 429 });
    }
    const res = await apiPost(handle, "/checkout/express/code", { phone });
    return Response.json(res.data || {}, { status: res.status });
  }
  if (body.action === "verify") {
    const code = typeof body.code === "string" ? body.code.slice(0, 12) : "";
    const res = await apiPost(handle, "/checkout/express/verify", { phone, code });
    return Response.json(res.data || {}, { status: res.status });
  }
  return Response.json({ error: "Unknown action" }, { status: 400 });
}

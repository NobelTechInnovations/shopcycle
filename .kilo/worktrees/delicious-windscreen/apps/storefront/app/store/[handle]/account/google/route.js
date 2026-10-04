import crypto from "crypto";
import { NextResponse } from "next/server";
import { API_URL } from "@/lib/render";
import { normalizeApiUrl } from "@/lib/api-url";
import { storefrontPath } from "@/lib/domain";
import { GOOGLE_NONCE_COOKIE, RETURN_TARGETS, cookieOptions } from "@/lib/shopper";

/**
 * "Continue with Google": sends the shopper to the API's Google sign-in
 * with this store's own address to come back to. The browser must visit
 * the API itself (it sets a cookie there), so this needs the API's public
 * address — API_PUBLIC_URL, else NEXT_PUBLIC_API_URL, else API_INTERNAL_URL.
 */
const PUBLIC_API = process.env.API_PUBLIC_URL || process.env.NEXT_PUBLIC_API_URL ? normalizeApiUrl(process.env.API_PUBLIC_URL || process.env.NEXT_PUBLIC_API_URL) : API_URL;

export async function GET(request, { params }) {
  const { handle } = await params;
  const path = storefrontPath(request.headers.get("host"), handle, "");
  const base = `${new URL(request.url).origin}${path === "/" ? "" : path}`;
  const nonce = crypto.randomBytes(24).toString("base64url");
  const returnTo = request.nextUrl.searchParams.get("return_to");

  const target = new URL(`${PUBLIC_API}/api/shopper/google/start`);
  target.searchParams.set("store", handle);
  target.searchParams.set("base", base);
  target.searchParams.set("sn", crypto.createHash("sha256").update(nonce).digest("hex"));
  if (RETURN_TARGETS[returnTo]) target.searchParams.set("return_to", returnTo);

  const response = NextResponse.redirect(target, { status: 303 });
  response.cookies.set(GOOGLE_NONCE_COOKIE, nonce, cookieOptions(request, handle, 10 * 60));
  return response;
}

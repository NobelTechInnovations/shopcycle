import { cookies } from "next/headers";
import { GOOGLE_NONCE_COOKIE, RETURN_TARGETS, apiPost, clearCookie, redirectTo, signedInResponse } from "@/lib/shopper";

/** Back from Google (via the API): swap the one-time ticket for a session,
 * proving with this browser's nonce that the sign-in started here. */
export async function GET(request, { params }) {
  const { handle } = await params;
  const sp = request.nextUrl.searchParams;
  const nonce = (await cookies()).get(GOOGLE_NONCE_COOKIE)?.value || "";
  const res = await apiPost(handle, "/account/google/exchange", { ticket: sp.get("ticket") || "", nonce });
  const response = res.ok && res.data?.token
    ? signedInResponse(request, handle, res.data.token, RETURN_TARGETS[sp.get("return_to")])
    : redirectTo(request, handle, "/account/login", { formError: res.data?.error || "Google sign-in didn't complete. Please try again." });
  clearCookie(response, request, handle, GOOGLE_NONCE_COOKIE);
  return response;
}

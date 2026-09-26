import { SHOPPER_COOKIE, clearCookie, redirectTo } from "@/lib/shopper";

/** Signs the shopper out of this browser. POST only, so a link or an image
 * on another site can't sign anyone out. */
export async function POST(request, { params }) {
  const { handle } = await params;
  const response = redirectTo(request, handle, "/");
  clearCookie(response, request, handle, SHOPPER_COOKIE);
  return response;
}

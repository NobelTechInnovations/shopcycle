import { cookies } from "next/headers";
import { CART_COOKIE } from "@/lib/render";
import { apiPost } from "@/lib/shopper";

/** Called by the checkout page's small helper script as the shopper types
 * their email — records who this cart belongs to, so an abandoned
 * checkout can be followed up once. Always answers 204: the shopper's
 * checkout never waits on or fails because of this. */
export async function POST(request, { params }) {
  const { handle } = await params;
  const cartId = (await cookies()).get(CART_COOKIE)?.value;
  let body = {};
  try {
    body = await request.json();
  } catch {
    /* ignore */
  }
  if (cartId && typeof body.email === "string") {
    await apiPost(handle, "/checkout/contact", { cartId, email: body.email, name: typeof body.name === "string" ? body.name : "" });
  }
  return new Response(null, { status: 204 });
}

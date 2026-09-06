import { mutateCart } from "@/lib/cart-actions";

export async function POST(request, { params }) {
  const { handle } = await params;
  return mutateCart(handle, "add", request, `/store/${handle}/cart`);
}

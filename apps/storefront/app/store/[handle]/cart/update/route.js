import { mutateCart } from "@/lib/cart-actions";

export async function POST(request, { params }) {
  const { handle } = await params;
  return mutateCart(handle, "update", request, `/store/${handle}/cart`);
}

import { mutateCartDiscount } from "@/lib/cart-actions";

export async function POST(request, { params }) {
  const { handle } = await params;
  return mutateCartDiscount(handle, "discount", request);
}

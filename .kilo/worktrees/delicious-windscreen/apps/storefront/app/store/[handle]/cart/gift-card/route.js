import { mutateCartGiftCard } from "@/lib/cart-actions";

export async function POST(request, { params }) {
  const { handle } = await params;
  return mutateCartGiftCard(handle, "gift-card", request);
}

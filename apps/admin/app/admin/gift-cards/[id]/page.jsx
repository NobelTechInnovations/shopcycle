import { serverApiFetch } from "@/lib/api";
import { GiftCardDetail } from "./GiftCardDetail";

export default async function GiftCardPage({ params }) {
  const { id } = await params;
  const [{ giftCard }, { role }] = await Promise.all([serverApiFetch(`/api/gift-cards/${id}`), serverApiFetch("/api/store")]);
  return <GiftCardDetail card={giftCard} canManage={role !== "staff"} />;
}

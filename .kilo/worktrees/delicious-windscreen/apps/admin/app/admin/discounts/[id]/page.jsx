import { serverApiFetch } from "@/lib/api";
import { DiscountForm } from "../DiscountForm";

export default async function EditDiscountPage({ params }) {
  const { id } = await params;
  const { discount } = await serverApiFetch(`/api/discounts/${id}`);
  return <DiscountForm discount={discount} />;
}

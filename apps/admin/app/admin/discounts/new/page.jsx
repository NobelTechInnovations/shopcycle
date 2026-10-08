import { DiscountForm } from "../DiscountForm";

export default async function NewDiscountPage({ searchParams }) {
  const { type } = await searchParams;
  return <DiscountForm kind={type} />;
}

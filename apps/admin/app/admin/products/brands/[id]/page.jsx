import { serverApiFetch } from "@/lib/api";
import { BrandForm } from "../BrandForm";

export default async function EditBrandPage({ params }) {
  const { id } = await params;
  const { brand } = await serverApiFetch(`/api/brands/${id}`);
  return <BrandForm brand={brand} />;
}

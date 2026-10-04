import { serverApiFetch } from "@/lib/api";
import { CategoryForm } from "../CategoryForm";

export default async function EditCategoryPage({ params }) {
  const { id } = await params;
  const { category } = await serverApiFetch(`/api/categories/${id}`);
  return <CategoryForm category={category} />;
}

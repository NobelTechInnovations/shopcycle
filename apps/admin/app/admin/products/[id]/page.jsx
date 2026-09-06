import { serverApiFetch } from "@/lib/api";
import { ProductForm } from "../ProductForm";

export default async function EditProductPage({ params }) {
  const { id } = await params;
  const { product } = await serverApiFetch(`/api/products/${id}`);
  return <ProductForm product={product} />;
}

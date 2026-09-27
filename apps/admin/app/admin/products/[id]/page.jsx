import { serverApiFetch } from "@/lib/api";
import { ProductForm } from "../ProductForm";

export default async function EditProductPage({ params }) {
  const { id } = await params;
  const [{ product }, { store }] = await Promise.all([serverApiFetch(`/api/products/${id}`), serverApiFetch("/api/store")]);
  return <ProductForm product={product} store={store} />;
}

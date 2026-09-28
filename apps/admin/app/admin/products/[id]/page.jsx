import { serverApiFetch } from "@/lib/api";
import { ProductForm } from "../ProductForm";

export default async function EditProductPage({ params, searchParams }) {
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  const [{ product }, { store }] = await Promise.all([serverApiFetch(`/api/products/${id}`), serverApiFetch("/api/store")]);
  return <ProductForm key={id} product={product} store={store} justCreated={saved === "new"} />;
}

import { serverApiFetch } from "@/lib/api";
import { ProductForm } from "../ProductForm";

export default async function NewProductPage({ searchParams }) {
  const { from } = await searchParams;
  const [{ store }, source] = await Promise.all([
    serverApiFetch("/api/store"),
    from ? serverApiFetch(`/api/products/${encodeURIComponent(from)}`).catch(() => null) : null,
  ]);
  // key: a fresh form when switching between "new" and "duplicate of…".
  return <ProductForm key={from || "new"} store={store} template={source?.product} />;
}

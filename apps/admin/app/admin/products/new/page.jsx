import { serverApiFetch } from "@/lib/api";
import { ProductForm } from "../ProductForm";

export default async function NewProductPage() {
  const { store } = await serverApiFetch("/api/store");
  return <ProductForm store={store} />;
}

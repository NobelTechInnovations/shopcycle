import { serverApiFetch } from "@/lib/api";
import { CollectionForm } from "../CollectionForm";

export default async function EditCollectionPage({ params, searchParams }) {
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  const [{ collection }, { store }] = await Promise.all([serverApiFetch(`/api/collections/${id}`), serverApiFetch("/api/store")]);
  return <CollectionForm key={id} collection={collection} store={store} justCreated={saved === "new"} />;
}

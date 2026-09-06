import { serverApiFetch } from "@/lib/api";
import { CollectionForm } from "../CollectionForm";

export default async function EditCollectionPage({ params }) {
  const { id } = await params;
  const { collection } = await serverApiFetch(`/api/collections/${id}`);
  return <CollectionForm collection={collection} />;
}

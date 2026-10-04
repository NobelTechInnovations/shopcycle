import { serverApiFetch } from "@/lib/api";
import { CollectionForm } from "../CollectionForm";

export default async function NewCollectionPage({ searchParams }) {
  const { from } = await searchParams;
  const source = from ? await serverApiFetch(`/api/collections/${encodeURIComponent(from)}`).catch(() => null) : null;
  return <CollectionForm key={from || "new"} template={source?.collection} />;
}

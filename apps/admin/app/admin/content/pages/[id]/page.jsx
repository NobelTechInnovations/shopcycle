import { serverApiFetch } from "@/lib/api";
import { PageForm } from "../PageForm";

export default async function EditPagePage({ params }) {
  const { id } = await params;
  const { page } = await serverApiFetch(`/api/pages/${id}`);
  return <PageForm page={page} />;
}

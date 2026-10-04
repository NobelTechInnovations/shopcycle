import { serverApiFetch } from "@/lib/api";
import { CustomerDetailView } from "./CustomerDetailView";

export default async function CustomerDetailPage({ params }) {
  const { id } = await params;
  const { customer } = await serverApiFetch(`/api/customers/${id}`);
  return <CustomerDetailView customer={customer} />;
}

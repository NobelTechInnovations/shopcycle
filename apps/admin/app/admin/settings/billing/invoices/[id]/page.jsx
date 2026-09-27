import { serverApiFetch } from "@/lib/api";
import { InvoiceView } from "./InvoiceView";

export default async function InvoicePage({ params }) {
  const { id } = await params;
  const { invoice } = await serverApiFetch(`/api/billing/invoices/${id}`);
  return <InvoiceView invoice={invoice} />;
}

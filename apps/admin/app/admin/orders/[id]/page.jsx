import { serverApiFetch } from "@/lib/api";
import { OrderDetailView } from "./OrderDetailView";

export default async function OrderDetailPage({ params }) {
  const { id } = await params;
  const [{ order }, me] = await Promise.all([serverApiFetch(`/api/orders/${id}`), serverApiFetch("/api/auth/me")]);
  return (
    <OrderDetailView
      order={order}
      role={me.role}
      hasGstInvoices={Boolean(me.entitlements?.features?.gst_invoices)}
    />
  );
}

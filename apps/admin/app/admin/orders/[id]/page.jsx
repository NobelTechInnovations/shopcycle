import { PageHeader, StatusBadge } from "@shopcycle/ui";
import { serverApiFetch } from "@/lib/api";
import { OrderDetailView } from "./OrderDetailView";

export default async function OrderDetailPage({ params }) {
  const { id } = await params;
  const { order } = await serverApiFetch(`/api/orders/${id}`);

  const placed = new Date(order.createdAt).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });

  return (
    <div>
      <PageHeader
        title={`Order #${order.orderNumber}`}
        backHref="/admin/orders"
        meta={
          <>
            <StatusBadge status={order.paymentStatus} />
            <StatusBadge status={order.fulfillmentStatus} />
          </>
        }
        subtitle={`Placed ${placed}`}
      />
      <OrderDetailView order={order} />
    </div>
  );
}

import Link from "next/link";
import { PageHeader } from "@shopcycle/ui";
import { serverApiFetch } from "@/lib/api";
import { OrderDetailView } from "./OrderDetailView";

export default async function OrderDetailPage({ params }) {
  const { id } = await params;
  const { order } = await serverApiFetch(`/api/orders/${id}`);

  return (
    <div>
      <PageHeader title={`Order #${order.orderNumber}`} breadcrumb={<Link href="/admin/orders">Orders</Link>} />
      <OrderDetailView order={order} />
    </div>
  );
}

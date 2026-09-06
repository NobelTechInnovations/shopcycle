"use client";

import { Card, Table } from "antd";
import { ShoppingCart } from "lucide-react";
import { PageHeader, StatusBadge, EmptyState } from "@shopcycle/ui";
import { formatCurrency } from "@shopcycle/utils";

const columns = [
  { title: "Order", dataIndex: "orderNumber", render: (n) => `#${n}` },
  { title: "Customer", render: (_, row) => row.customer?.name || "—" },
  { title: "Total", dataIndex: "total", render: (value) => formatCurrency(value) },
  { title: "Payment", dataIndex: "paymentStatus", render: (status) => <StatusBadge status={status} /> },
  {
    title: "Fulfillment",
    dataIndex: "fulfillmentStatus",
    render: (status) => <StatusBadge status={status} />,
  },
];

export function DashboardView({ data }) {
  const { stats, recentOrders, storeStatus } = data;

  return (
    <div>
      <PageHeader title="Good day" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card size="small">
          <p className="text-ink-muted text-sm m-0">Sales</p>
          <p className="text-2xl font-semibold m-0">{formatCurrency(stats.sales)}</p>
        </Card>
        <Card size="small">
          <p className="text-ink-muted text-sm m-0">Orders</p>
          <p className="text-2xl font-semibold m-0">{stats.orders}</p>
        </Card>
        <Card size="small">
          <p className="text-ink-muted text-sm m-0">Products</p>
          <p className="text-2xl font-semibold m-0">{stats.products}</p>
        </Card>
      </div>

      <Card title="Recent orders" size="small" className="mb-6">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={recentOrders}
          pagination={false}
          locale={{
            emptyText: (
              <EmptyState
                icon={<ShoppingCart size={32} strokeWidth={1.5} />}
                title="No orders yet"
                description="Orders will show up here once customers start buying."
              />
            ),
          }}
        />
      </Card>

      <Card title="Store status" size="small">
        <p className="text-sm text-ink m-0">
          Theme: <strong>{storeStatus.themeName || "None installed"}</strong>{" "}
          {storeStatus.themeActive && <StatusBadge status="live" />}
        </p>
      </Card>
    </div>
  );
}

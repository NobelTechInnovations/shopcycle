"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, Tabs, Button } from "antd";
import { Plus, ShoppingCart } from "lucide-react";
import { PageHeader, StatusBadge, EmptyState } from "@shopcycle/ui";
import { formatCurrency } from "@shopcycle/utils";
import { apiFetch } from "@/lib/api";

const TABS = [
  { key: "all", label: "All" },
  { key: "unfulfilled", label: "Unfulfilled" },
  { key: "fulfilled", label: "Fulfilled" },
  { key: "cancelled", label: "Cancelled" },
];

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status, page: String(page), pageSize: String(pageSize) });
      const data = await apiFetch(`/api/orders?${params.toString()}`);
      setOrders(data.orders);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    {
      title: "Order",
      dataIndex: "orderNumber",
      render: (n, row) => <Link href={`/admin/orders/${row.id}`}>{`#${n}`}</Link>,
    },
    { title: "Customer", render: (_, row) => row.customer?.name || "Guest" },
    { title: "Date", dataIndex: "createdAt", render: (d) => new Date(d).toLocaleDateString() },
    { title: "Total", dataIndex: "total", render: (v) => formatCurrency(v) },
    { title: "Payment", dataIndex: "paymentStatus", render: (s) => <StatusBadge status={s} /> },
    { title: "Fulfillment", dataIndex: "fulfillmentStatus", render: (s) => <StatusBadge status={s} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Orders"
        actions={
          <Link href="/admin/orders/new">
            <Button type="primary" icon={<Plus size={14} aria-hidden="true" />}>
              Create order
            </Button>
          </Link>
        }
      />

      <Tabs
        activeKey={status}
        items={TABS}
        onChange={(key) => {
          setPage(1);
          setStatus(key);
        }}
      />

      <div className="bg-app-surface border border-app-border rounded-md">
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={orders}
          pagination={{ current: page, pageSize, total, onChange: setPage, showSizeChanger: false }}
          locale={{
            emptyText: (
              <EmptyState
                icon={<ShoppingCart size={32} strokeWidth={1.5} />}
                title="No orders here"
                description="Orders placed on your storefront will show up in this list."
                actionLabel="Create order"
                onAction={() => router.push("/admin/orders/new")}
              />
            ),
          }}
        />
      </div>
    </div>
  );
}

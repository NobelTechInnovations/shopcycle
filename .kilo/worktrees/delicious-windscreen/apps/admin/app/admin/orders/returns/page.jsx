"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table } from "antd";
import { RotateCcw } from "lucide-react";
import { PageHeader, EmptyState, ListCard, StatusBadge } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

const TABS = [
  { key: "open", label: "Open" },
  { key: "all", label: "All" },
];

const NEXT_STEP = {
  requested: "Review and approve or decline",
  approved: "Waiting for the items to come back",
  received: "Refund the customer",
  closed: "Done",
  declined: "Declined",
};

function dateOnly(iso) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

/** Every return across orders. Each is handled on its order's page. */
export default function ReturnsPage() {
  const router = useRouter();
  const [tab, setTab] = useState("open");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/orders/returns?status=${tab}`);
      setRows(data.returns);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    {
      title: "Order",
      width: 110,
      render: (_, row) => (
        <Link href={`/admin/orders/${row.order.id}`} className="font-semibold text-ink hover:underline" onClick={(e) => e.stopPropagation()}>
          #{row.order.orderNumber}
        </Link>
      ),
    },
    {
      title: "Customer",
      render: (_, row) => (
        <div className="min-w-0">
          <div className="text-ink truncate">{row.order.shippingName || row.order.email}</div>
          <div className="text-xs text-ink-muted truncate">{row.reason || "No reason given"}</div>
        </div>
      ),
    },
    {
      title: "Items",
      responsive: ["sm"],
      width: 80,
      align: "right",
      render: (_, row) => <span className="tabular-nums">{(row.items || []).reduce((n, i) => n + i.quantity, 0)}</span>,
    },
    { title: "Status", width: 170, render: (_, row) => <StatusBadge status={row.status} /> },
    {
      title: "Next step",
      responsive: ["md"],
      render: (_, row) => <span className="text-[13px] text-ink-muted">{NEXT_STEP[row.status]}</span>,
    },
    {
      title: "Requested",
      responsive: ["lg"],
      width: 110,
      render: (_, row) => <span className="text-[13px] text-ink-muted">{dateOnly(row.createdAt)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader title="Returns" subtitle={loading ? " " : `${rows.length} ${tab === "open" ? "open " : ""}return${rows.length === 1 ? "" : "s"}`} />
      <ListCard tabs={TABS} activeTab={tab} onTabChange={setTab}>
        <Table
          rowKey="id"
          scroll={{ x: "max-content" }}
          loading={loading}
          columns={columns}
          dataSource={rows}
          rowClassName="oy-row-link"
          onRow={(row) => ({ onClick: () => router.push(`/admin/orders/${row.order.id}`) })}
          pagination={rows.length > 25 && { pageSize: 25, showSizeChanger: false }}
          locale={{
            emptyText: (
              <EmptyState
                icon={<RotateCcw />}
                title={tab === "open" ? "No open returns" : "No returns yet"}
                description="Customers can ask for a return from their order page within your return window (Settings ▸ Notifications). You can also open one from any order."
              />
            ),
          }}
        />
      </ListCard>
    </div>
  );
}

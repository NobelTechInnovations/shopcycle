"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Table, Button, Tooltip, App } from "antd";
import { ShoppingBag, Copy, Mail, CheckCircle2 } from "lucide-react";
import { PageHeader, EmptyState, ListCard, StatusBadge, Thumb } from "@shopcycle/ui";
import { formatCurrency } from "@shopcycle/utils";
import { apiFetch } from "@/lib/api";

function ago(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * Shoppers who reached checkout, left their email, and didn't order.
 * Each gets one reminder automatically (Settings ▸ Notifications); the
 * recovery link here can also be sent personally, e.g. on WhatsApp.
 */
export default function AbandonedCheckoutsPage() {
  const { message } = App.useApp();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/orders/abandoned?page=${page}&pageSize=${pageSize}`);
      setRows(data.checkouts);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  async function copy(url) {
    try {
      await navigator.clipboard.writeText(url);
      message.success("Recovery link copied — send it to the customer");
    } catch {
      message.error("Couldn't copy the link");
    }
  }

  const columns = [
    {
      title: "Customer",
      render: (_, row) => (
        <div className="min-w-0">
          <div className="font-medium text-ink truncate">{row.name || row.email}</div>
          {row.name && <div className="text-xs text-ink-muted truncate">{row.email}</div>}
        </div>
      ),
    },
    {
      title: "Cart",
      render: (_, row) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <Thumb src={row.items[0]?.image} icon={<ShoppingBag size={15} strokeWidth={1.75} aria-hidden="true" />} />
          <span className="text-[13px] text-ink truncate max-w-[240px]">
            {row.items[0]?.title}
            {row.items.length > 1 && <span className="text-ink-muted"> + {row.items.length - 1} more</span>}
          </span>
        </div>
      ),
    },
    {
      title: "Started",
      responsive: ["md"],
      dataIndex: "startedAt",
      width: 130,
      render: (d) => <span className="text-[13px] text-ink-muted">{ago(d)}</span>,
    },
    {
      title: "Reminder",
      responsive: ["sm"],
      width: 150,
      render: (_, row) =>
        row.recoveredAt ? (
          <StatusBadge status="active" label="Came back" />
        ) : row.reminderSentAt ? (
          <StatusBadge status="sent" label="Reminder sent" />
        ) : (
          <StatusBadge status="scheduled" label="Scheduled" />
        ),
    },
    {
      title: "Value",
      width: 120,
      align: "right",
      render: (_, row) => <span className="font-medium tabular-nums">{formatCurrency(row.subtotal)}</span>,
    },
    {
      title: "",
      width: 56,
      align: "right",
      render: (_, row) =>
        row.recoveryUrl ? (
          <Tooltip title="Copy recovery link">
            <Button type="text" size="small" icon={<Copy size={15} aria-hidden="true" />} aria-label={`Copy recovery link for ${row.email}`} onClick={() => copy(row.recoveryUrl)} />
          </Tooltip>
        ) : null,
    },
  ];

  const value = rows.reduce((sum, r) => sum + Number(r.subtotal || 0), 0);

  return (
    <div>
      <PageHeader
        title="Abandoned checkouts"
        subtitle={
          loading
            ? " "
            : total
              ? `${total} checkout${total === 1 ? "" : "s"}${page === 1 && total <= pageSize ? ` · ${formatCurrency(value)} in carts` : ""}`
              : "Shoppers who start checking out but don't finish"
        }
      />

      <div className="mb-5 flex items-start gap-3 rounded-[14px] border border-app-border bg-app-surface px-4 py-3 shadow-card">
        <Mail size={16} className="text-ink-muted mt-0.5 shrink-0" aria-hidden="true" />
        <p className="text-sm text-ink-muted m-0">
          Each shopper gets <strong className="text-ink font-medium">one reminder email</strong> an hour after leaving, with a link that restores their cart on any device.
          Change this in{" "}
          <Link href="/admin/settings/notifications" className="text-ink underline">
            Settings ▸ Notifications
          </Link>
          .
        </p>
      </div>

      <ListCard>
        <Table
          rowKey="id"
          scroll={{ x: "max-content" }}
          loading={loading}
          columns={columns}
          dataSource={rows}
          pagination={total > pageSize && { current: page, pageSize, total, onChange: setPage, showSizeChanger: false }}
          locale={{
            emptyText: (
              <EmptyState
                icon={<CheckCircle2 />}
                title="No abandoned checkouts"
                description="When a shopper enters their email at checkout and leaves without ordering, they'll show up here."
              />
            ),
          }}
        />
      </ListCard>
    </div>
  );
}

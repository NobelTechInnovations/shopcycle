"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, Button } from "antd";
import { Plus, Tag as TagIcon } from "lucide-react";
import { PageHeader, StatusBadge, EmptyState, ListCard, DeleteIconButton, useConfirmDialog } from "@shopcycle/ui";
import { formatCurrency } from "@shopcycle/utils";
import { apiFetch } from "@/lib/api";

/** What a merchant actually wants to know about a code: is it working
 * right now? A discount marked active can still be not-yet-started,
 * ended, or used up — those read as their real state, not "Active". */
function effectiveStatus(d) {
  const now = Date.now();
  if (d.status !== "active") return { status: d.status };
  if (d.startsAt && new Date(d.startsAt).getTime() > now) return { status: "scheduled" };
  if (d.endsAt && new Date(d.endsAt).getTime() < now) return { status: "expired" };
  if (d.usageLimit && d.usageCount >= d.usageLimit) return { status: "expired", label: "Used up" };
  return { status: "active" };
}

function valueLabel(d) {
  const off = d.type === "percentage" ? `${Number(d.value)}% off` : `${formatCurrency(d.value)} off`;
  return d.minSubtotal ? `${off} orders over ${formatCurrency(d.minSubtotal)}` : `${off} entire order`;
}

function datesLabel(d) {
  const fmt = (x) => new Date(x).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  if (d.startsAt && d.endsAt) return `${fmt(d.startsAt)} – ${fmt(d.endsAt)}`;
  if (d.endsAt) return `Until ${fmt(d.endsAt)}`;
  if (d.startsAt) return `From ${fmt(d.startsAt)}`;
  return "No end date";
}

function Usage({ used, limit }) {
  if (!limit) return <span className="tabular-nums text-[13px]">{used} used</span>;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="w-28">
      <div className="text-[13px] tabular-nums">
        {used} <span className="text-ink-muted">/ {limit}</span>
      </div>
      <div className="h-1 rounded-full bg-app-bg overflow-hidden mt-1" aria-hidden="true">
        <div className="h-full rounded-full bg-ink" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function DiscountsPage() {
  const router = useRouter();
  const { confirmDialog } = useConfirmDialog();
  const [discounts, setDiscounts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/discounts?page=${page}&pageSize=${pageSize}`);
      setDiscounts(data.discounts);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  function handleDelete(discount) {
    confirmDialog({
      title: `Delete "${discount.code}"?`,
      description: "Shoppers won't be able to use this code any more. This can't be undone.",
      okText: "Delete",
      danger: true,
      onConfirm: async () => {
        await apiFetch(`/api/discounts/${discount.id}`, { method: "DELETE" });
        load();
      },
    });
  }

  const columns = [
    {
      title: "Discount",
      dataIndex: "code",
      render: (code, row) => (
        <div className="min-w-0">
          <Link
            href={`/admin/discounts/${row.id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-block font-mono text-[13px] font-semibold tracking-wide text-ink bg-app-bg border border-dashed border-app-border rounded px-2 py-0.5 hover:border-ink-subtle"
          >
            {code}
          </Link>
          <div className="text-xs text-ink-muted mt-1">{valueLabel(row)}</div>
        </div>
      ),
    },
    {
      title: "Status",
      width: 130,
      render: (_, row) => {
        const s = effectiveStatus(row);
        return <StatusBadge status={s.status} label={s.label} />;
      },
    },
    { title: "Used", responsive: ["sm"], width: 150, render: (_, row) => <Usage used={row.usageCount} limit={row.usageLimit} /> },
    {
      title: "Dates",
      responsive: ["md"],
      width: 160,
      render: (_, row) => <span className="text-[13px] text-ink-muted">{datesLabel(row)}</span>,
    },
    {
      title: "",
      width: 56,
      align: "right",
      render: (_, row) => <DeleteIconButton label={`Delete ${row.code}`} onClick={() => handleDelete(row)} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Discounts"
        subtitle={loading ? " " : `${total} ${total === 1 ? "code" : "codes"} · shoppers enter these at cart`}
        actions={
          <Link href="/admin/discounts/new">
            <Button type="primary" icon={<Plus size={15} aria-hidden="true" />}>
              Create discount
            </Button>
          </Link>
        }
      />

      <ListCard>
        <Table
          rowKey="id"
          scroll={{ x: "max-content" }}
          loading={loading}
          columns={columns}
          dataSource={discounts}
          rowClassName="oy-row-link"
          onRow={(row) => ({ onClick: () => router.push(`/admin/discounts/${row.id}`) })}
          pagination={total > pageSize && { current: page, pageSize, total, onChange: setPage, showSizeChanger: false }}
          locale={{
            emptyText: (
              <EmptyState
                icon={<TagIcon />}
                title="No discounts yet"
                description="Create a code shoppers enter at cart for a percentage or fixed amount off."
                actionLabel="Create discount"
                onAction={() => router.push("/admin/discounts/new")}
              />
            ),
          }}
        />
      </ListCard>
    </div>
  );
}

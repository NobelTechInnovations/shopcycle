"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { App, Table, Button, Dropdown } from "antd";
import { Plus, Tag as TagIcon, Zap, MoreHorizontal, Copy, Pencil, Trash2, Power, Search } from "lucide-react";
import { PageHeader, StatusBadge, EmptyState, ListCard, SearchInput, useConfirmDialog } from "@shopcycle/ui";
import { formatCurrency } from "@shopcycle/utils";
import { apiFetch } from "@/lib/api";
import { summaryLines, TYPE_INFO } from "./discount-text";
import { TypePicker } from "./TypePicker";

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

function datesLabel(d) {
  const fmt = (x) => new Date(x).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  if (d.startsAt && d.endsAt) return `${fmt(d.startsAt)} – ${fmt(d.endsAt)}`;
  if (d.endsAt) return `Until ${fmt(d.endsAt)}`;
  if (d.startsAt) return `From ${fmt(d.startsAt)}`;
  return "No end date";
}

function Stat({ label, value }) {
  return (
    <div className="bg-app-surface border border-app-border rounded-[14px] shadow-card px-4 py-3 min-w-0">
      <p className="m-0 text-[12px] text-ink-muted truncate">{label}</p>
      <p className="m-0 mt-1 text-[20px] font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

export default function DiscountsPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const { confirmDialog } = useConfirmDialog();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [picking, setPicking] = useState(false);
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize), status: tab });
      if (q) qs.set("q", q);
      setData(await apiFetch(`/api/discounts?${qs}`));
    } catch (err) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, tab, q, message]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(fn, done) {
    try {
      await fn();
      if (done) message.success(done);
      load();
    } catch (err) {
      message.error(err.message);
    }
  }

  function menuFor(row) {
    return {
      items: [
        { key: "edit", icon: <Pencil size={14} aria-hidden="true" />, label: "Edit", onClick: () => router.push(`/admin/discounts/${row.id}`) },
        {
          key: "dup",
          icon: <Copy size={14} aria-hidden="true" />,
          label: "Duplicate",
          onClick: () =>
            run(async () => {
              const { discount } = await apiFetch(`/api/discounts/${row.id}/duplicate`, { method: "POST" });
              router.push(`/admin/discounts/${discount.id}`);
            }, "Copied — it's off until you turn it on"),
        },
        {
          key: "toggle",
          icon: <Power size={14} aria-hidden="true" />,
          label: row.status === "active" ? "Turn off" : "Turn on",
          onClick: () => run(() => apiFetch(`/api/discounts/${row.id}`, { method: "PATCH", body: { status: row.status === "active" ? "disabled" : "active" } }), row.status === "active" ? "Turned off" : "Turned on"),
        },
        { type: "divider" },
        {
          key: "delete",
          danger: true,
          icon: <Trash2 size={14} aria-hidden="true" />,
          label: "Delete",
          onClick: () =>
            confirmDialog({
              title: `Delete "${row.method === "automatic" ? row.title : row.code}"?`,
              description: "Shoppers can't use it any more. Past orders keep their discount. This can't be undone.",
              okText: "Delete",
              danger: true,
              onConfirm: () => run(() => apiFetch(`/api/discounts/${row.id}`, { method: "DELETE" }), "Deleted"),
            }),
        },
      ],
    };
  }

  const counts = data?.counts || {};
  const tabs = [
    { key: "all", label: "All", count: counts.all },
    { key: "active", label: "Active", count: counts.active },
    { key: "scheduled", label: "Scheduled", count: counts.scheduled },
    { key: "expired", label: "Expired", count: counts.expired },
    { key: "disabled", label: "Off", count: counts.disabled },
  ];

  const columns = [
    {
      title: "Discount",
      key: "discount",
      render: (_, row) => (
        <div className="min-w-[220px] max-w-[420px]">
          {row.method === "automatic" ? (
            <span className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink">
              <Zap size={13} className="text-[#7C5CFF]" aria-hidden="true" /> {row.title}
              <span className="text-[11px] font-medium text-ink-muted bg-app-bg rounded px-1.5 py-0.5">Automatic</span>
            </span>
          ) : (
            <span className="inline-block font-mono text-[13px] font-semibold tracking-wide text-ink bg-app-bg border border-dashed border-app-border rounded px-2 py-0.5">{row.code}</span>
          )}
          <div className="text-xs text-ink-muted mt-1 line-clamp-2">{summaryLines(row).slice(0, 2).join(" · ")}</div>
        </div>
      ),
    },
    {
      title: "Type",
      key: "type",
      responsive: ["md"],
      render: (_, row) => {
        const info = TYPE_INFO(row);
        return (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-ink whitespace-nowrap">
            <info.icon size={14} className="text-ink-muted" aria-hidden="true" /> {info.label}
          </span>
        );
      },
    },
    { title: "Status", key: "status", width: 120, render: (_, row) => <StatusBadge status={row.effectiveStatus === "disabled" ? "disabled" : row.effectiveStatus} label={row.effectiveStatus === "disabled" ? "Off" : undefined} /> },
    { title: "Used", key: "used", responsive: ["sm"], width: 140, render: (_, row) => <Usage used={row.usageCount} limit={row.usageLimit} /> },
    { title: "Dates", key: "dates", responsive: ["lg"], width: 150, render: (_, row) => <span className="text-[13px] text-ink-muted">{datesLabel(row)}</span> },
    {
      title: "",
      key: "menu",
      width: 56,
      align: "right",
      render: (_, row) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Dropdown trigger={["click"]} menu={menuFor(row)}>
            <Button size="small" type="text" icon={<MoreHorizontal size={16} aria-hidden="true" />} aria-label={`Actions for ${row.code}`} />
          </Dropdown>
        </span>
      ),
    },
  ];

  const s = data?.summary;
  return (
    <div>
      <PageHeader
        title="Discounts"
        subtitle="Codes shoppers enter, and offers that apply by themselves."
        actions={
          <Button type="primary" icon={<Plus size={15} aria-hidden="true" />} onClick={() => setPicking(true)}>
            Create discount
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <Stat label="Orders with a discount · 30 days" value={s ? s.orders30 : "—"} />
        <Stat label="Sales from those orders" value={s ? formatCurrency(s.sales30) : "—"} />
        <Stat label="Customers saved" value={s ? formatCurrency(s.saved30) : "—"} />
      </div>

      <ListCard
        tabs={tabs}
        activeTab={tab}
        onTabChange={(k) => {
          setTab(k);
          setPage(1);
        }}
        toolbar={
          <SearchInput
            placeholder="Search code or title"
            onSearch={(v) => {
              setPage(1);
              setQ(v);
            }}
          />
        }
      >
        <Table
          rowKey="id"
          scroll={{ x: "max-content" }}
          loading={loading}
          columns={columns}
          dataSource={data?.discounts || []}
          rowClassName="oy-row-link"
          onRow={(row) => ({ onClick: () => router.push(`/admin/discounts/${row.id}`) })}
          pagination={data && data.total > pageSize && { current: page, pageSize, total: data.total, onChange: setPage, showSizeChanger: false }}
          locale={{
            emptyText:
              q || tab !== "all" ? (
                <EmptyState icon={<Search />} title="Nothing here" description="Try another tab or search." />
              ) : (
                <EmptyState
                  icon={<TagIcon />}
                  title="No discounts yet"
                  description="Make a code for your next sale, a buy-2-get-1 offer, or free shipping over an amount."
                  actionLabel="Create discount"
                  onAction={() => setPicking(true)}
                />
              ),
          }}
        />
      </ListCard>

      <TypePicker open={picking} onClose={() => setPicking(false)} />
      <p className="text-[12px] text-ink-muted mt-4">
        One discount per order: a code the shopper enters replaces an automatic one. Gift cards can be used together with any discount.{" "}
        <Link href="/admin/gift-cards" className="underline">
          Gift cards
        </Link>
      </p>
    </div>
  );
}

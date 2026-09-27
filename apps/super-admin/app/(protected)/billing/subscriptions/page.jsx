"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Table, Select, Input, App } from "antd";
import { StatusBadge, useHasMounted } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { STATUS, STATUS_ORDER, day, inr } from "@/lib/billing";

export default function SubscriptionsPage() {
  return (
    <Suspense fallback={null}>
      <Subscriptions />
    </Suspense>
  );
}

function Subscriptions() {
  const mounted = useHasMounted();
  const router = useRouter();
  const params = useSearchParams();
  const { message } = App.useApp();
  const [status, setStatus] = useState(params.get("status") || undefined);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ subscriptions: [], total: 0, pageSize: 25 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), ...(status && { status }), ...(q && { q }) });
      setData(await apiFetch(`/api/super-admin/billing/subscriptions?${qs}`));
    } catch (err) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, status, q, message]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  if (!mounted) return null;

  return (
    <div className="bg-app-surface border border-app-border rounded-[14px] shadow-card">
      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-app-border">
        <Input.Search allowClear placeholder="Search stores" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="!w-64" />
        <Select
          allowClear
          placeholder="Any status"
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          options={STATUS_ORDER.map((k) => ({ value: k, label: STATUS[k].label }))}
          className="w-48"
        />
        <span className="text-xs text-ink-muted ml-auto tabular-nums">{data.total} subscriptions</span>
      </div>
      <Table
        rowKey="storeId"
        loading={loading}
        dataSource={data.subscriptions}
        scroll={{ x: 900 }}
        rowClassName="cursor-pointer"
        onRow={(r) => ({ onClick: () => router.push(`/billing/subscriptions/${r.storeId}`) })}
        pagination={{ current: page, pageSize: data.pageSize, total: data.total, onChange: setPage, showSizeChanger: false }}
        columns={[
          {
            title: "Store",
            render: (_, r) => (
              <span className="flex flex-col min-w-0">
                <Link href={`/billing/subscriptions/${r.storeId}`} className="text-sm font-medium text-ink hover:underline" onClick={(e) => e.stopPropagation()}>
                  {r.storeName}
                </Link>
                <span className="text-xs text-ink-muted truncate">{r.owner?.email || r.handle}</span>
              </span>
            ),
          },
          { title: "Status", dataIndex: "status", render: (s) => <StatusBadge status={STATUS[s]?.status} label={STATUS[s]?.label || s} /> },
          { title: "Plan", render: (_, r) => <span className="text-[13px]">{r.plan?.name} · {r.interval === "year" ? "yearly" : "monthly"}{r.promo ? ` · promo ${inr(r.promo.price)}` : ""}</span> },
          {
            title: "Next date",
            render: (_, r) => (
              <span className="text-[13px] tabular-nums">
                {r.status === "TRIALING" ? `Trial ends ${day(r.trialEndsAt)}` : r.graceEndsAt && ["GRACE_PERIOD", "EXPIRED"].includes(r.status) ? `Grace ends ${day(r.graceEndsAt)}` : day(r.nextBillingAt)}
              </span>
            ),
          },
          { title: "Autopay", render: (_, r) => <span className="text-[13px] text-ink-muted">{r.mandate ? `${r.mandate.label} (${r.mandate.status})` : "—"}</span> },
          {
            title: "Access",
            render: (_, r) => (
              <span className="text-[13px]">
                {r.access.storefront ? (r.access.dashboard ? "Open" : "Dashboard locked") : "Offline"}
                {r.accessGrantedUntil && new Date(r.accessGrantedUntil) > new Date() ? " · granted" : ""}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}

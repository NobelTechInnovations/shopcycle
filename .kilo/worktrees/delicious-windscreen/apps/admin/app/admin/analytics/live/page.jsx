"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, Badge, Tabs, Segmented, Select, Pagination, Skeleton } from "antd";
import { Radio, History, UserRound } from "lucide-react";
import { PageHeader, EmptyState } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { DEVICE_ICON, timeAgo, ContactButtons, VisitRow, CountryTag } from "@/components/visitors";

const POLL_MS = 5000;

function LiveRow({ v }) {
  const Device = DEVICE_ICON[v.deviceType] || DEVICE_ICON.unknown;
  const known = Boolean(v.customerId);
  return (
    <div className="py-3 border-t border-app-border first:border-t-0 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex items-start gap-3">
        <span className={`relative w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${known ? "bg-accent-soft text-accent" : "bg-app-bg text-ink-muted"}`}>
          {known ? <UserRound size={16} aria-hidden="true" /> : <Device size={15} aria-hidden="true" />}
          <span className="absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 rounded-full bg-status-success border-2 border-app-surface" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm m-0 font-medium text-ink">
            {known ? (
              <Link href={`/admin/customers/${v.customerId}`} className="text-ink hover:underline">
                {v.customerName || v.phone || v.email || "Signed-in shopper"}
              </Link>
            ) : (
              "Visitor (not signed in)"
            )}
          </p>
          {known && (v.phone || v.email) && (
            <p className="text-[12.5px] text-ink-muted m-0">{[v.phone, v.email].filter(Boolean).join(" · ")}</p>
          )}
          <p className="text-[12.5px] text-ink m-0 mt-0.5">
            On <b className="font-medium">{v.page?.label || v.path}</b>
            <span className="text-ink-muted">
              {" "}
              · {v.views || 1} page{(v.views || 1) === 1 ? "" : "s"} so far{v.referrer ? ` · from ${v.referrer.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}` : ""}
            </span>
          </p>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-2">
          <CountryTag country={v.country} />
          <span className="text-xs text-ink-muted w-16 text-right">{timeAgo(v.updatedAt)}</span>
        </div>
        {known && <ContactButtons phone={v.phone} email={v.email} compact />}
      </div>
    </div>
  );
}

function LiveNow({ onCount }) {
  const [visitors, setVisitors] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch("/api/analytics/live");
      setVisitors(data.visitors);
      onCount(data.visitors.length);
    } catch {
      // keep the last list; the next poll tries again
    } finally {
      setLoading(false);
    }
  }, [onCount]);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const known = visitors.filter((v) => v.customerId).length;
  return (
    <Card size="small" loading={loading}>
      {!loading && visitors.length === 0 && (
        <EmptyState
          icon={<Radio size={32} strokeWidth={1.5} aria-hidden="true" />}
          title="No one's browsing right now"
          description="This updates every few seconds. Shoppers who are signed in show their name and number, so you can call or WhatsApp them."
        />
      )}
      {!loading && visitors.length > 0 && (
        <p className="m-0 mb-1 text-[12.5px] text-ink-muted">
          {visitors.length} on your store · {known} signed in
        </p>
      )}
      {visitors.map((v) => (
        <LiveRow key={v.sessionId} v={v} />
      ))}
    </Card>
  );
}

function VisitorHistory() {
  const [range, setRange] = useState("7d");
  const [who, setWho] = useState("signed_in");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);

  useEffect(() => {
    let live = true;
    setData(null);
    apiFetch(`/api/analytics/visitors?range=${range}&who=${who}&page=${page}`)
      .then((d) => live && setData(d))
      .catch(() => live && setData({ total: 0, sessions: [], pageSize: 20 }));
    return () => {
      live = false;
    };
  }, [range, who, page]);

  return (
    <Card
      size="small"
      title={
        <div className="flex flex-wrap items-center gap-2 py-1">
          <Segmented
            size="small"
            value={who}
            onChange={(v) => {
              setWho(v);
              setPage(1);
            }}
            options={[
              { value: "signed_in", label: "Signed-in shoppers" },
              { value: "all", label: "Everyone" },
            ]}
          />
          <Select
            size="small"
            value={range}
            onChange={(v) => {
              setRange(v);
              setPage(1);
            }}
            className="w-[130px]"
            options={[
              { value: "today", label: "Today" },
              { value: "7d", label: "Last 7 days" },
              { value: "30d", label: "Last 30 days" },
              { value: "90d", label: "Last 90 days" },
            ]}
          />
        </div>
      }
    >
      {!data ? (
        <Skeleton active paragraph={{ rows: 5 }} title={false} />
      ) : data.sessions.length === 0 ? (
        <EmptyState
          icon={<History size={32} strokeWidth={1.5} aria-hidden="true" />}
          title={who === "signed_in" ? "No signed-in visits in this period" : "No visits in this period"}
          description="Every visit is saved here: what they looked at, whether they reached checkout, and — when they were signed in — their name and number to follow up."
        />
      ) : (
        <>
          <p className="m-0 mb-1 text-[12.5px] text-ink-muted">
            {data.total} visit{data.total === 1 ? "" : "s"}
          </p>
          {data.sessions.map((s) => (
            <VisitRow key={s.id} visit={s} />
          ))}
          {data.total > data.pageSize && (
            <div className="flex justify-end pt-3">
              <Pagination size="small" current={page} pageSize={data.pageSize} total={data.total} onChange={setPage} showSizeChanger={false} />
            </div>
          )}
        </>
      )}
    </Card>
  );
}

export default function LiveViewPage() {
  const [count, setCount] = useState(0);
  const [tab, setTab] = useState("live");

  return (
    <div>
      <PageHeader title="Live view" actions={<Badge status={count > 0 ? "success" : "default"} text={`${count} active now`} />} />
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: "live", label: "Live now", children: <LiveNow onCount={setCount} /> },
          { key: "history", label: "Visitor history", children: <VisitorHistory /> },
        ]}
      />
    </div>
  );
}

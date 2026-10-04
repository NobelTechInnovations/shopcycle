"use client";

import { useEffect, useState } from "react";
import { Card, Skeleton, Tooltip } from "antd";
import { ShieldCheck, ShieldAlert, ShieldQuestion, Info } from "lucide-react";
import { apiFetch } from "@/lib/api";

const LEVEL = {
  low: { icon: ShieldCheck, tone: "text-status-success bg-[#E8F7EE] border-[#BFE6CD]" },
  medium: { icon: ShieldAlert, tone: "text-[#B45309] bg-[#FFF6E5] border-[#F5D9A6]" },
  high: { icon: ShieldAlert, tone: "text-status-danger bg-[#FDECEC] border-[#F4C2C2]" },
  new: { icon: ShieldQuestion, tone: "text-ink-muted bg-app-bg border-app-border" },
};

function Stat({ label, value, warn }) {
  return (
    <div className="rounded-lg bg-app-bg px-2.5 py-2">
      <p className="m-0 text-[11px] text-ink-muted leading-tight">{label}</p>
      <p className={`m-0 text-[15px] font-semibold tabular-nums ${warn ? "text-status-danger" : "text-ink"}`}>{value}</p>
    </div>
  );
}

function Scope({ title, data }) {
  return (
    <div>
      <p className="m-0 mb-1.5 text-[12px] font-medium text-ink">{title}</p>
      <div className="grid grid-cols-2 gap-1.5">
        <Stat label="Orders" value={data.orders} />
        <Stat label="Items returned" value={data.itemsOrdered ? `${data.itemsReturned} of ${data.itemsOrdered} (${data.returnRate}%)` : "—"} warn={data.returnRate >= 30} />
        <Stat label="Cancelled" value={data.orders ? `${data.cancelled} (${data.cancelRate}%)` : "—"} warn={data.cancelRate >= 30} />
        <Stat label="Came back undelivered" value={data.orders ? data.undelivered : "—"} warn={data.undelivered >= 2} />
      </div>
    </div>
  );
}

/**
 * How this shopper buys — here and across all Oyklane stores, by phone and
 * email — with a plain verdict, so the seller can decide whether to ship.
 * `path`: /api/orders/:id/insights or /api/customers/:id/insights.
 */
export function CustomerInsightsCard({ path, title = "Customer behaviour", forOrder = false }) {
  const [data, setData] = useState(undefined);

  useEffect(() => {
    let live = true;
    apiFetch(path)
      .then((d) => live && setData(d.insights))
      .catch(() => live && setData(null));
    return () => {
      live = false;
    };
  }, [path]);

  if (data === null) return null;
  const level = data ? LEVEL[data.risk.level] || LEVEL.new : null;
  const Icon = level?.icon;

  return (
    <Card
      size="small"
      title={title}
      extra={
        <Tooltip title="Matched by phone number and email across every store on Oyklane. Other stores are only counted — never named.">
          <Info size={14} className="text-ink-subtle cursor-help" aria-label="About this" />
        </Tooltip>
      }
    >
      {!data ? (
        <Skeleton active paragraph={{ rows: 3 }} title={false} />
      ) : (
        <div className="flex flex-col gap-3">
          <div className={`flex items-start gap-2 rounded-[10px] border px-3 py-2.5 ${level.tone}`}>
            <Icon size={17} className="shrink-0 mt-[1px]" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold">{data.risk.label}</span>
              <span className="block text-[12px] text-ink-muted leading-snug">{data.risk.detail}</span>
            </span>
          </div>
          {data.allStores.orders === 0 ? (
            <p className="m-0 text-[13px] text-ink-muted">{forOrder ? "First order on Oyklane — no history yet." : "No orders on Oyklane yet."}</p>
          ) : (
            <>
              <Scope title={data.otherStores ? `All Oyklane stores · ${data.otherStores + (data.thisStore.orders ? 1 : 0)} stores` : "All orders"} data={data.allStores} />
              {data.otherStores > 0 && <Scope title="Your store" data={data.thisStore} />}
            </>
          )}
          <p className="m-0 text-[11px] text-ink-subtle">{forOrder ? "Not counting this order. " : ""}Matched by {data.matchedBy.join(" and ") || "contact details"}.</p>
        </div>
      )}
    </Card>
  );
}

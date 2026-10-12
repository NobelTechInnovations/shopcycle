"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Select, Tag, Tooltip, DatePicker, Space } from "antd";
import { apiFetch } from "@/lib/api";

export const inr = (n, d = 0) => (n == null || Number.isNaN(Number(n)) ? "—" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d })}`);
export const num = (n) => (n == null ? "—" : Number(n).toLocaleString("en-IN"));
export const pct = (n) => (n == null ? "—" : `${Number(n).toFixed(2)}%`);
export const x2 = (n) => (n == null ? "—" : `${Number(n).toFixed(2)}×`);

const PRESETS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7d", label: "Last 7 days" },
  { value: "last_14d", label: "Last 14 days" },
  { value: "last_30d", label: "Last 30 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "maximum", label: "All time" },
  { value: "custom", label: "Custom…" },
];

/** Period picker → query string for every results call. */
export function RangePicker({ value, onChange }) {
  return (
    <Space.Compact>
      <Select className="w-40" value={value.preset} options={PRESETS} onChange={(preset) => onChange(preset === "custom" ? { preset } : { preset })} aria-label="Period" />
      {value.preset === "custom" && (
        <DatePicker.RangePicker
          onChange={(d) => {
            if (d?.[0] && d?.[1]) onChange({ preset: "custom", since: d[0].format("YYYY-MM-DD"), until: d[1].format("YYYY-MM-DD") });
          }}
        />
      )}
    </Space.Compact>
  );
}
export const rangeQuery = (r) => (r.preset === "custom" && r.since ? `since=${r.since}&until=${r.until}` : `preset=${r.preset === "custom" ? "last_7d" : r.preset}`);

const STATUS_COLOR = { ACTIVE: "green", PAUSED: "default", CAMPAIGN_PAUSED: "default", ADSET_PAUSED: "default", IN_PROCESS: "blue", PENDING_REVIEW: "blue", PREAPPROVED: "blue", WITH_ISSUES: "orange", DISAPPROVED: "red", PENDING_BILLING_INFO: "orange" };
export function StatusTag({ row }) {
  const tag = (
    <Tag color={STATUS_COLOR[row.effectiveStatus] || "default"} className="!m-0">
      {row.statusLabel}
    </Tag>
  );
  const why = [row.rejection, ...(row.issues || [])].filter(Boolean).join(" ");
  return why ? <Tooltip title={why}>{tag}</Tooltip> : tag;
}

/** The main result for a row, by what it was optimising for. */
export function ResultCell({ r }) {
  if (!r) return "—";
  if (r.purchases) return (
    <span>
      {num(r.purchases)} purchase{r.purchases === 1 ? "" : "s"}
      <span className="block text-xs text-ink-muted">{inr(r.cpa)} each</span>
    </span>
  );
  if (r.chats) return (
    <span>
      {num(r.chats)} chat{r.chats === 1 ? "" : "s"}
      <span className="block text-xs text-ink-muted">{inr(r.costPerChat)} each</span>
    </span>
  );
  if (r.leads) return `${num(r.leads)} leads`;
  if (r.clicks) return (
    <span>
      {num(r.clicks)} clicks
      <span className="block text-xs text-ink-muted">{inr(r.cpc, 2)} each</span>
    </span>
  );
  return <span className="text-ink-muted">—</span>;
}

export const metricColumns = [
  { title: "Spent", key: "spend", align: "right", sorter: (a, b) => a.results.spend - b.results.spend, render: (_, r) => inr(r.results?.spend) },
  { title: "Results", key: "results", render: (_, r) => <ResultCell r={r.results} /> },
  { title: "Reach", key: "reach", align: "right", responsive: ["lg"], render: (_, r) => num(r.results?.reach) },
  { title: "Click rate", key: "ctr", align: "right", responsive: ["md"], render: (_, r) => pct(r.results?.ctr) },
  { title: "ROAS", key: "roas", align: "right", responsive: ["md"], render: (_, r) => (r.results?.revenue ? x2(r.results.roas) : "—") },
];

/** The ad account's capabilities (pages, pixels, audiences, problems) —
 * loaded once and shared by every tab. */
const CapsContext = createContext(null);
export function CapsProvider({ children }) {
  const [caps, setCaps] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    try {
      setError(null);
      setCaps(await apiFetch("/api/meta-ads/capabilities"));
    } catch (err) {
      setError(err);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return <CapsContext.Provider value={{ caps, error, reload: load }}>{children}</CapsContext.Provider>;
}
export const useCaps = () => useContext(CapsContext);

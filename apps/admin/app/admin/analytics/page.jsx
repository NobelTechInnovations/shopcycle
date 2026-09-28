"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Segmented, Skeleton } from "antd";
import { PageHeader } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { AreaChart, BarList, StatTile, formatValue } from "@/components/charts";

const RANGE_OPTIONS = [
  { label: "Today", value: "today" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "90 days", value: "90d" },
];
const PREVIOUS_LABEL = { today: "yesterday", "7d": "the previous 7 days", "30d": "the previous 30 days", "90d": "the previous 90 days" };
const DEVICE_LABEL = { desktop: "Desktop", mobile: "Mobile", tablet: "Tablet", unknown: "Unknown" };

let regionNames;
function countryName(code) {
  if (!code || code === "Unknown") return "Unknown";
  try {
    regionNames ||= new Intl.DisplayNames(["en"], { type: "region" });
    return regionNames.of(code) || code;
  } catch {
    return code;
  }
}

/** A chart card with a "Table" toggle — every chart's numbers are readable
 * without the chart. */
function ChartCard({ title, total, points, kind, label }) {
  const [table, setTable] = useState(false);
  return (
    <Card
      size="small"
      title={
        <div className="flex items-baseline gap-3">
          <span>{title}</span>
          <span className="text-ink font-semibold text-base">{formatValue(total, kind)}</span>
        </div>
      }
      extra={
        <button type="button" className="text-xs text-ink-muted hover:text-ink" onClick={() => setTable((t) => !t)}>
          {table ? "Chart" : "Table"}
        </button>
      }
    >
      {table ? (
        <div className="max-h-[220px] overflow-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-ink-muted text-left">
                <th className="font-medium py-1">Day</th>
                <th className="font-medium py-1 text-right">{label}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.date} className="border-t border-app-border">
                  <td className="py-1.5">{new Date(`${p.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</td>
                  <td className="py-1.5 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatValue(p.value, kind)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <AreaChart points={points} kind={kind} label={label} />
      )}
    </Card>
  );
}

export default function AnalyticsOverviewPage() {
  const [range, setRange] = useState("30d");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (r) => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiFetch(`/api/analytics/overview?range=${r}`));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(range);
  }, [load, range]);

  const t = data?.totals;
  const prev = data?.previous;
  const series = data?.series || [];
  const pick = (key) => series.map((d) => ({ date: d.date, value: d[key] }));
  const spark = (key) => series.map((d) => d[key]);
  const periodLabel = PREVIOUS_LABEL[range];

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle={data ? `Compared with ${periodLabel}` : undefined}
        actions={<Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} />}
      />

      {error && <p className="text-sm text-status-danger">{error}</p>}

      <div className={`grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-5 transition-opacity ${loading && data ? "opacity-60" : ""}`}>
        {!data
          ? [0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="rounded-[14px] border border-app-border bg-app-surface px-4 py-3.5">
                <Skeleton active title={false} paragraph={{ rows: 2 }} />
              </div>
            ))
          : [
              { label: "Total sales", key: "sales", kind: "currency" },
              { label: "Orders", key: "orders" },
              { label: "Average order value", key: "aov", kind: "currency", spark: false },
              { label: "Conversion rate", key: "conversionRate", kind: "percent", spark: false },
              { label: "Sessions", key: "sessions" },
              { label: "Page views", key: "pageViews" },
            ].map((m) => (
              <StatTile
                key={m.key}
                label={m.label}
                value={t[m.key]}
                previous={prev[m.key]}
                kind={m.kind}
                periodLabel={periodLabel}
                spark={m.spark === false ? null : spark(m.key)}
              />
            ))}
      </div>

      {!data ? (
        <Card size="small">
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      ) : (
        <div className={`flex flex-col gap-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2">
              <ChartCard title="Total sales over time" total={t.sales} points={pick("sales")} kind="currency" label="Sales" />
            </div>
            <Card size="small" title="Top products by sales">
              <BarList items={data.topProducts} labelKey="title" valueKey="revenue" kind="currency" empty="No sales in this period yet." />
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2">
              <ChartCard title="Sessions over time" total={t.sessions} points={pick("sessions")} label="Sessions" />
            </div>
            <Card size="small" title="Sessions by device">
              <BarList items={data.byDevice} labelKey="device" renderLabel={(i) => DEVICE_LABEL[i.device] || i.device} empty="No visits in this period yet." />
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card size="small" title="Top landing pages">
              <BarList items={data.topPaths} labelKey="path" empty="No visits in this period yet." />
            </Card>
            <Card size="small" title="Sessions by source">
              <BarList
                items={data.bySource}
                labelKey="source"
                renderLabel={(i) => `${i.source}${i.medium ? ` / ${i.medium}` : ""}`}
                empty="No visits in this period yet."
              />
            </Card>
            <Card size="small" title="Sessions by location">
              <BarList items={data.byCountry} labelKey="country" renderLabel={(i) => countryName(i.country)} empty="No visits in this period yet." />
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

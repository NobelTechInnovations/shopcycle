"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Segmented, Table } from "antd";
import { PageHeader } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { AreaChart, BarList, StatTile, formatValue } from "@/components/charts";

const RANGE_OPTIONS = [
  { label: "Today", value: "today" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "90 days", value: "90d" },
];

const num = { fontVariantNumeric: "tabular-nums" };
const dayLabel = (d) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

const salesColumns = [
  { title: "Day", dataIndex: "date", render: dayLabel },
  { title: "Orders", dataIndex: "orders", align: "right", render: (v) => <span style={num}>{formatValue(v)}</span> },
  { title: "Sales", dataIndex: "revenue", align: "right", render: (v) => <span style={num}>{formatValue(v, "currency")}</span> },
];

const productColumns = [
  { title: "Product", dataIndex: "title", ellipsis: true },
  { title: "Units sold", dataIndex: "quantity", align: "right", render: (v) => <span style={num}>{formatValue(v)}</span> },
  { title: "Sales", dataIndex: "revenue", align: "right", render: (v) => <span style={num}>{formatValue(v, "currency")}</span> },
];

export default function ReportsPage() {
  const [range, setRange] = useState("30d");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (r) => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiFetch(`/api/analytics/reports?range=${r}`));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(range);
  }, [load, range]);

  const days = data?.salesPerDay || [];
  const aov = data ? (data.totals.orders ? data.totals.revenue / data.totals.orders : 0) : null;

  return (
    <div>
      <PageHeader title="Reports" subtitle="Sales, products and traffic for the period" actions={<Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} />} />

      {error && <p className="text-sm text-status-danger">{error}</p>}

      <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5 transition-opacity ${loading && data ? "opacity-60" : ""}`}>
        <StatTile label="Total sales" value={data?.totals.revenue} kind="currency" spark={days.map((d) => d.revenue)} />
        <StatTile label="Orders" value={data?.totals.orders} spark={days.map((d) => d.orders)} />
        <StatTile label="Average order value" value={aov} kind="currency" />
      </div>

      <Card size="small" title="Sales over time" className="mb-4" loading={!data}>
        <AreaChart points={days.map((d) => ({ date: d.date, value: d.revenue }))} kind="currency" label="Sales" />
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <Card size="small" title="Sales by day" className="xl:col-span-3">
          <Table
            rowKey="date"
            size="small"
            columns={salesColumns}
            dataSource={[...days].reverse()}
            loading={loading}
            pagination={days.length > 10 ? { pageSize: 10, size: "small" } : false}
          />
        </Card>
        <div className="xl:col-span-2 flex flex-col gap-4">
          <Card size="small" title="Top products">
            <Table rowKey="title" size="small" columns={productColumns} dataSource={data?.topProducts || []} loading={loading} pagination={false} />
          </Card>
          <Card size="small" title="Sessions by source" loading={!data}>
            <BarList
              items={data?.bySource}
              labelKey="source"
              renderLabel={(item) => `${item.source}${item.medium ? ` / ${item.medium}` : ""}`}
              empty="No visits in this period yet."
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

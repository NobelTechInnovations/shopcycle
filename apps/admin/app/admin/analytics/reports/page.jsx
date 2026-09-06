"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Segmented, Table } from "antd";
import { PageHeader } from "@shopcycle/ui";
import { formatCurrency } from "@shopcycle/utils";
import { apiFetch } from "@/lib/api";
import { BarList, MiniBarChart } from "../BarList";

const RANGE_OPTIONS = [
  { label: "Today", value: "today" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "90 days", value: "90d" },
];

const salesColumns = [
  { title: "Date", dataIndex: "date", render: (d) => new Date(d).toLocaleDateString() },
  { title: "Orders", dataIndex: "orders" },
  { title: "Revenue", dataIndex: "revenue", render: (v) => formatCurrency(v) },
];

const productColumns = [
  { title: "Product", dataIndex: "title" },
  { title: "Units sold", dataIndex: "quantity" },
  { title: "Revenue", dataIndex: "revenue", render: (v) => formatCurrency(v) },
];

export default function ReportsPage() {
  const [range, setRange] = useState("30d");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (r) => {
    setLoading(true);
    try {
      const result = await apiFetch(`/api/analytics/reports?range=${r}`);
      setData(result);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(range);
  }, [load, range]);

  return (
    <div>
      <PageHeader title="Reports" actions={<Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} />} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <Card size="small" loading={loading}>
          <p className="text-ink-muted text-sm m-0">Revenue</p>
          <p className="text-2xl font-semibold m-0">{data ? formatCurrency(data.totals.revenue) : "—"}</p>
        </Card>
        <Card size="small" loading={loading}>
          <p className="text-ink-muted text-sm m-0">Orders</p>
          <p className="text-2xl font-semibold m-0">{data?.totals.orders ?? "—"}</p>
        </Card>
      </div>

      <Card size="small" title="Sales over time" className="mb-4" loading={loading}>
        {data && <MiniBarChart series={data.salesPerDay.map((d) => ({ date: d.date, count: d.revenue }))} height={80} />}
      </Card>

      <Card size="small" title="Sales by day" className="mb-4">
        <Table
          rowKey="date"
          size="small"
          columns={salesColumns}
          dataSource={data?.salesPerDay || []}
          loading={loading}
          pagination={false}
        />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card size="small" title="Top products by revenue">
          <Table
            rowKey="title"
            size="small"
            columns={productColumns}
            dataSource={data?.topProducts || []}
            loading={loading}
            pagination={false}
          />
        </Card>
        <Card size="small" title="Traffic by source" loading={loading}>
          {data && (
            <BarList
              items={data.bySource}
              labelKey="source"
              valueKey="count"
              renderLabel={(item) => `${item.source}${item.medium ? ` / ${item.medium}` : ""}`}
            />
          )}
        </Card>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Segmented } from "antd";
import { PageHeader } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { BarList, MiniBarChart } from "./BarList";

const RANGE_OPTIONS = [
  { label: "Today", value: "today" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "90 days", value: "90d" },
];

export default function AnalyticsOverviewPage() {
  const [range, setRange] = useState("7d");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (r) => {
    setLoading(true);
    try {
      const result = await apiFetch(`/api/analytics/overview?range=${r}`);
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
      <PageHeader
        title="Analytics overview"
        actions={<Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} />}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <Card size="small" loading={loading}>
          <p className="text-ink-muted text-sm m-0">Sessions</p>
          <p className="text-2xl font-semibold m-0">{data?.totals.sessions ?? "—"}</p>
        </Card>
        <Card size="small" loading={loading}>
          <p className="text-ink-muted text-sm m-0">Page views</p>
          <p className="text-2xl font-semibold m-0">{data?.totals.pageViews ?? "—"}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card size="small" title="Sessions per day" loading={loading}>
          {data && <MiniBarChart series={data.sessionsPerDay} />}
        </Card>
        <Card size="small" title="Page views per day" loading={loading}>
          {data && <MiniBarChart series={data.pageViewsPerDay} />}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card size="small" title="Top pages" loading={loading}>
          {data && <BarList items={data.topPaths} labelKey="path" valueKey="count" />}
        </Card>
        <Card size="small" title="Traffic sources" loading={loading}>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card size="small" title="Countries" loading={loading}>
          {data && <BarList items={data.byCountry} labelKey="country" valueKey="count" />}
        </Card>
        <Card size="small" title="Devices" loading={loading}>
          {data && <BarList items={data.byDevice} labelKey="device" valueKey="count" />}
        </Card>
      </div>
    </div>
  );
}

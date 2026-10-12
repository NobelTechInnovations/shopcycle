"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Statistic, Alert, Button, Tag, Table, App, Skeleton, Tabs, Empty, Space } from "antd";
import { Sparkles, RefreshCw, ThumbsUp, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { RangePicker, rangeQuery, inr, num, pct, x2 } from "../meta-ads/ads-ui";

const CONF = { high: ["green", "High confidence"], medium: ["gold", "Medium confidence"], low: ["default", "Low confidence — early data"] };

export default function GInsights({ range, setRange, canEdit }) {
  const { message, modal } = App.useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(
    async (refresh) => {
      setLoading(true);
      setError(null);
      try {
        setData(await apiFetch(`/api/google-ads/insights?${rangeQuery(range)}${refresh ? "&refresh=1" : ""}`));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [range]
  );
  useEffect(() => {
    load();
  }, [load]);

  const approve = (r) =>
    modal.confirm({
      title: r.type === "pause" ? `Pause "${r.targetName}"?` : r.type === "budget" ? `Raise "${r.targetName}" to ${inr(r.change.to)} a day?` : `Add "${r.change.keyword}" as a negative keyword?`,
      content: r.reason,
      okText: "Apply",
      onOk: async () => {
        try {
          await apiFetch("/api/google-ads/recommendations/apply", { method: "POST", body: r });
          message.success("Applied — logged in Activity");
          load(true);
        } catch (err) {
          message.error(err.message);
        }
      },
    });
  const google = (rec, action) =>
    modal.confirm({
      title: action === "apply" ? `Apply Google's suggestion: ${rec.label}?` : `Dismiss "${rec.label}"?`,
      content: action === "apply" ? "Google makes the change it suggests in your account. Some suggestions raise spend — check the estimate." : "It disappears from the list.",
      okText: action === "apply" ? "Apply" : "Dismiss",
      onOk: async () => {
        try {
          await apiFetch("/api/google-ads/google-recommendations", { method: "POST", body: { resourceName: rec.resourceName, action } });
          load(true);
        } catch (err) {
          message.error(err.message);
        }
      },
    });

  const t = data?.totals;
  const s = data?.summary;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 justify-between">
        <RangePicker value={range} onChange={setRange} />
        <Button icon={<RefreshCw size={14} aria-hidden="true" />} loading={loading} onClick={() => load(true)}>
          Refresh
        </Button>
      </div>
      {error && <Alert type="error" showIcon message="Couldn't load results from Google Ads" description={error} />}
      {!data && !error ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : data ? (
        <>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card size="small" title="Google reports">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Statistic title="Spent" value={inr(t.spend)} />
                <Statistic title="Clicks" value={num(t.clicks)} />
                <Statistic title="Cost per click" value={inr(t.cpc, 2)} />
                <Statistic title="Purchases" value={num(t.purchases)} />
                <Statistic title="Cost per purchase" value={inr(t.cpa)} />
                <Statistic title="ROAS" value={t.revenue ? x2(t.roas) : "—"} />
              </div>
              <p className="text-xs text-ink-muted mt-2 mb-0">Attribution: {data.period.attribution}.</p>
            </Card>
            <Card size="small" title="Your store recorded">
              <div className="grid grid-cols-2 gap-3">
                <Statistic title="Orders from Google ads" value={num(data.store.orders)} />
                <Statistic title="Order value" value={inr(data.store.revenue)} />
                <Statistic title="Store ROAS" value={t.spend && data.store.revenue ? x2(data.store.revenue / t.spend) : "—"} />
                <Statistic title="Cost per order" value={data.store.orders ? inr(t.spend / data.store.orders) : "—"} />
              </div>
            </Card>
          </div>
          {s && (
            <Card size="small" title={<span className="flex items-center gap-2"><Sparkles size={15} className="text-accent" aria-hidden="true" /> What happened {s.source === "ai" && <Tag className="!m-0">AI summary</Tag>}</span>} extra={<Tag color={CONF[s.confidence]?.[0]}>{CONF[s.confidence]?.[1]}</Tag>}>
              <p className="text-sm mt-0">{s.whatHappened}</p>
              <div className="grid md:grid-cols-3 gap-4">
                {[["Worked best", s.best, "Not enough results to compare yet."], ["Possible reasons", s.why, "Nothing unusual found."], ["What to do next", s.next, ""]].map(([title, list, empty]) => (
                  <div key={title}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted m-0 mb-1">{title}</p>
                    <ul className="text-sm pl-4 m-0">{(list.length ? list : [empty]).filter(Boolean).map((x, i) => <li key={i}>{x}</li>)}</ul>
                  </div>
                ))}
              </div>
              {s.caveats?.length > 0 && <Alert className="mt-3" type="info" showIcon message="Keep in mind" description={<ul className="m-0 pl-4">{s.caveats.map((x, i) => <li key={i}>{x}</li>)}</ul>} />}
            </Card>
          )}
          <Card size="small" title="Suggested changes">
            {data.recommendations.length ? (
              <div className="flex flex-col gap-2">
                {data.recommendations.map((r) => (
                  <div key={r.id} className="rounded-lg border border-app-border p-3 flex flex-col sm:flex-row gap-3 justify-between">
                    <div>
                      <p className="m-0 font-medium">{r.type === "pause" ? "Pause" : r.type === "budget" ? `Budget ${inr(r.change.from)} → ${inr(r.change.to)}/day` : `Negative keyword “${r.change.keyword}”`}: {r.targetName}</p>
                      <p className="m-0 text-sm text-ink-muted mt-1">{r.reason}</p>
                      <Tag className="mt-2" color={CONF[r.confidence]?.[0]}>{CONF[r.confidence]?.[1]}</Tag>
                    </div>
                    {canEdit && <Button type="primary" icon={<ThumbsUp size={14} aria-hidden="true" />} onClick={() => approve(r)} className="shrink-0">Approve</Button>}
                  </div>
                ))}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No changes suggested for this period." />
            )}
          </Card>
          {data.googleRecommendations.length > 0 && (
            <Card size="small" title="Google's own suggestions">
              <div className="flex flex-col gap-2">
                {data.googleRecommendations.map((r) => (
                  <div key={r.resourceName} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      {r.label}
                      <span className="text-xs text-ink-muted">
                        {r.extraClicks ? ` · +${Math.round(r.extraClicks)} clicks/week` : ""}
                        {r.extraConversions ? ` · +${r.extraConversions.toFixed(1)} purchases/week` : ""}
                        {r.extraCost ? ` · +${inr(r.extraCost)}/week` : ""}
                      </span>
                    </span>
                    {canEdit && (
                      <Space>
                        <Button size="small" onClick={() => google(r, "apply")}>Apply</Button>
                        <Button size="small" type="text" icon={<X size={13} aria-hidden="true" />} onClick={() => google(r, "dismiss")} aria-label="Dismiss" />
                      </Space>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-ink-muted mt-2 mb-0">Google&apos;s estimates. Some suggestions mainly increase spend — apply the ones that fit your goals.</p>
            </Card>
          )}
          <Tabs
            items={[
              { key: "c", label: "Campaigns", children: <Table size="small" rowKey="id" dataSource={data.campaigns} scroll={{ x: 760 }} pagination={{ pageSize: 10, hideOnSinglePage: true }} columns={[{ title: "Campaign", dataIndex: "name" }, { title: "Type", dataIndex: "typeLabel" }, { title: "Spent", align: "right", render: (_, r) => inr(r.results.spend) }, { title: "Purchases", align: "right", render: (_, r) => num(r.results.purchases) }, { title: "Cost / purchase", align: "right", render: (_, r) => inr(r.results.cpa) }, { title: "Click rate", align: "right", render: (_, r) => pct(r.results.ctr) }, { title: "Store orders", align: "right", render: (_, r) => (r.store.orders ? `${r.store.orders} · ${inr(r.store.revenue)}` : "—") }]} /> },
              { key: "t", label: "Search terms", children: <Table size="small" rowKey={(r) => `${r.campaignId}:${r.term}`} dataSource={data.terms} pagination={{ pageSize: 15, hideOnSinglePage: true }} columns={[{ title: "Search", dataIndex: "term" }, { title: "Campaign", dataIndex: "campaignName" }, { title: "Spent", align: "right", dataIndex: "spend", render: (v) => inr(v) }, { title: "Clicks", align: "right", dataIndex: "clicks" }, { title: "Purchases", align: "right", dataIndex: "purchases", render: (v) => v || "—" }]} /> },
            ]}
          />
        </>
      ) : null}
    </div>
  );
}

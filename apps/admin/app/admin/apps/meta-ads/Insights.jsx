"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Statistic, Alert, Button, Tag, Table, App, Skeleton, Tabs, Tooltip, Empty } from "antd";
import { Sparkles, RefreshCw, ThumbsUp, Info } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { RangePicker, rangeQuery, inr, num, pct, x2 } from "./ads-ui";

const CONF = { high: ["green", "High confidence"], medium: ["gold", "Medium confidence"], low: ["default", "Low confidence — early data"] };

function Rec({ r, onApplied, canEdit }) {
  const { message, modal } = App.useApp();
  const apply = () =>
    modal.confirm({
      title: r.type === "pause" ? `Pause "${r.targetName}"?` : `Change "${r.targetName}" budget to ${inr(r.change.to)} a day?`,
      content: r.type === "budget" ? `From ${inr(r.change.from)} a day. Meta may take a few days to settle after a change.` : "It stops delivering. You can turn it back on any time.",
      okText: "Apply",
      onOk: async () => {
        try {
          await apiFetch("/api/meta-ads/recommendations/apply", { method: "POST", body: r });
          message.success("Applied — logged in Activity");
          onApplied();
        } catch (err) {
          message.error(err.message);
        }
      },
    });
  return (
    <div className="rounded-lg border border-app-border p-3 flex flex-col sm:flex-row sm:items-start gap-3 justify-between">
      <div className="min-w-0">
        <p className="m-0 font-medium">
          {r.type === "pause" ? "Pause" : `Raise budget ${inr(r.change.from)} → ${inr(r.change.to)}/day`}: {r.targetName}
        </p>
        <p className="m-0 text-sm text-ink-muted mt-1">{r.reason}</p>
        <Tag className="mt-2" color={CONF[r.confidence]?.[0]}>
          {CONF[r.confidence]?.[1]}
        </Tag>
      </div>
      {canEdit && (
        <Button type="primary" icon={<ThumbsUp size={14} aria-hidden="true" />} onClick={apply} className="shrink-0">
          Approve
        </Button>
      )}
    </div>
  );
}

export default function Insights({ range, setRange, canEdit }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(
    async (refresh) => {
      setLoading(true);
      setError(null);
      try {
        setData(await apiFetch(`/api/meta-ads/insights?${rangeQuery(range)}${refresh ? "&refresh=1" : ""}`));
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

  const t = data?.totals;
  const s = data?.summary;
  const cols = [
    { title: "Name", dataIndex: "name", render: (v) => <span className="font-medium">{v}</span> },
    { title: "Spent", align: "right", dataIndex: "spend", render: (v) => inr(v), sorter: (a, b) => a.spend - b.spend },
    { title: "Purchases", align: "right", dataIndex: "purchases", render: num, sorter: (a, b) => a.purchases - b.purchases },
    { title: "Cost / purchase", align: "right", dataIndex: "cpa", render: (v) => inr(v), sorter: (a, b) => (a.cpa ?? 1e12) - (b.cpa ?? 1e12) },
    { title: "ROAS", align: "right", dataIndex: "roas", render: (v, r) => (r.revenue ? x2(v) : "—") },
    { title: "Click rate", align: "right", dataIndex: "ctr", render: pct },
    { title: "Chats", align: "right", dataIndex: "chats", render: (v) => (v ? num(v) : "—"), responsive: ["lg"] },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 justify-between">
        <RangePicker value={range} onChange={setRange} />
        <Button icon={<RefreshCw size={14} aria-hidden="true" />} loading={loading} onClick={() => load(true)}>
          Refresh
        </Button>
      </div>
      {error && <Alert type="error" showIcon message="Couldn't load results from Meta" description={error} />}
      {!data && !error ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : data ? (
        <>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card size="small" title={<span className="flex items-center gap-1.5">Meta reports <Tooltip title={`Attribution: ${data.period.attribution}. Meta counts purchases by people who clicked an ad in the last 7 days or saw one yesterday.`}><Info size={13} className="text-ink-muted" aria-label="About these numbers" /></Tooltip></span>}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Statistic title="Spent" value={inr(t.spend)} />
                <Statistic title="Reach" value={num(t.reach)} />
                <Statistic title="Link clicks" value={num(t.clicks)} />
                <Statistic title="Purchases" value={num(t.purchases)} />
                <Statistic title="Cost per purchase" value={inr(t.cpa)} />
                <Statistic title="ROAS" value={t.revenue ? x2(t.roas) : "—"} />
              </div>
            </Card>
            <Card size="small" title={<span className="flex items-center gap-1.5">Your store recorded <Tooltip title="Orders in Oyklane from visits that came through a Meta ad link (tracked automatically on ads created here). Cancelled orders are left out."><Info size={13} className="text-ink-muted" aria-label="About these numbers" /></Tooltip></span>}>
              <div className="grid grid-cols-2 gap-3">
                <Statistic title="Orders from ads" value={num(data.store.orders)} />
                <Statistic title="Order value" value={inr(data.store.revenue)} />
                <Statistic title="Store ROAS" value={t.spend && data.store.revenue ? x2(data.store.revenue / t.spend) : "—"} />
                <Statistic title="Cost per order" value={data.store.orders ? inr(t.spend / data.store.orders) : "—"} />
              </div>
            </Card>
          </div>

          {s && (
            <Card
              size="small"
              title={
                <span className="flex items-center gap-2">
                  <Sparkles size={15} className="text-accent" aria-hidden="true" /> What happened {s.source === "ai" ? <Tag className="!m-0">AI summary</Tag> : null}
                </span>
              }
              extra={<Tag color={CONF[s.confidence]?.[0]}>{CONF[s.confidence]?.[1]}</Tag>}
            >
              <p className="text-sm mt-0">{s.whatHappened}</p>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted m-0 mb-1">Worked best</p>
                  <ul className="text-sm pl-4 m-0">{(s.best.length ? s.best : ["Not enough results to compare yet."]).map((x, i) => <li key={i}>{x}</li>)}</ul>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted m-0 mb-1">Possible reasons</p>
                  <ul className="text-sm pl-4 m-0">{(s.why.length ? s.why : ["Nothing unusual found."]).map((x, i) => <li key={i}>{x}</li>)}</ul>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted m-0 mb-1">What to do next</p>
                  <ul className="text-sm pl-4 m-0">{s.next.map((x, i) => <li key={i}>{x}</li>)}</ul>
                </div>
              </div>
              {s.caveats?.length > 0 && <Alert className="mt-3" type="info" showIcon message="Keep in mind" description={<ul className="m-0 pl-4">{s.caveats.map((x, i) => <li key={i}>{x}</li>)}</ul>} />}
              <p className="text-xs text-ink-muted mt-3 mb-0">Based only on your account&apos;s numbers for this period. No result is guaranteed.</p>
            </Card>
          )}

          <Card size="small" title="Suggested changes">
            {data.recommendations.length ? (
              <div className="flex flex-col gap-2">
                {data.recommendations.map((r) => (
                  <Rec key={r.id} r={r} canEdit={canEdit} onApplied={() => load(true)} />
                ))}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No changes suggested for this period." />
            )}
            <p className="text-xs text-ink-muted mt-3 mb-0">Nothing changes until you approve it. Want this automatic? Set limits in Automation.</p>
          </Card>

          <Tabs
            items={[
              { key: "campaigns", label: "Campaigns", children: <Table size="small" rowKey="id" dataSource={data.campaigns} columns={[...cols, { title: "Store orders", align: "right", render: (_, r) => (r.store?.orders ? `${r.store.orders} · ${inr(r.store.revenue)}` : "—") }]} scroll={{ x: 820 }} pagination={{ pageSize: 10, hideOnSinglePage: true }} /> },
              { key: "adsets", label: "Ad sets (audiences)", children: <Table size="small" rowKey="id" dataSource={data.adSets} columns={[...cols, { title: "Frequency", align: "right", dataIndex: "frequency", render: (v) => (v ? v.toFixed(1) : "—") }]} scroll={{ x: 820 }} pagination={{ pageSize: 10, hideOnSinglePage: true }} /> },
              { key: "ads", label: "Ads (creatives)", children: <Table size="small" rowKey="id" dataSource={data.ads} columns={cols} scroll={{ x: 820 }} pagination={{ pageSize: 10, hideOnSinglePage: true }} /> },
            ]}
          />
        </>
      ) : null}
    </div>
  );
}

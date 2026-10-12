"use client";

import { useCallback, useEffect, useState } from "react";
import { Table, Switch, Button, Dropdown, Modal, Form, Input, InputNumber, App, Empty, Alert, Tag, Drawer, Tooltip } from "antd";
import { MoreHorizontal, Plus, RefreshCw, Pencil, Trash2, Search } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { RangePicker, rangeQuery, inr, num, pct, x2 } from "../meta-ads/ads-ui";

const COLOR = { Running: "green", Active: "green", Paused: "default", Learning: "blue", Limited: "gold", "Needs attention": "orange", "Not running": "orange", Rejected: "red", Pending: "blue", Ended: "default", "Approved (limited)": "gold" };

const metricCols = [
  { title: "Spent", align: "right", render: (_, r) => inr(r.results?.spend) },
  { title: "Clicks", align: "right", render: (_, r) => num(r.results?.clicks) },
  { title: "Purchases", align: "right", render: (_, r) => (r.results?.purchases ? `${num(r.results.purchases)} · ${inr(r.results.cpa)} each` : "—") },
  { title: "Click rate", align: "right", responsive: ["md"], render: (_, r) => pct(r.results?.ctr) },
  { title: "ROAS", align: "right", responsive: ["md"], render: (_, r) => (r.results?.revenue ? x2(r.results.roas) : "—") },
];

function Status({ r }) {
  const tag = <Tag color={COLOR[r.statusLabel] || "default"} className="!m-0">{r.statusLabel}</Tag>;
  const why = [r.rejection, ...(r.reasons || [])].filter(Boolean).join("; ");
  return why ? <Tooltip title={why}>{tag}</Tooltip> : tag;
}

function useActions(type, reload, onEdit) {
  const { message, modal } = App.useApp();
  const toggle = (r, on) =>
    modal.confirm({
      title: on ? `Turn on "${r.name}"?` : `Pause "${r.name}"?`,
      content: on ? (r.budget ? `It can spend about ${inr(r.budget.amount)} a day (Google may spend up to 2× on busy days, never more than 30.4× the daily budget in a month).` : "It starts delivering.") : "It stops showing. You can turn it on again any time.",
      okText: on ? "Turn on" : "Pause",
      onOk: async () => {
        try {
          await apiFetch(`/api/google-ads/${type}/${encodeURIComponent(r.id)}`, { method: "PATCH", body: { status: on ? "ENABLED" : "PAUSED" } });
          reload();
        } catch (err) {
          message.error(err.message);
        }
      },
    });
  const lead = (r) => <Switch size="small" checked={r.status === "ENABLED"} onChange={(on) => toggle(r, on)} aria-label={`Turn ${r.name} ${r.status === "ENABLED" ? "off" : "on"}`} />;
  const more = (r) => (
    <Dropdown
      trigger={["click"]}
      menu={{
        items: [
          ...(type !== "ad" ? [{ key: "edit", icon: <Pencil size={13} aria-hidden="true" />, label: "Edit", onClick: () => onEdit({ type, row: r }) }] : []),
          {
            key: "remove",
            danger: true,
            icon: <Trash2 size={13} aria-hidden="true" />,
            label: "Remove",
            onClick: () =>
              modal.confirm({
                title: `Remove "${r.name}"?`,
                content: "Google removes it permanently (you can't turn it back on). Its past results stay in reports. To stop it for now, pause it instead.",
                okText: "Remove",
                okButtonProps: { danger: true },
                onOk: async () => {
                  try {
                    await apiFetch(`/api/google-ads/${type}/${encodeURIComponent(r.id)}`, { method: "DELETE" });
                    reload();
                  } catch (err) {
                    message.error(err.message);
                  }
                },
              }),
          },
        ],
      }}
    >
      <Button size="small" type="text" icon={<MoreHorizontal size={15} aria-hidden="true" />} aria-label="More actions" />
    </Dropdown>
  );
  return { lead, more };
}

function AdsTable({ adGroupId, range, canEdit }) {
  const [rows, setRows] = useState(null);
  const load = useCallback(() => apiFetch(`/api/google-ads/adgroups/${adGroupId}/ads?${rangeQuery(range)}`).then((d) => setRows(d.ads)).catch(() => setRows([])), [adGroupId, range]);
  useEffect(() => {
    load();
  }, [load]);
  const { lead, more } = useActions("ad", load, () => {});
  return (
    <Table
      size="small"
      rowKey="id"
      loading={rows === null}
      dataSource={rows || []}
      pagination={false}
      columns={[
        ...(canEdit ? [{ title: "", width: 48, render: (_, r) => lead(r) }] : []),
        { title: "Ad", render: (_, r) => <span>{r.name}{r.strength && <span className="block text-xs text-ink-muted">Ad strength: {r.strength}</span>}{r.rejection && <span className="block text-xs text-status-danger">Policy: {r.rejection}</span>}</span> },
        { title: "Status", render: (_, r) => <Status r={r} /> },
        ...metricCols,
        ...(canEdit ? [{ title: "", width: 40, render: (_, r) => more(r) }] : []),
      ]}
    />
  );
}

function ChildrenTable({ campaign, range, onEdit, canEdit }) {
  const [rows, setRows] = useState(null);
  const load = useCallback(() => apiFetch(`/api/google-ads/campaigns/${campaign.id}/children?${rangeQuery(range)}`).then((d) => setRows(d.children)).catch(() => setRows([])), [campaign.id, range]);
  useEffect(() => {
    load();
  }, [load]);
  const kind = campaign.type === "PERFORMANCE_MAX" ? "assetgroup" : "adgroup";
  const { lead, more } = useActions(kind, load, onEdit);
  return (
    <Table
      size="small"
      rowKey="id"
      loading={rows === null}
      dataSource={rows || []}
      pagination={false}
      expandable={kind === "adgroup" && campaign.type !== "SHOPPING" ? { expandedRowRender: (r) => <AdsTable adGroupId={r.id} range={range} canEdit={canEdit} /> } : undefined}
      columns={[
        ...(canEdit ? [{ title: "", width: 48, render: (_, r) => lead(r) }] : []),
        { title: kind === "assetgroup" ? "Asset group" : "Ad group", render: (_, r) => <span>{r.name}{r.strength && <span className="block text-xs text-ink-muted">Ad strength: {r.strength}</span>}{r.cpc ? <span className="block text-xs text-ink-muted">Max CPC {inr(r.cpc, 2)}</span> : null}</span> },
        { title: "Status", render: (_, r) => <Status r={r} /> },
        ...metricCols,
        ...(canEdit ? [{ title: "", width: 40, render: (_, r) => more(r) }] : []),
      ]}
    />
  );
}

function SearchTerms({ campaign, range, onClose }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!campaign) return;
    setRows(null);
    apiFetch(`/api/google-ads/campaigns/${campaign.id}/search-terms?${rangeQuery(range)}`).then((d) => setRows(d.terms)).catch(() => setRows([]));
  }, [campaign, range]);
  return (
    <Drawer open={Boolean(campaign)} onClose={onClose} width={720} title={`What people searched — ${campaign?.name || ""}`}>
      <p className="text-xs text-ink-muted mt-0">The actual searches that showed your ads. Ones that cost money without sales are good negative keywords — Insights suggests them.</p>
      <Table
        size="small"
        rowKey="term"
        loading={rows === null}
        dataSource={rows || []}
        pagination={{ pageSize: 25, hideOnSinglePage: true }}
        columns={[
          { title: "Search", dataIndex: "term" },
          { title: "Spent", align: "right", dataIndex: "spend", render: (v) => inr(v) },
          { title: "Clicks", align: "right", dataIndex: "clicks" },
          { title: "Purchases", align: "right", dataIndex: "purchases", render: (v) => (v ? v : "—") },
          { title: "", dataIndex: "added", render: (v) => (v === "EXCLUDED" ? <Tag>excluded</Tag> : v === "ADDED" ? <Tag color="green">keyword</Tag> : null) },
        ]}
      />
    </Drawer>
  );
}

function EditModal({ target, onClose, onSaved }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  useEffect(() => {
    if (target) form.setFieldsValue({ name: target.row.name, budget: target.row.budget?.amount });
  }, [target, form]);
  if (!target) return null;
  return (
    <Modal
      open
      title={`Edit ${target.type === "assetgroup" ? "asset group" : target.type === "adgroup" ? "ad group" : "campaign"}`}
      onCancel={onClose}
      onOk={async () => {
        const v = await form.validateFields();
        const body = {};
        if (v.name !== target.row.name) body.name = v.name;
        if (target.row.budget && v.budget !== target.row.budget.amount) body.budget = v.budget;
        if (!Object.keys(body).length) return onClose();
        try {
          await apiFetch(`/api/google-ads/${target.type}/${target.row.id}`, { method: "PATCH", body });
          message.success("Saved at Google");
          onSaved();
        } catch (err) {
          message.error(err.message);
        }
      }}
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="name" label="Name" rules={[{ required: true }]}>
          <Input maxLength={255} />
        </Form.Item>
        {target.row.budget && (
          <Form.Item name="budget" label="Daily budget (₹)" extra="Change by 20–30% at a time so Google's bidding stays steady." rules={[{ required: true }]}>
            <InputNumber min={1} className="w-full" />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}

export default function GCampaigns({ canEdit, range, setRange, onCreate }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [terms, setTerms] = useState(null);
  const load = useCallback(async () => {
    try {
      setError(null);
      setRows((await apiFetch(`/api/google-ads/campaigns?${rangeQuery(range)}`)).campaigns);
    } catch (err) {
      setError(err.message);
      setRows([]);
    }
  }, [range]);
  useEffect(() => {
    load();
  }, [load]);
  const { lead, more } = useActions("campaign", load, setEditing);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2 justify-between">
        <div className="flex gap-2">
          <RangePicker value={range} onChange={setRange} />
          <Button icon={<RefreshCw size={14} aria-hidden="true" />} onClick={load} aria-label="Refresh" />
        </div>
        {canEdit && (
          <Button type="primary" icon={<Plus size={14} aria-hidden="true" />} onClick={onCreate}>
            Create campaign
          </Button>
        )}
      </div>
      {error && <Alert type="error" showIcon message="Couldn't load campaigns from Google Ads" description={error} />}
      <Table
        rowKey="id"
        loading={rows === null}
        dataSource={rows || []}
        scroll={{ x: 900 }}
        expandable={{ expandedRowRender: (r) => <ChildrenTable campaign={r} range={range} onEdit={setEditing} canEdit={canEdit} /> }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No campaigns yet. Create one — it starts paused." /> }}
        columns={[
          ...(canEdit ? [{ title: "", width: 48, render: (_, r) => lead(r) }] : []),
          {
            title: "Campaign",
            render: (_, r) => (
              <span>
                <span className="font-medium">{r.name}</span>
                <span className="block text-xs text-ink-muted">
                  {r.typeLabel}
                  {r.budget ? ` · ${inr(r.budget.amount)}/day` : ""}
                </span>
                {r.type === "SEARCH" && (
                  <Button size="small" type="link" className="!p-0 !h-auto" icon={<Search size={12} aria-hidden="true" />} onClick={() => setTerms(r)}>
                    Search terms
                  </Button>
                )}
              </span>
            ),
          },
          { title: "Status", render: (_, r) => <Status r={r} /> },
          ...metricCols,
          ...(canEdit ? [{ title: "", width: 40, render: (_, r) => more(r) }] : []),
        ]}
      />
      <p className="text-xs text-ink-muted m-0">Results are what Google reports. See Insights for your store&apos;s own orders from Google ad clicks.</p>
      <EditModal target={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      <SearchTerms campaign={terms} range={range} onClose={() => setTerms(null)} />
    </div>
  );
}

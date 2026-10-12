"use client";

import { useCallback, useEffect, useState } from "react";
import { Table, Switch, Button, Dropdown, Modal, Form, Input, InputNumber, DatePicker, App, Empty, Alert, Tooltip } from "antd";
import { MoreHorizontal, Plus, RefreshCw, Copy, Pencil, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { RangePicker, rangeQuery, StatusTag, metricColumns, inr } from "./ads-ui";

/** Edit name / budget / end date of one object. */
function EditModal({ target, onClose, onSaved }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (target) form.setFieldsValue({ name: target.row.name, budget: target.row.budget?.amount });
  }, [target, form]);
  if (!target) return null;
  const { type, row } = target;
  return (
    <Modal
      open
      title={`Edit ${type === "adset" ? "ad set" : type}`}
      onCancel={onClose}
      confirmLoading={busy}
      okText="Save"
      onOk={async () => {
        const v = await form.validateFields();
        const body = {};
        if (v.name !== row.name) body.name = v.name;
        if (row.budget && v.budget !== row.budget.amount) body.budget = v.budget;
        if (type === "adset" && v.endTime !== undefined) body.endTime = v.endTime ? v.endTime.toISOString() : null;
        if (!Object.keys(body).length) return onClose();
        setBusy(true);
        try {
          await apiFetch(`/api/meta-ads/${type}/${row.id}`, { method: "PATCH", body });
          message.success("Saved at Meta");
          onSaved();
        } catch (err) {
          message.error(err.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="name" label="Name" rules={[{ required: true }]}>
          <Input maxLength={400} />
        </Form.Item>
        {row.budget && (
          <Form.Item
            name="budget"
            label={`${row.budget.type === "daily" ? "Daily" : "Lifetime"} budget (₹)`}
            extra="Big jumps restart Meta's learning. Change by 20–30% at a time when you can."
            rules={[{ required: true }]}
          >
            <InputNumber min={1} className="w-full" />
          </Form.Item>
        )}
        {type === "adset" && (
          <Form.Item name="endTime" label="End date (optional)">
            <DatePicker showTime={{ format: "h:mm a" }} format="D MMM YYYY, h:mm a" />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}

function useRowActions({ type, reload, onEdit }) {
  const { message, modal } = App.useApp();
  const setStatus = (row, on) =>
    modal.confirm({
      title: on ? `Turn on "${row.name}"?` : `Pause "${row.name}"?`,
      content: on ? (row.budget ? `It can spend up to ${inr(row.budget.amount)} ${row.budget.type === "daily" ? "a day" : "in total"}, charged by Meta.` : "It starts spending its budget, charged by Meta.") : "It stops delivering. You can turn it on again any time.",
      okText: on ? "Turn on" : "Pause",
      onOk: async () => {
        try {
          await apiFetch(`/api/meta-ads/${type}/${row.id}`, { method: "PATCH", body: { status: on ? "ACTIVE" : "PAUSED" } });
          message.success(on ? "Turned on" : "Paused");
          reload();
        } catch (err) {
          message.error(err.message);
        }
      },
    });
  const menu = (row) => ({
    items: [
      { key: "edit", icon: <Pencil size={13} aria-hidden="true" />, label: "Edit", onClick: () => onEdit({ type, row }) },
      {
        key: "copy",
        icon: <Copy size={13} aria-hidden="true" />,
        label: type === "ad" ? "Duplicate" : "Duplicate with everything inside",
        onClick: async () => {
          try {
            await apiFetch(`/api/meta-ads/${type}/${row.id}/duplicate`, { method: "POST" });
            message.success("Copied — the copy is paused");
            reload();
          } catch (err) {
            message.error(err.message);
          }
        },
      },
      {
        key: "delete",
        danger: true,
        icon: <Trash2 size={13} aria-hidden="true" />,
        label: "Delete",
        onClick: () =>
          modal.confirm({
            title: `Delete "${row.name}"?`,
            content: "It stops and is archived at Meta. Its past results stay in reports.",
            okButtonProps: { danger: true },
            okText: "Delete",
            onOk: async () => {
              try {
                await apiFetch(`/api/meta-ads/${type}/${row.id}`, { method: "DELETE" });
                reload();
              } catch (err) {
                message.error(err.message);
              }
            },
          }),
      },
    ],
  });
  const lead = (row) => (
    <Tooltip title={row.status === "ACTIVE" ? "On" : "Off"}>
      <Switch size="small" checked={row.status === "ACTIVE"} onChange={(on) => setStatus(row, on)} aria-label={`Turn ${row.name} ${row.status === "ACTIVE" ? "off" : "on"}`} />
    </Tooltip>
  );
  const more = (row) => (
    <Dropdown menu={menu(row)} trigger={["click"]}>
      <Button size="small" type="text" icon={<MoreHorizontal size={15} aria-hidden="true" />} aria-label="More actions" />
    </Dropdown>
  );
  return { lead, more };
}

function AdsTable({ adSetId, range, onEdit, canEdit }) {
  const [rows, setRows] = useState(null);
  const load = useCallback(() => apiFetch(`/api/meta-ads/adsets/${adSetId}/ads?${rangeQuery(range)}`).then((d) => setRows(d.ads)).catch(() => setRows([])), [adSetId, range]);
  useEffect(() => {
    load();
  }, [load]);
  const { lead, more } = useRowActions({ type: "ad", reload: load, onEdit });
  return (
    <Table
      size="small"
      rowKey="id"
      loading={rows === null}
      dataSource={rows || []}
      pagination={false}
      locale={{ emptyText: "No ads." }}
      columns={[
        ...(canEdit ? [{ title: "", width: 48, render: (_, r) => lead(r) }] : []),
        {
          title: "Ad",
          render: (_, r) => (
            <div className="flex items-center gap-2 min-w-0">
              {r.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.thumbnail} alt="" className="w-9 h-9 rounded object-cover shrink-0" />
              ) : (
                <span className="w-9 h-9 rounded bg-app-bg shrink-0" />
              )}
              <span className="min-w-0">
                <span className="block truncate">{r.name}</span>
                {r.rejection && <span className="block text-xs text-status-danger">Rejected: {r.rejection}</span>}
              </span>
            </div>
          ),
        },
        { title: "Status", render: (_, r) => <StatusTag row={r} /> },
        ...metricColumns,
        ...(canEdit ? [{ title: "", width: 40, render: (_, r) => more(r) }] : []),
      ]}
    />
  );
}

function AdSetsTable({ campaignId, range, onEdit, canEdit }) {
  const [rows, setRows] = useState(null);
  const load = useCallback(() => apiFetch(`/api/meta-ads/campaigns/${campaignId}/adsets?${rangeQuery(range)}`).then((d) => setRows(d.adSets)).catch(() => setRows([])), [campaignId, range]);
  useEffect(() => {
    load();
  }, [load]);
  const { lead, more } = useRowActions({ type: "adset", reload: load, onEdit });
  return (
    <Table
      size="small"
      rowKey="id"
      loading={rows === null}
      dataSource={rows || []}
      pagination={false}
      expandable={{ expandedRowRender: (r) => <AdsTable adSetId={r.id} range={range} onEdit={onEdit} canEdit={canEdit} />, rowExpandable: () => true }}
      locale={{ emptyText: "No ad sets." }}
      columns={[
        ...(canEdit ? [{ title: "", width: 48, render: (_, r) => lead(r) }] : []),
        {
          title: "Ad set",
          render: (_, r) => (
            <span>
              {r.name}
              <span className="block text-xs text-ink-muted">
                {r.goal} · {r.budget ? `${inr(r.budget.amount)} ${r.budget.type === "daily" ? "/day" : "total"}` : "campaign budget"}
                {r.learning === "LEARNING" ? " · learning" : r.learning === "FAIL" ? " · learning limited" : ""}
              </span>
              {r.audience && <span className="block text-xs text-ink-subtle">{r.audience}</span>}
            </span>
          ),
        },
        { title: "Status", render: (_, r) => <StatusTag row={r} /> },
        ...metricColumns,
        ...(canEdit ? [{ title: "", width: 40, render: (_, r) => more(r) }] : []),
      ]}
    />
  );
}

export default function Campaigns({ onCreate, canEdit, range, setRange }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const load = useCallback(async () => {
    try {
      setError(null);
      setRows((await apiFetch(`/api/meta-ads/campaigns?${rangeQuery(range)}`)).campaigns);
    } catch (err) {
      setError(err.message);
      setRows([]);
    }
  }, [range]);
  useEffect(() => {
    load();
  }, [load]);
  const { lead, more } = useRowActions({ type: "campaign", reload: load, onEdit: setEditing });
  const shown = (rows || []).filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2 justify-between">
        <div className="flex flex-wrap gap-2">
          <Input.Search allowClear placeholder="Search campaigns" value={q} onChange={(e) => setQ(e.target.value)} className="w-56" />
          <RangePicker value={range} onChange={setRange} />
          <Button icon={<RefreshCw size={14} aria-hidden="true" />} onClick={load} aria-label="Refresh" />
        </div>
        {canEdit && (
          <Button type="primary" icon={<Plus size={14} aria-hidden="true" />} onClick={onCreate}>
            Create campaign
          </Button>
        )}
      </div>
      {error && <Alert type="error" showIcon message="Couldn't load your campaigns from Meta" description={error} />}
      <Table
        rowKey="id"
        loading={rows === null}
        dataSource={shown}
        scroll={{ x: 900 }}
        expandable={{ expandedRowRender: (r) => <AdSetsTable campaignId={r.id} range={range} onEdit={setEditing} canEdit={canEdit} />, rowExpandable: () => true }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No campaigns yet. Create one — it starts paused, so nothing spends until you turn it on." /> }}
        columns={[
          ...(canEdit ? [{ title: "", width: 48, render: (_, r) => lead(r) }] : []),
          {
            title: "Campaign",
            render: (_, r) => (
              <span>
                <span className="font-medium">{r.name}</span>
                <span className="block text-xs text-ink-muted">
                  {r.objectiveLabel}
                  {r.budget ? ` · ${inr(r.budget.amount)} ${r.budget.type === "daily" ? "/day" : "total"}` : " · ad set budgets"}
                </span>
                {r.issues?.length > 0 && <span className="block text-xs text-status-warning">{r.issues[0]}</span>}
              </span>
            ),
          },
          { title: "Status", render: (_, r) => <StatusTag row={r} /> },
          ...metricColumns,
          ...(canEdit ? [{ title: "", width: 40, render: (_, r) => more(r) }] : []),
        ]}
      />
      <p className="text-xs text-ink-muted m-0">Results are what Meta reports (7-day click or 1-day view). See Insights for your store&apos;s own orders from ads.</p>
      <EditModal
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </div>
  );
}

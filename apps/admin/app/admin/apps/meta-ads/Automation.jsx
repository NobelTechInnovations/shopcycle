"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Switch, Button, Modal, Form, Select, InputNumber, Input, Table, Tag, App, Empty, Alert, Popconfirm } from "antd";
import { Plus, Trash2, Eye } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { inr } from "./ads-ui";

const FIELD = {
  minSpend: { label: "Only after spending at least", prefix: "₹" },
  maxCpa: { label: "Cost per purchase above", prefix: "₹" },
  minRoas: { label: "ROAS at least", suffix: "×" },
  maxRoas: { label: "ROAS below", suffix: "×" },
  minPurchases: { label: "With at least this many purchases" },
  changePercent: { label: "Change budgets by", suffix: "%" },
  lookbackDays: { label: "Looking at the last", suffix: "days" },
};

function RuleModal({ open, onClose, kinds, rule, onSaved, base }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const kind = Form.useWatch("kind", form);
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (rule) form.setFieldsValue({ name: rule.name, kind: rule.kind, maxDailyBudget: rule.maxDailyBudget ? Number(rule.maxDailyBudget) : null, ...rule.config });
    else form.setFieldsValue({ kind: "pause_no_results", ...kinds.pause_no_results.defaults });
  }, [open, rule, kinds, form]);
  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={rule ? "Edit rule" : "New automatic rule"}
      okText="Save"
      onOk={async () => {
        const v = await form.validateFields();
        const { name, kind: k, maxDailyBudget, ...config } = v;
        try {
          const body = { name, kind: k, maxDailyBudget, config, enabled: rule?.enabled || false };
          if (rule) await apiFetch(`${base}/rules/${rule.id}`, { method: "PUT", body });
          else await apiFetch(`${base}/rules`, { method: "POST", body });
          message.success(rule ? "Saved" : "Rule saved — it's off until you switch it on");
          onSaved();
        } catch (err) {
          message.error(err.message);
        }
      }}
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="kind" label="The rule">
          <Select
            disabled={Boolean(rule)}
            options={Object.entries(kinds).map(([value, k]) => ({ value, label: k.label }))}
            onChange={(k) => form.setFieldsValue(kinds[k].defaults)}
          />
        </Form.Item>
        {kind && <p className="text-xs text-ink-muted -mt-2">{kinds[kind].hint}</p>}
        <Form.Item name="name" label="Name (optional)">
          <Input maxLength={120} />
        </Form.Item>
        <div className="grid grid-cols-2 gap-3">
          {kind &&
            Object.keys(kinds[kind].defaults).map((f) => (
              <Form.Item key={f} name={f} label={FIELD[f].label}>
                <InputNumber className="w-full" min={0} prefix={FIELD[f].prefix} addonAfter={FIELD[f].suffix} />
              </Form.Item>
            ))}
        </div>
        {kind === "raise_budget_good_roas" && (
          <Form.Item name="maxDailyBudget" label="Never raise a daily budget above" rules={[{ required: true, message: "This limit is required" }]} extra="The rule's spending limit. Raises happen in small steps, at most every 3 days per ad set.">
            <InputNumber className="w-full" min={100} prefix="₹" />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}

export function Activity({ base = "/api/meta-ads" }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    apiFetch(`${base}/activity`)
      .then((d) => setRows(d.activity))
      .catch(() => setRows([]));
  }, [base]);
  const ACTION = { turned_on: "Turned on", paused: "Paused", budget_changed: "Changed budget", edited: "Edited", duplicated: "Duplicated", archived: "Deleted", published: "Published", publish_failed: "Publish failed", update: "Change failed", negative_keyword_added: "Added a negative keyword", google_recommendation_applied: "Applied Google's suggestion", google_recommendation_dismissed: "Dismissed Google's suggestion" };
  return (
    <Table
      size="small"
      rowKey="id"
      loading={rows === null}
      dataSource={rows || []}
      scroll={{ x: 720 }}
      locale={{ emptyText: "Changes made from Oyklane appear here." }}
      columns={[
        { title: "When", dataIndex: "createdAt", render: (v) => new Date(v).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) },
        { title: "Who", render: (_, r) => (r.source === "rule" ? <Tag color="purple">{r.userName || "Automatic rule"}</Tag> : r.source === "recommendation" ? <span>{r.userName} <Tag>suggestion</Tag></span> : r.userName || "—") },
        { title: "What", render: (_, r) => <span className={r.ok ? "" : "text-status-danger"}>{ACTION[r.action] || r.action}</span> },
        { title: "On", render: (_, r) => (r.targetName ? `${{ adset: "Ad set", ad: "Ad", adgroup: "Ad group", assetgroup: "Asset group" }[r.targetType] || "Campaign"} “${r.targetName}”` : r.targetId || "—") },
        {
          title: "Details",
          render: (_, r) =>
            r.error ? (
              <span className="text-status-danger text-xs">{r.error}</span>
            ) : r.detail?.before?.budget != null && r.detail?.after?.budget != null ? (
              `${inr(r.detail.before.budget)} → ${inr(r.detail.after.budget)}`
            ) : r.detail?.ads != null ? (
              `${r.detail.adSets} ad sets, ${r.detail.ads} ads`
            ) : null,
        },
      ]}
    />
  );
}

export default function Automation({ canEdit, base = "/api/meta-ads", unit = "ad sets" }) {
  const { message } = App.useApp();
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState({ open: false });
  const [preview, setPreview] = useState(null);
  const load = useCallback(() => apiFetch(`${base}/rules`).then(setData).catch((err) => message.error(err.message)), [message, base]);
  useEffect(() => {
    load();
  }, [load]);

  async function toggle(rule, enabled) {
    try {
      await apiFetch(`${base}/rules/${rule.id}`, { method: "PUT", body: { name: rule.name, kind: rule.kind, config: rule.config, maxDailyBudget: rule.maxDailyBudget ? Number(rule.maxDailyBudget) : null, enabled } });
      message.success(enabled ? "Rule on — it checks every 6 hours" : "Rule off");
      load();
    } catch (err) {
      message.error(err.message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert
        type="info"
        showIcon
        message="Automatic rules are optional"
        description={`Each rule only changes ${unit} that are running, within the limits you set, every 6 hours at most. Every change is in the Activity log. Switch a rule off any time.`}
      />
      <div className="flex justify-end">
        {canEdit && (
          <Button type="primary" icon={<Plus size={14} aria-hidden="true" />} onClick={() => setEditing({ open: true })} disabled={!data}>
            New rule
          </Button>
        )}
      </div>
      {data?.rules?.length ? (
        <div className="grid md:grid-cols-2 gap-3">
          {data.rules.map((r) => (
            <Card
              key={r.id}
              size="small"
              title={r.name}
              extra={canEdit && <Switch checked={r.enabled} onChange={(on) => toggle(r, on)} aria-label={r.enabled ? "Turn rule off" : "Turn rule on"} />}
            >
              <p className="text-xs text-ink-muted mt-0">{data.kinds[r.kind]?.hint}</p>
              <p className="text-sm m-0">
                {Object.entries(r.config)
                  .map(([k, v]) => `${FIELD[k]?.label || k} ${FIELD[k]?.prefix || ""}${v}${FIELD[k]?.suffix ? ` ${FIELD[k].suffix}` : ""}`)
                  .join(" · ")}
                {r.maxDailyBudget ? ` · ceiling ${inr(r.maxDailyBudget)}/day` : ""}
              </p>
              <p className="text-xs text-ink-muted mb-2">{r.lastRunAt ? `Last checked ${new Date(r.lastRunAt).toLocaleString()}` : "Not run yet"}</p>
              <div className="flex gap-2">
                <Button
                  size="small"
                  icon={<Eye size={13} aria-hidden="true" />}
                  onClick={async () => {
                    try {
                      setPreview({ rule: r, changes: (await apiFetch(`${base}/rules/${r.id}/preview`, { method: "POST" })).changes });
                    } catch (err) {
                      message.error(err.message);
                    }
                  }}
                >
                  What would it do now?
                </Button>
                {canEdit && <Button size="small" onClick={() => setEditing({ open: true, rule: r })}>Edit</Button>}
                {canEdit && (
                  <Popconfirm title="Delete this rule?" onConfirm={() => apiFetch(`${base}/rules/${r.id}`, { method: "DELETE" }).then(load)}>
                    <Button size="small" danger icon={<Trash2 size={13} aria-hidden="true" />} aria-label="Delete rule" />
                  </Popconfirm>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        data && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No rules. Suggestions in Insights always wait for your approval." />
      )}
      <div>
        <h3 className="text-[15px] font-semibold mt-2 mb-2">Activity</h3>
        <Activity base={base} />
      </div>
      {data && <RuleModal base={base} open={editing.open} rule={editing.rule} kinds={data.kinds} onClose={() => setEditing({ open: false })} onSaved={() => { setEditing({ open: false }); load(); }} />}
      <Modal open={Boolean(preview)} onCancel={() => setPreview(null)} footer={null} title={`If “${preview?.rule?.name}” ran now`}>
        {preview?.changes?.length ? (
          <ul className="pl-4 text-sm">
            {preview.changes.map((c) => (
              <li key={c.adSetId}>
                {c.name}: {c.status ? "pause" : `budget ${inr(c.from)} → ${inr(c.budget)}`} — {c.why}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">No changes — nothing currently meets the rule.</p>
        )}
        <p className="text-xs text-ink-muted m-0">This is a preview; nothing was changed.</p>
      </Modal>
    </div>
  );
}

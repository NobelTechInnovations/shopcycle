"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Select, Switch, Input, Button, Table, App, Alert, Popconfirm, Space } from "antd";
import { Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { HealthCard } from "./wa-ui";

function InboxSettings({ canEdit }) {
  const { message } = App.useApp();
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    apiFetch("/api/whatsapp/settings")
      .then((d) => {
        setData(d);
        setDraft(d.settings);
      })
      .catch((err) => message.error(err.message));
  }, [message]);
  if (!draft) return <Card size="small" title="Inbox" loading />;
  async function save() {
    setSaving(true);
    try {
      await apiFetch("/api/whatsapp/settings", { method: "PUT", body: draft });
      message.success("Saved");
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Card size="small" title="Inbox" extra={canEdit && <Button type="primary" size="small" loading={saving} onClick={save}>Save</Button>}>
      <div className="flex flex-col gap-4 max-w-xl">
        <div>
          <p className="text-sm font-medium m-0">New conversations go to</p>
          <Select
            className="w-full mt-1"
            disabled={!canEdit}
            value={draft.autoAssign}
            onChange={(autoAssign) => setDraft({ ...draft, autoAssign })}
            options={[{ value: "none", label: "Nobody — anyone on the team picks them up" }, { value: "round_robin", label: "Shared out evenly across the team" }, ...data.team.map((m) => ({ value: m.id, label: m.name }))]}
          />
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <Switch size="small" disabled={!canEdit || !data.aiAvailable} checked={draft.ai.enabled} onChange={(enabled) => setDraft({ ...draft, ai: { ...draft.ai, enabled } })} />
            AI assistant answers new conversations
          </label>
          <p className="text-xs text-ink-muted mt-1 mb-2">
            It replies only within WhatsApp&apos;s 24-hour window, only from your store&apos;s facts (the customer&apos;s orders and your instructions), and hands the conversation to your team —
            with a note — when it can&apos;t answer, the customer is upset, or asks for a person. You can switch any conversation between AI and team in the inbox.
          </p>
          {!data.aiAvailable && <Alert type="info" showIcon message="AI isn't set up on Oyklane yet." />}
          {draft.ai.enabled && (
            <Input.TextArea
              rows={5}
              maxLength={2000}
              showCount
              disabled={!canEdit}
              placeholder={"Your instructions, for example:\n- We deliver in 3–5 days across India; free over ₹999.\n- Returns within 7 days for unopened items.\n- Never promise discounts."}
              value={draft.ai.instructions}
              onChange={(e) => setDraft({ ...draft, ai: { ...draft.ai, instructions: e.target.value } })}
            />
          )}
        </div>
      </div>
    </Card>
  );
}

function OptOuts({ canEdit }) {
  const { message } = App.useApp();
  const [rows, setRows] = useState(null);
  const [phone, setPhone] = useState("");
  const load = useCallback(() => apiFetch("/api/whatsapp/opt-outs").then((d) => setRows(d.optOuts)).catch(() => setRows([])), []);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <Card size="small" title="Opt-out list">
      <p className="text-xs text-ink-muted mt-0">
        Numbers here never get broadcasts or marketing messages. Customers are added automatically when they reply STOP (and removed when they reply START).
      </p>
      <Space.Compact className="mb-3 w-full max-w-md">
        <Input placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Button
          onClick={async () => {
            try {
              await apiFetch("/api/whatsapp/opt-outs", { method: "POST", body: { phone } });
              setPhone("");
              load();
            } catch (err) {
              message.error(err.message);
            }
          }}
          disabled={phone.replace(/\D/g, "").length < 10}
        >
          Add
        </Button>
      </Space.Compact>
      <Table
        size="small"
        rowKey="id"
        loading={rows === null}
        dataSource={rows || []}
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        locale={{ emptyText: "Nobody has opted out." }}
        columns={[
          { title: "Number", dataIndex: "phone", render: (v) => `+${v}` },
          { title: "Why", dataIndex: "reason" },
          { title: "Since", dataIndex: "createdAt", render: (v) => new Date(v).toLocaleDateString() },
          {
            title: "",
            align: "right",
            render: (_, r) =>
              canEdit && (
                <Popconfirm title="Allow messages to this number again?" description="Only if the customer asked to hear from you again." onConfirm={() => apiFetch(`/api/whatsapp/opt-outs/${r.id}`, { method: "DELETE" }).then(load)}>
                  <Button size="small" type="text" icon={<Trash2 size={13} aria-hidden="true" />} aria-label="Remove from list" />
                </Popconfirm>
              ),
          },
        ]}
      />
    </Card>
  );
}

export default function WaSettings({ canEdit }) {
  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      <div className="flex flex-col gap-4">
        <HealthCard />
        <Card size="small" title="Consent">
          <p className="text-sm mt-0">WhatsApp only allows business messages to people who agreed to hear from you. Oyklane keeps the record and enforces it:</p>
          <ul className="text-sm pl-4 mb-0">
            <li>Order updates (Utility templates) go to customers who gave their number for the order, unless they opted out.</li>
            <li>Offers, broadcasts and reminders (Marketing) only go to customers marked &quot;Agreed to WhatsApp marketing&quot; — set from checkout, the customer&apos;s page, or when they message you first and agree.</li>
            <li>Anyone who replies STOP is opted out at once.</li>
          </ul>
        </Card>
      </div>
      <div className="flex flex-col gap-4">
        <InboxSettings canEdit={canEdit} />
        <OptOuts canEdit={canEdit} />
      </div>
    </div>
  );
}

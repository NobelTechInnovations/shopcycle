"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Select, Switch, Input, Button, Table, App, Alert, Popconfirm, Space, Radio, Tag, Checkbox } from "antd";
import { Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { HealthCard } from "./wa-ui";

const TSTATUS = { APPROVED: ["green", "approved"], PENDING: ["blue", "in review"], REJECTED: ["red", "rejected"] };

/** Order confirmed / shipped / delivered on WhatsApp, and which number sends them. */
function OrderUpdates({ canEdit }) {
  const { message } = App.useApp();
  const [d, setD] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(null);
  const load = useCallback(
    () =>
      apiFetch("/api/whatsapp/order-updates")
        .then((x) => {
          setD(x);
          const def = x.platformDefault || {};
          setDraft({
            orderConfirmed: x.settings.orderConfirmed ?? Boolean(def.enabled && def.events?.orderConfirmed !== false),
            shipped: x.settings.shipped ?? Boolean(def.enabled && def.events?.shipped !== false),
            delivered: x.settings.delivered ?? Boolean(def.enabled && def.events?.delivered !== false),
            sender: x.settings.sender || "auto",
          });
        })
        .catch((err) => message.error(err.message)),
    [message]
  );
  useEffect(() => {
    load();
  }, [load]);
  if (!d || !draft) return <Card size="small" title="Order updates" loading />;
  const ownReady = d.own.connected && Object.values(d.own.templates).every((st) => st === "APPROVED");
  const ownMissing = Object.values(d.own.templates).some((st) => !st);
  return (
    <Card
      size="small"
      title="Order updates on WhatsApp"
      extra={
        canEdit && (
          <Button
            type="primary"
            size="small"
            loading={busy === "save"}
            onClick={async () => {
              setBusy("save");
              try {
                await apiFetch("/api/whatsapp/order-updates", { method: "PUT", body: draft });
                message.success("Saved");
                load();
              } catch (err) {
                message.error(err.message);
              } finally {
                setBusy(null);
              }
            }}
          >
            Save
          </Button>
        )
      }
    >
      <p className="text-xs text-ink-muted mt-0">Sent automatically with the order number, total, courier and a link to the order page. Customers who replied STOP don&apos;t get them.</p>
      <div className="flex flex-col gap-2 mb-3">
        {Object.entries(d.kinds).map(([k, v]) => (
          <Checkbox key={k} disabled={!canEdit} checked={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.checked })}>
            {v.label}
            <span className="block text-xs text-ink-muted">{v.body.replace("{{1}}", "Asha").replace("{{2}}", "#1042").replace("{{3}}", "your store").replace("{{4}}", v.label === "Order shipped" ? "Delhivery" : "₹1,299")}</span>
          </Checkbox>
        ))}
      </div>
      <p className="text-sm font-medium m-0 mb-1">Sent from</p>
      <Radio.Group disabled={!canEdit} value={draft.sender} onChange={(e) => setDraft({ ...draft, sender: e.target.value })} className="flex flex-col gap-1">
        <Radio value="auto">Automatic — your number when it&apos;s ready, otherwise Oyklane&apos;s</Radio>
        <Radio value="own" disabled={!d.own.connected}>Only my WhatsApp number</Radio>
        <Radio value="platform" disabled={!d.platformReady}>Oyklane&apos;s WhatsApp number{d.platformNumber ? ` (${d.platformNumber})` : ""}</Radio>
      </Radio.Group>
      {!d.platformReady && <p className="text-xs text-ink-muted mt-2 mb-0">Oyklane&apos;s shared number isn&apos;t available yet, so updates need your own number.</p>}
      {d.own.connected && (
        <div className="mt-3 rounded-md border border-app-border p-2">
          <p className="text-xs font-semibold m-0 mb-1">Templates on your WhatsApp account</p>
          <div className="flex flex-wrap gap-1 mb-2">
            {Object.entries(d.own.templates).map(([name, st]) => (
              <Tag key={name} color={TSTATUS[st]?.[0]}>
                {name} · {st ? TSTATUS[st]?.[1] || st.toLowerCase() : "not added"}
              </Tag>
            ))}
          </div>
          {ownMissing && canEdit && (
            <Button
              size="small"
              loading={busy === "install"}
              onClick={async () => {
                setBusy("install");
                try {
                  const r = await apiFetch("/api/whatsapp/order-updates/install", { method: "POST" });
                  const bad = r.results.filter((x) => x.status === "error");
                  if (bad.length) message.error(`${bad[0].name}: ${bad[0].error}`);
                  else message.success("Sent to Meta for review — usually approved within minutes");
                  load();
                } catch (err) {
                  message.error(err.message);
                } finally {
                  setBusy(null);
                }
              }}
            >
              Add them to my WhatsApp account
            </Button>
          )}
          {ownReady && <p className="text-xs text-status-success m-0">Your number sends order updates.</p>}
        </div>
      )}
    </Card>
  );
}

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
        <OrderUpdates canEdit={canEdit} />
        <InboxSettings canEdit={canEdit} />
        <OptOuts canEdit={canEdit} />
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Card, Button, Modal, Input, Checkbox, Alert, App, Switch, Table, Tag, Tooltip } from "antd";
import { KeyRound, Webhook, Copy, Check, Trash2, Send, RotateCw, Plus } from "lucide-react";
import { StatusBadge, EmptyState, useConfirmDialog } from "@shopcycle/ui";
import { apiFetch, API_URL } from "@/lib/api";

const when = (iso) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "Never");

function OneTimeSecret({ label, value, note }) {
  const { message } = App.useApp();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-app-border bg-app-bg p-3">
        <p className="m-0 text-xs text-ink-muted mb-1">{label}</p>
        <p className="m-0 font-mono text-[13px] text-ink break-all select-all">{value}</p>
      </div>
      <Button
        icon={copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        onClick={() =>
          navigator.clipboard.writeText(value).then(
            () => setCopied(true),
            () => message.info("Select the text and copy it")
          )
        }
      >
        {copied ? "Copied" : "Copy"}
      </Button>
      <Alert type="warning" showIcon message="Copy it now — it won't be shown again." description={note} />
    </div>
  );
}

function groupBy(items) {
  return items.reduce((acc, it) => ((acc[it.group] ||= []).push(it), acc), {});
}

function KeysCard({ initial }) {
  const { message } = App.useApp();
  const { confirmDialog } = useConfirmDialog();
  const [data, setData] = useState(initial);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState([]);
  const [created, setCreated] = useState(null);
  const [saving, setSaving] = useState(false);

  const reload = async () => setData(await apiFetch("/api/developer/keys"));

  async function create() {
    setSaving(true);
    try {
      const r = await apiFetch("/api/developer/keys", { method: "POST", body: { name, scopes } });
      setCreated(r);
      reload();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  function close() {
    setOpen(false);
    setCreated(null);
    setName("");
    setScopes([]);
  }

  const labels = Object.fromEntries(data.scopes.map((s) => [s.key, s.label]));

  return (
    <Card
      size="small"
      title={
        <span className="flex items-center gap-2">
          <KeyRound size={15} aria-hidden="true" /> API keys
        </span>
      }
      extra={
        <Button size="small" type="primary" icon={<Plus size={13} aria-hidden="true" />} onClick={() => setOpen(true)}>
          Create key
        </Button>
      }
    >
      {data.keys.length === 0 ? (
        <EmptyState icon={<KeyRound />} title="No API keys yet" description="Create a key for each app you connect, with only the permissions it needs." />
      ) : (
        <ul className="m-0 p-0 list-none divide-y divide-app-border">
          {data.keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="m-0 text-sm font-medium text-ink">
                  {k.name} <span className="font-mono text-xs text-ink-muted">{k.prefix}…</span>
                </p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {k.scopes.map((s) => (
                    <Tag key={s} className="!m-0 !text-[11px]">
                      {labels[s] || s}
                    </Tag>
                  ))}
                </div>
                <p className="m-0 mt-1.5 text-xs text-ink-muted">
                  Last used {when(k.lastUsedAt)} · created {when(k.createdAt)}
                  {k.createdBy ? ` by ${k.createdBy}` : ""}
                </p>
              </div>
              <Button
                size="small"
                danger
                onClick={() =>
                  confirmDialog({
                    title: `Revoke "${k.name}"?`,
                    description: "Anything using this key stops working immediately. This can't be undone.",
                    okText: "Revoke",
                    danger: true,
                    onConfirm: async () => {
                      await apiFetch(`/api/developer/keys/${k.id}`, { method: "DELETE" });
                      reload();
                    },
                  })
                }
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-ink-muted mt-3 mb-0">
        Send the key as <code>Authorization: Bearer oyk_…</code> to <code>{API_URL.replace(/\/$/, "")}/api/v1</code> — e.g. <code>GET /api/v1/orders</code>.
      </p>

      <Modal
        open={open}
        onCancel={close}
        title={created ? "Your new API key" : "Create API key"}
        destroyOnHidden
        footer={
          created ? (
            <Button type="primary" onClick={close}>
              Done
            </Button>
          ) : (
            <div className="flex justify-end gap-2">
              <Button onClick={close}>Cancel</Button>
              <Button type="primary" loading={saving} disabled={!name.trim() || !scopes.length} onClick={create}>
                Create key
              </Button>
            </div>
          )
        }
      >
        {created ? (
          <OneTimeSecret label={`${created.key.name}`} value={created.token} note="Store it in your app's settings. If you lose it, revoke it and create a new one." />
        ) : (
          <div className="flex flex-col gap-4 mt-2">
            <label className="block">
              <span className="block text-[13px] font-medium text-ink mb-1">Name</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Warehouse sync" maxLength={80} />
            </label>
            <div>
              <p className="text-[13px] font-medium text-ink m-0 mb-2">What can it do?</p>
              <div className="flex flex-col gap-3">
                {Object.entries(groupBy(data.scopes)).map(([group, items]) => (
                  <div key={group} className="rounded-lg border border-app-border p-3">
                    <p className="m-0 mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-subtle">{group}</p>
                    <div className="flex flex-col gap-1">
                      {items.map((s) => (
                        <Checkbox
                          key={s.key}
                          checked={scopes.includes(s.key)}
                          onChange={(e) => setScopes((cur) => (e.target.checked ? [...cur, s.key] : cur.filter((x) => x !== s.key)))}
                        >
                          {s.label}
                        </Checkbox>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}

function WebhooksCard({ initial }) {
  const { message } = App.useApp();
  const { confirmDialog } = useConfirmDialog();
  const [data, setData] = useState(initial);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState(["order.created", "order.paid"]);
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(null);

  const reload = async () => setData(await apiFetch("/api/developer/webhooks"));

  async function create() {
    setBusy("create");
    try {
      setCreated(await apiFetch("/api/developer/webhooks", { method: "POST", body: { url, events } }));
      reload();
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function test(id) {
    setBusy(id);
    try {
      const { delivery } = await apiFetch(`/api/developer/webhooks/${id}/test`, { method: "POST" });
      if (delivery.status === "success") message.success(`Delivered (HTTP ${delivery.responseStatus})`);
      else message.error(`Not delivered: ${delivery.lastError || "no response"}`);
      reload();
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function toggle(ep, enabled) {
    await apiFetch(`/api/developer/webhooks/${ep.id}`, { method: "PATCH", body: { enabled } });
    reload();
  }

  async function redeliver(id) {
    setBusy(id);
    try {
      const { delivery } = await apiFetch(`/api/developer/deliveries/${id}/redeliver`, { method: "POST" });
      message[delivery.status === "success" ? "success" : "error"](delivery.status === "success" ? "Delivered" : `Failed: ${delivery.lastError}`);
      reload();
    } finally {
      setBusy(null);
    }
  }

  function close() {
    setOpen(false);
    setCreated(null);
    setUrl("");
  }

  const eventLabel = Object.fromEntries(data.events.map((e) => [e.key, e.label]));
  const endpointUrl = Object.fromEntries(data.endpoints.map((e) => [e.id, e.url]));

  return (
    <Card
      size="small"
      title={
        <span className="flex items-center gap-2">
          <Webhook size={15} aria-hidden="true" /> Webhooks
        </span>
      }
      extra={
        <Button size="small" type="primary" icon={<Plus size={13} aria-hidden="true" />} onClick={() => setOpen(true)}>
          Add webhook
        </Button>
      }
    >
      {data.endpoints.length === 0 ? (
        <EmptyState icon={<Webhook />} title="No webhooks yet" description="Get an instant POST to your server when an order is placed, paid, shipped or refunded — or a product changes." />
      ) : (
        <ul className="m-0 p-0 list-none divide-y divide-app-border">
          {data.endpoints.map((ep) => (
            <li key={ep.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="m-0 text-sm font-medium text-ink font-mono break-all">{ep.url}</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {ep.events.map((e) => (
                    <Tag key={e} className="!m-0 !text-[11px]">
                      {eventLabel[e] || e}
                    </Tag>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Tooltip title={ep.enabled ? "On" : "Off"}>
                  <Switch size="small" checked={ep.enabled} onChange={(v) => toggle(ep, v)} aria-label="Webhook on" />
                </Tooltip>
                <Button size="small" icon={<Send size={13} aria-hidden="true" />} loading={busy === ep.id} onClick={() => test(ep.id)}>
                  Send test
                </Button>
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<Trash2 size={13} aria-hidden="true" />}
                  aria-label="Delete webhook"
                  onClick={() =>
                    confirmDialog({
                      title: "Delete this webhook?",
                      description: "Events stop being sent to it.",
                      okText: "Delete",
                      danger: true,
                      onConfirm: async () => {
                        await apiFetch(`/api/developer/webhooks/${ep.id}`, { method: "DELETE" });
                        reload();
                      },
                    })
                  }
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {data.deliveries.length > 0 && (
        <div className="mt-4">
          <p className="m-0 mb-2 text-xs font-semibold uppercase tracking-wider text-ink-subtle">Recent deliveries</p>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            scroll={{ x: "max-content" }}
            dataSource={data.deliveries}
            columns={[
              { title: "Event", dataIndex: "event", render: (e) => <span className="text-[13px]">{eventLabel[e] || e}</span> },
              { title: "To", dataIndex: "endpointId", render: (id) => <span className="font-mono text-xs text-ink-muted truncate inline-block max-w-[220px]">{endpointUrl[id]}</span> },
              {
                title: "Result",
                render: (_, d) => (
                  <span className="flex items-center gap-2">
                    <StatusBadge status={d.status === "success" ? "active" : d.status === "failed" ? "failed" : "pending"} label={d.status === "success" ? "Delivered" : d.status === "failed" ? "Failed" : "Retrying"} />
                    <span className="text-xs text-ink-muted">{d.responseStatus ? `HTTP ${d.responseStatus}` : d.lastError || ""}</span>
                  </span>
                ),
              },
              { title: "When", dataIndex: "createdAt", render: (d) => <span className="text-xs text-ink-muted whitespace-nowrap">{when(d)}</span> },
              {
                title: "",
                render: (_, d) =>
                  d.status !== "success" && (
                    <Button size="small" type="text" icon={<RotateCw size={13} aria-hidden="true" />} loading={busy === d.id} onClick={() => redeliver(d.id)}>
                      Resend
                    </Button>
                  ),
              },
            ]}
          />
        </div>
      )}

      <p className="text-xs text-ink-muted mt-3 mb-0">
        Each request is signed: check <code>X-Oyklane-Signature</code> = <code>sha256=</code>HMAC-SHA256 of <code>{"{timestamp}.{body}"}</code> with your signing secret. Failed deliveries are retried for about 9 hours.
      </p>

      <Modal
        open={open}
        onCancel={close}
        title={created ? "Webhook added" : "Add webhook"}
        destroyOnHidden
        footer={
          created ? (
            <Button type="primary" onClick={close}>
              Done
            </Button>
          ) : (
            <div className="flex justify-end gap-2">
              <Button onClick={close}>Cancel</Button>
              <Button type="primary" loading={busy === "create"} disabled={!url.trim() || !events.length} onClick={create}>
                Add webhook
              </Button>
            </div>
          )
        }
      >
        {created ? (
          <OneTimeSecret label="Signing secret" value={created.secret} note="Use it to check that requests really come from Oyklane." />
        ) : (
          <div className="flex flex-col gap-4 mt-2">
            <label className="block">
              <span className="block text-[13px] font-medium text-ink mb-1">Your URL</span>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-app.com/oyklane/webhooks" />
            </label>
            <div className="flex flex-col gap-3">
              {Object.entries(groupBy(data.events)).map(([group, items]) => (
                <div key={group} className="rounded-lg border border-app-border p-3">
                  <p className="m-0 mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-subtle">{group}</p>
                  <div className="flex flex-col gap-1">
                    {items.map((e) => (
                      <Checkbox
                        key={e.key}
                        checked={events.includes(e.key)}
                        onChange={(ev) => setEvents((cur) => (ev.target.checked ? [...cur, e.key] : cur.filter((x) => x !== e.key)))}
                      >
                        {e.label} <span className="text-xs text-ink-subtle font-mono">{e.key}</span>
                      </Checkbox>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}

export function DeveloperSettings({ initialKeys, initialHooks, canEdit }) {
  if (!canEdit) return <Alert type="info" showIcon message="Only the store owner or an admin can manage API keys and webhooks." />;
  return (
    <div className="max-w-3xl flex flex-col gap-4">
      <KeysCard initial={initialKeys} />
      <WebhooksCard initial={initialHooks} />
    </div>
  );
}

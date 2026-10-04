"use client";

import { useState } from "react";
import { Card, Switch, Button, Drawer, Input, Alert, App, Tag } from "antd";
import { Banknote, ExternalLink, ShieldCheck, Trash2 } from "lucide-react";
import { StatusBadge, useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

// A small wordmark per gateway, so the list scans like Shopify's.
const MARKS = {
  razorpay: { bg: "#0C2451", fg: "#fff", text: "Razorpay" },
  cashfree: { bg: "#6933D3", fg: "#fff", text: "Cashfree" },
  payu: { bg: "#A6CE39", fg: "#1a1a1a", text: "PayU" },
  stripe: { bg: "#635BFF", fg: "#fff", text: "Stripe" },
  paypal: { bg: "#003087", fg: "#fff", text: "PayPal" },
};

function Mark({ k }) {
  const m = MARKS[k];
  return (
    <span className="inline-flex items-center justify-center h-9 min-w-[88px] px-2 rounded-md text-[12px] font-bold tracking-tight shrink-0" style={{ background: m.bg, color: m.fg }}>
      {m.text}
    </span>
  );
}

function SetupDrawer({ provider, open, onClose, onSaved, canEdit }) {
  const { message } = App.useApp();
  const [values, setValues] = useState({});
  const [testMode, setTestMode] = useState(provider?.testMode ?? true);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const next = await apiFetch(`/api/payments/${provider.key}`, {
        method: "PUT",
        body: { credentials: values, testMode, enabled: provider.connected ? provider.enabled : true },
      });
      message.success(`${provider.name} ${provider.connected ? "updated" : "connected"}`);
      onSaved(next);
      onClose();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!provider) return null;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={460}
      title={
        <span className="flex items-center gap-3">
          <Mark k={provider.key} /> {provider.connected ? "Manage" : "Connect"} {provider.name}
        </span>
      }
      destroyOnHidden
      afterOpenChange={(o) => o && (setValues({}), setTestMode(provider.testMode ?? true))}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" loading={saving} disabled={!canEdit} onClick={save}>
            {provider.connected ? "Save" : "Connect"}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-ink-muted mt-0">{provider.blurb}</p>
      <a href={provider.docs} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-ink hover:underline mb-4">
        Where to find your {provider.name} keys <ExternalLink size={13} aria-hidden="true" />
      </a>

      <label className="flex items-center justify-between gap-3 rounded-lg border border-app-border px-3 py-3 mb-4">
        <span>
          <span className="block text-sm font-medium text-ink">Test mode</span>
          <span className="block text-xs text-ink-muted">Use the gateway's test (sandbox) keys — no real money moves. Checkout shows a "Test mode" tag.</span>
        </span>
        <Switch checked={testMode} onChange={setTestMode} disabled={!canEdit} />
      </label>

      <div className="flex flex-col gap-4">
        {provider.fields.map((f) => (
          <label key={f.key} className="block">
            <span className="block text-[13px] font-medium text-ink mb-1">{f.label}</span>
            {f.secret ? (
              <Input.Password
                autoComplete="off"
                placeholder={f.saved ? `Saved (${f.saved}) — leave empty to keep` : f.placeholder || ""}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                disabled={!canEdit}
              />
            ) : (
              <Input
                autoComplete="off"
                placeholder={f.placeholder || ""}
                value={values[f.key] ?? f.value}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                disabled={!canEdit}
              />
            )}
          </label>
        ))}
      </div>
      {provider.currencies && (
        <p className="text-xs text-ink-muted mt-4 mb-0">Takes payments in {provider.currencies.join(", ")}.</p>
      )}
      <Alert
        className="mt-4"
        type="info"
        showIcon
        icon={<ShieldCheck size={16} />}
        message="Your keys are checked with the gateway, then stored encrypted. They're never shown again or shared."
      />
    </Drawer>
  );
}

export function PaymentSettings({ initial, currency, canEdit }) {
  const { message } = App.useApp();
  const { confirmDialog } = useConfirmDialog();
  const [data, setData] = useState(initial);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(null);

  async function toggle(p, enabled) {
    setBusy(p.key);
    try {
      setData(await apiFetch(`/api/payments/${p.key}`, { method: "PATCH", body: { enabled } }));
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function toggleCod(enabled) {
    setBusy("cod");
    try {
      setData(await apiFetch("/api/payments/cod", { method: "PUT", body: { enabled } }));
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  function disconnect(p) {
    confirmDialog({
      title: `Disconnect ${p.name}?`,
      description: "Customers won't see it at checkout, and its saved keys are deleted. Past orders aren't affected.",
      okText: "Disconnect",
      danger: true,
      onConfirm: async () => setData(await apiFetch(`/api/payments/${p.key}`, { method: "DELETE" })),
    });
  }

  const online = data.providers.filter((p) => p.enabled).length;
  const nothing = !data.cod.enabled && online === 0;

  return (
    <div className="max-w-3xl flex flex-col gap-4">
      {nothing && <Alert type="warning" showIcon message="No payment method is on — customers can't place orders." />}

      <Card size="small" title="Online payments" extra={<span className="text-xs text-ink-muted">{online} active</span>}>
        <ul className="m-0 p-0 list-none divide-y divide-app-border">
          {data.providers.map((p) => {
            const unsupported = p.currencies && !p.currencies.includes(currency);
            return (
              <li key={p.key} className="flex flex-wrap items-center gap-3 py-3">
                <Mark k={p.key} />
                <div className="flex-1 min-w-[180px]">
                  <p className="m-0 text-sm font-medium text-ink flex items-center gap-2 flex-wrap">
                    {p.name}
                    {p.connected && <StatusBadge status={p.enabled ? "active" : "disabled"} label={p.enabled ? "On" : "Off"} />}
                    {p.connected && p.testMode && <Tag color="gold" className="!m-0">Test mode</Tag>}
                  </p>
                  <p className="m-0 text-xs text-ink-muted">{unsupported ? `Not available for ${currency} stores.` : p.blurb}</p>
                </div>
                <div className="flex items-center gap-2">
                  {p.connected ? (
                    <>
                      <Switch size="small" checked={p.enabled} loading={busy === p.key} disabled={!canEdit} onChange={(v) => toggle(p, v)} aria-label={`Accept ${p.name}`} />
                      <Button size="small" onClick={() => setEditing(p)}>
                        Manage
                      </Button>
                      {canEdit && <Button size="small" type="text" danger icon={<Trash2 size={13} aria-hidden="true" />} aria-label={`Disconnect ${p.name}`} onClick={() => disconnect(p)} />}
                    </>
                  ) : (
                    <Button size="small" type="primary" disabled={!canEdit || unsupported} onClick={() => setEditing(p)}>
                      Connect
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card size="small" title="Manual payments">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-md bg-app-bg flex items-center justify-center shrink-0 text-ink">
            <Banknote size={17} aria-hidden="true" />
          </span>
          <div className="flex-1">
            <p className="m-0 text-sm font-medium text-ink">Cash on delivery (COD)</p>
            <p className="m-0 text-xs text-ink-muted">Customers pay by cash or UPI when the order arrives. You mark it paid from the order page.</p>
          </div>
          <Switch checked={data.cod.enabled} loading={busy === "cod"} disabled={!canEdit} onChange={toggleCod} aria-label="Cash on delivery" />
        </div>
      </Card>

      <SetupDrawer provider={editing} open={Boolean(editing)} onClose={() => setEditing(null)} onSaved={setData} canEdit={canEdit} />
    </div>
  );
}

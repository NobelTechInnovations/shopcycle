"use client";

import { useCallback, useEffect, useState } from "react";
import { App, Alert, Button, Input, Modal, Select, Skeleton, Switch, Tag, Checkbox, Table } from "antd";
import { CheckCircle2, AlertTriangle, Send, KeyRound } from "lucide-react";
import { apiFetch } from "@/lib/api";

const STATUS_COLOR = { APPROVED: "green", PENDING: "blue", REJECTED: "red", PAUSED: "orange", DISABLED: "default" };

function Card({ title, note, extra, children }) {
  return (
    <section className="bg-app-surface border border-app-border rounded-[14px] shadow-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink m-0">{title}</h2>
          {note && <p className="text-[13px] text-ink-muted mt-1 mb-0">{note}</p>}
        </div>
        {extra}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Check({ ok, text, fix }) {
  return (
    <li className="flex items-start gap-2 text-[13px]">
      {ok ? <CheckCircle2 size={16} className="text-status-success shrink-0 mt-0.5" aria-hidden="true" /> : <AlertTriangle size={16} className="text-status-warning shrink-0 mt-0.5" aria-hidden="true" />}
      <span>
        {text}
        {fix && <span className="block text-[12px] text-ink-muted">{fix}</span>}
      </span>
    </li>
  );
}

/** Getting the "System user" key from Meta — one action per step. */
const GUIDE = [
  {
    title: "Open your business settings",
    body: (
      <>
        Open{" "}
        <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noreferrer">
          Meta Business Settings ▸ System users
        </a>
        . If Meta asks, choose <b>Oyklane&apos;s business</b> — the one that owns the &ldquo;Oyklane Connect&rdquo; app and Oyklane&apos;s WhatsApp number.
      </>
    ),
  },
  {
    title: "Create a system user",
    body: (
      <>
        Click <b>Add</b>. Name it <b>Oyklane WhatsApp</b>, choose role <b>Admin</b>, click <b>Create system user</b>. (A system user is a robot login for your business — its key never expires, so messages keep going.)
      </>
    ),
  },
  {
    title: "Give it the app",
    body: (
      <>
        With <b>Oyklane WhatsApp</b> selected, click <b>Assign assets</b> ▸ <b>Apps</b> ▸ tick <b>Oyklane Connect</b> ▸ turn on <b>Full control</b> ▸ <b>Assign</b>.
      </>
    ),
  },
  {
    title: "Give it the WhatsApp account",
    body: (
      <>
        Click <b>Assign assets</b> again ▸ <b>WhatsApp accounts</b> ▸ tick Oyklane&apos;s WhatsApp account (the one with the number Oyklane will send from) ▸ <b>Full control</b> ▸ <b>Assign</b>.
      </>
    ),
  },
  {
    title: "Generate the key",
    body: (
      <>
        Click <b>Generate token</b>. App: <b>Oyklane Connect</b>. Expiry: <b>Never</b>. Permissions — tick these two:
        <span className="block mt-1">
          <code>whatsapp_business_management</code> and <code>whatsapp_business_messaging</code>
        </span>
        Click <b>Generate token</b>, then <b>Copy</b>. Meta shows it only once.
      </>
    ),
  },
  { title: "Paste it here", body: <>Back here, click <b>Connect</b>, paste the key, then pick the WhatsApp number and click <b>Activate</b>.</> },
];

function TokenGuide() {
  return (
    <ol className="list-none p-0 m-0 flex flex-col gap-3">
      {GUIDE.map((g, i) => (
        <li key={g.title} className="flex gap-3">
          <span className="w-6 h-6 rounded-full bg-accent-soft text-accent text-[12px] font-semibold grid place-items-center shrink-0">{i + 1}</span>
          <span className="text-[13px] text-ink min-w-0">
            <b className="block">{g.title}</b>
            <span className="text-ink-muted">{g.body}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function OyklaneWhatsapp() {
  const { message } = App.useApp();
  const [st, setSt] = useState(null);
  const [tpl, setTpl] = useState(null);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [token, setToken] = useState("");
  const [wabas, setWabas] = useState(null);
  const [pick, setPick] = useState({});
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(null);
  const [testTo, setTestTo] = useState("");

  const load = useCallback(async () => {
    try {
      const s = await apiFetch("/api/super-admin/messaging/platform");
      setSt(s);
      if (s.phoneNumberId) setTpl(await apiFetch("/api/super-admin/messaging/platform/templates"));
    } catch (err) {
      message.error(err.message);
    }
  }, [message]);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (key, fn, ok) => {
    setBusy(key);
    try {
      const r = await fn();
      if (ok) message.success(ok);
      return r;
    } catch (err) {
      message.error(err.message);
      return null;
    } finally {
      setBusy(null);
    }
  };

  if (!st) return <Skeleton active />;
  const n = st.number;
  const kinds = tpl?.standard || {};
  const byName = Object.fromEntries((tpl?.templates || []).map((t) => [t.name, t]));
  const allInstalled = Object.values(kinds).every((k) => byName[k.name]) && byName[tpl?.otp];

  return (
    <div className="flex flex-col gap-5">
      <Card title="Meta app setup (once, for every store)" note="What Oyklane's Meta app needs so stores' WhatsApp works — read from Meta's own record of your app.">
        <ul className="list-none p-0 m-0 flex flex-col gap-2">
          {st.setup.map((c) => (
            <Check key={c.key} {...c} />
          ))}
        </ul>
        <p className="text-[12px] text-ink-muted mt-3 mb-0">
          Production events only arrive while the Meta app is <b>Live</b> (App dashboard ▸ Publish). In development mode Meta only sends its own test events.
        </p>
      </Card>

      <Card
        title="Oyklane's WhatsApp number"
        note="The default sender: stores without their own number send order updates from it, with the store's name in every message. A store that connects its own number sends from that instead."
        extra={
          <Button icon={<KeyRound size={14} aria-hidden="true" />} onClick={() => setTokenOpen(true)}>
            {st.source ? "Change" : "Connect"}
          </Button>
        }
      >
        {!st.source ? (
          <div className="flex flex-col gap-3">
            <p className="text-[13px] text-ink m-0">
              Not connected yet. Oyklane needs a <b>permanent key</b> from Meta to send from your WhatsApp number. It takes about 3 minutes, once:
            </p>
            <TokenGuide />
          </div>
        ) : (
          <div className="flex flex-col gap-2 text-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <b>{n?.label || st.phoneNumberId}</b>
              {n && <Tag color={n.ready ? "green" : "gold"}>{n.ready ? "Live" : n.action === "activate" ? "Needs activating" : "Needs attention"}</Tag>}
              {n?.test && <Tag color="orange">Meta test number</Tag>}
              {st.source === "env" && <Tag>From Railway variables</Tag>}
              {st.subscribed === false && <Tag color="gold">Not receiving replies</Tag>}
            </div>
            {n?.problems?.map((p) => (
              <p key={p} className="m-0 text-status-warning">{p}</p>
            ))}
            {n?.test && <p className="m-0 text-ink-muted">Test numbers only reach the few phones listed in the Meta app ▸ WhatsApp ▸ API Setup. Connect Oyklane&apos;s real number for real customers.</p>}
            {st.numberError && <p className="m-0 text-status-danger">{st.numberError}</p>}
            {(n?.action === "activate" || st.subscribed === false) && (
              <Button className="self-start" type="primary" onClick={() => setPinOpen(true)}>
                Activate number
              </Button>
            )}
          </div>
        )}
      </Card>

      {st.phoneNumberId && (
        <Card
          title="Standard templates on Oyklane's account"
          note="Order confirmed, shipped and delivered (Utility) and the login code (Authentication). Meta reviews each — usually minutes, up to a day."
          extra={
            !allInstalled && (
              <Button type="primary" loading={busy === "install"} onClick={() => run("install", () => apiFetch("/api/super-admin/messaging/platform/templates/install", { method: "POST" }), "Sent to Meta for review").then(load)}>
                Install them
              </Button>
            )
          }
        >
          <Table
            size="small"
            rowKey="name"
            pagination={false}
            dataSource={[...Object.values(kinds).map((k) => ({ name: k.name, label: k.label })), { name: tpl?.otp, label: "Login code" }].filter((r) => r.name)}
            columns={[
              { title: "Template", render: (_, r) => <span><b>{r.label}</b> <span className="text-ink-muted text-[12px]">{r.name}</span></span> },
              { title: "Status", render: (_, r) => (byName[r.name] ? <Tag color={STATUS_COLOR[byName[r.name].status]}>{byName[r.name].status.toLowerCase()}</Tag> : <Tag>not installed</Tag>) },
              { title: "", render: (_, r) => (byName[r.name]?.fix ? <span className="text-[12px] text-status-danger">{byName[r.name].fix}</span> : null) },
            ]}
          />
        </Card>
      )}

      {st.phoneNumberId && (
        <Card title="Default order updates for stores" note="Stores that haven't chosen for themselves follow this. Each store can turn them off (or on) in WhatsApp ▸ Settings. Messages from Oyklane's number are billed by Meta to Oyklane's WhatsApp account.">
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2 text-[13px] font-medium">
              <Switch
                checked={st.notifications.enabled}
                onChange={(enabled) => run("notif", () => apiFetch("/api/super-admin/messaging/platform/notifications", { method: "PUT", body: { ...st.notifications, enabled } }), "Saved").then((s) => s && setSt(s))}
              />
              Send order updates on WhatsApp by default
            </label>
            <div className="flex flex-wrap gap-4">
              {Object.entries(kinds).map(([k, v]) => (
                <Checkbox
                  key={k}
                  checked={st.notifications.events?.[k] !== false}
                  onChange={(e) => run("notif", () => apiFetch("/api/super-admin/messaging/platform/notifications", { method: "PUT", body: { enabled: st.notifications.enabled, events: { orderConfirmed: true, shipped: true, delivered: true, ...st.notifications.events, [k]: e.target.checked } } })).then((s) => s && setSt(s))}
                >
                  {v.label}
                </Checkbox>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="+91 98765 43210" className="!w-[200px]" aria-label="Send a test to" />
              <Button icon={<Send size={14} aria-hidden="true" />} disabled={!testTo} loading={busy === "test"} onClick={() => run("test", () => apiFetch("/api/super-admin/messaging/platform/test", { method: "POST", body: { to: testTo } }), "Test sent")}>
                Send a test order update
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Modal
        title="Connect Oyklane's WhatsApp number"
        open={tokenOpen}
        onCancel={() => {
          setTokenOpen(false);
          setWabas(null);
          setToken("");
        }}
        footer={null}
        width={620}
      >
        {!wabas ? (
          <div className="flex flex-col gap-3">
            <details className="rounded-lg border border-app-border p-3">
              <summary className="cursor-pointer text-[13px] font-medium">Where do I get this key?</summary>
              <div className="mt-3">
                <TokenGuide />
              </div>
            </details>
            <label className="text-[13px] font-medium" htmlFor="oy-wa-token">
              Paste the key (it starts with <code>EAA</code> and is very long)
            </label>
            <Input.TextArea id="oy-wa-token" rows={4} value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck={false} placeholder="EAA…" />
            <p className="text-[12px] text-ink-muted m-0">Stored encrypted. Nobody can see it again here — not even you.</p>
            <Button type="primary" className="self-end" loading={busy === "token"} disabled={token.trim().length < 40} onClick={() => run("token", () => apiFetch("/api/super-admin/messaging/platform/token", { method: "POST", body: { token } })).then((r) => r && setWabas(r.wabas))}>
              Continue
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Select
              placeholder="WhatsApp Business account"
              value={pick.wabaId}
              onChange={(wabaId) => setPick({ wabaId })}
              options={wabas.map((w) => ({ value: w.id, label: `${w.name} — ${w.phoneNumbers.length} number${w.phoneNumbers.length === 1 ? "" : "s"}` }))}
            />
            {pick.wabaId && (
              <Select
                placeholder="Phone number"
                value={pick.phoneNumberId}
                onChange={(phoneNumberId) => setPick((p) => ({ ...p, phoneNumberId }))}
                options={(wabas.find((w) => w.id === pick.wabaId)?.phoneNumbers || []).map((x) => ({ value: x.id, label: `${x.label}${x.ready ? "" : " — needs activating"}` }))}
                notFoundContent={wabas.find((w) => w.id === pick.wabaId)?.problem}
              />
            )}
            <Button
              type="primary"
              className="self-end"
              disabled={!pick.phoneNumberId}
              loading={busy === "number"}
              onClick={() =>
                run("number", () => apiFetch("/api/super-admin/messaging/platform/number", { method: "POST", body: pick }), "Saved").then((s) => {
                  if (!s) return;
                  setSt(s);
                  setTokenOpen(false);
                  setWabas(null);
                  setToken("");
                  load();
                })
              }
            >
              Use this number
            </Button>
          </div>
        )}
      </Modal>

      <Modal
        title="Activate Oyklane's number"
        open={pinOpen}
        onCancel={() => setPinOpen(false)}
        okText="Activate"
        confirmLoading={busy === "pin"}
        okButtonProps={{ disabled: !/^\d{6}$/.test(pin) }}
        onOk={() =>
          run("pin", () => apiFetch("/api/super-admin/messaging/platform/activate", { method: "POST", body: { pin } }), "Activated").then((s) => {
            if (s) {
              setSt(s);
              setPinOpen(false);
              setPin("");
            }
          })
        }
      >
        <p className="text-[13px]">The number&apos;s 6-digit two-step verification PIN (WhatsApp Manager ▸ Phone numbers ▸ Settings ▸ Two-step verification). If it has none yet, this sets it.</p>
        <Input.OTP length={6} value={pin} onChange={setPin} mask />
      </Modal>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Button, Modal, Input, App, Alert, Tag, Skeleton } from "antd";
import { CheckCircle2, AlertTriangle, Check, CheckCheck, Clock, XCircle, ExternalLink } from "lucide-react";
import { apiFetch } from "@/lib/api";

/** Delivery state of an outgoing message, as WhatsApp shows it. */
export function Ticks({ status, error }) {
  if (status === "failed")
    return (
      <span title={error || "Not delivered"} className="inline-flex text-status-danger">
        <XCircle size={13} aria-label="Not delivered" />
      </span>
    );
  if (status === "read") return <CheckCheck size={14} className="text-sky-500" aria-label="Read" />;
  if (status === "delivered") return <CheckCheck size={14} className="text-ink-muted" aria-label="Delivered" />;
  if (status === "sent") return <Check size={14} className="text-ink-muted" aria-label="Sent" />;
  return <Clock size={12} className="text-ink-muted" aria-label="Sending" />;
}

const STATUS_COLOR = { APPROVED: "green", PENDING: "blue", IN_APPEAL: "blue", REJECTED: "red", PAUSED: "orange", DISABLED: "default", LIMIT_EXCEEDED: "orange" };
export function TemplateStatus({ status }) {
  const label = { APPROVED: "Approved", PENDING: "In review", REJECTED: "Rejected", PAUSED: "Paused by Meta", DISABLED: "Disabled", IN_APPEAL: "Appealed" }[status] || status;
  return <Tag color={STATUS_COLOR[status] || "default"}>{label}</Tag>;
}

/** WhatsApp-style bubble preview of a template (or a message). */
export function WaPreview({ header, body, footer, buttons = [], values = [] }) {
  const fill = (t) => String(t || "").replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => values[Number(n) - 1] || `{{${n}}}`);
  return (
    <div className="rounded-xl p-3" style={{ background: "#e5ddd5" }}>
      <div className="bg-white rounded-lg shadow-sm max-w-[320px] overflow-hidden text-[13.5px] leading-snug">
        {header?.type && header.type !== "none" && header.type !== "text" && (
          <div className="bg-gray-200 h-32 grid place-items-center text-xs text-gray-500 uppercase tracking-wide">{header.type}</div>
        )}
        <div className="px-2.5 pt-2 pb-1">
          {header?.type === "text" && header.text && <p className="font-semibold m-0 mb-1">{fill(header.text)}</p>}
          <p className="m-0 whitespace-pre-wrap break-words">{fill(body) || <span className="text-gray-400">Your message appears here</span>}</p>
          {footer && <p className="m-0 mt-1 text-[11.5px] text-gray-500">{footer}</p>}
          <p className="m-0 text-right text-[10.5px] text-gray-400">12:00</p>
        </div>
        {buttons.length > 0 && (
          <div className="border-t border-gray-100">
            {buttons.map((b, i) => (
              <div key={i} className="text-center text-sky-600 text-[13px] py-2 border-b border-gray-100 last:border-b-0">
                {b.type === "COPY_CODE" ? "Copy code" : b.text || "Button"}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** "Connection health": every check, with what to do when one fails, and
 * "Activate number" when the number isn't on the Cloud API yet. */
export function HealthCard({ compact = false, onChange }) {
  const { message } = App.useApp();
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setHealth(await apiFetch("/api/whatsapp/health"));
    } catch (err) {
      setError(err.message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function activate() {
    setBusy(true);
    try {
      setHealth(await apiFetch("/api/whatsapp/activate", { method: "POST", body: { pin } }));
      message.success("Your number is active");
      setPinOpen(false);
      setPin("");
      onChange?.();
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <Alert type="error" showIcon message="Couldn't check your WhatsApp connection" description={error} action={<Button size="small" onClick={load}>Retry</Button>} />;
  if (!health) return compact ? null : <Card size="small"><Skeleton active paragraph={{ rows: 2 }} /></Card>;
  const failing = health.checks.filter((c) => !c.ok);
  const canActivate = health.number?.action === "activate" || (health.subscribed === false && health.number);
  if (compact && !failing.length) return null;

  const body = (
    <>
      <ul className="list-none p-0 m-0 flex flex-col gap-2">
        {health.checks.map((c) => (
          <li key={c.key} className="flex items-start gap-2 text-sm">
            {c.ok ? <CheckCircle2 size={16} className="text-status-success shrink-0 mt-0.5" aria-hidden="true" /> : <AlertTriangle size={16} className="text-status-warning shrink-0 mt-0.5" aria-hidden="true" />}
            <span>
              {c.text}
              {c.fix && <span className="block text-xs text-ink-muted">{c.fix}</span>}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2 mt-3">
        {canActivate && (
          <Button type="primary" onClick={() => setPinOpen(true)}>
            Activate number
          </Button>
        )}
        {health.wabaId && (
          <Button icon={<ExternalLink size={13} aria-hidden="true" />} href={`https://business.facebook.com/wa/manage/phone-numbers/?waba_id=${health.wabaId}`} target="_blank" rel="noreferrer">
            WhatsApp Manager
          </Button>
        )}
        <Button onClick={load}>Check again</Button>
      </div>
      {health.number && (
        <p className="text-xs text-ink-muted mt-3 mb-0">
          {health.number.label}
          {health.number.quality ? ` · quality ${health.number.quality.toLowerCase()}` : ""}
          {health.number.limitTier ? ` · daily limit ${health.number.limitTier.replace("TIER_", "").replace("UNLIMITED", "unlimited")} customers` : ""}
        </p>
      )}
    </>
  );

  return (
    <>
      {compact ? (
        <Alert type="warning" showIcon message={failing[0].text} description={body} />
      ) : (
        <Card size="small" title="Connection health">
          {body}
        </Card>
      )}
      <Modal title="Activate your number" open={pinOpen} onCancel={() => setPinOpen(false)} onOk={activate} confirmLoading={busy} okText="Activate" okButtonProps={{ disabled: !/^\d{6}$/.test(pin) }}>
        <p className="text-sm">
          Enter the number&apos;s 6-digit two-step verification PIN. If it doesn&apos;t have one yet, the PIN you enter becomes it. Forgot it? Reset it in WhatsApp Manager ▸
          Phone numbers ▸ Settings ▸ Two-step verification.
        </p>
        <Input.OTP length={6} value={pin} onChange={setPin} mask />
        <p className="text-xs text-ink-muted mt-3 mb-0">This also lets Oyklane receive your customers&apos; messages and delivery updates.</p>
      </Modal>
    </>
  );
}

export const relTime = (d) => {
  if (!d) return "";
  const t = new Date(d);
  const diff = (Date.now() - t.getTime()) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400 && new Date().toDateString() === t.toDateString()) return t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (diff < 7 * 86400) return t.toLocaleDateString([], { weekday: "short" });
  return t.toLocaleDateString([], { day: "numeric", month: "short" });
};

export const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

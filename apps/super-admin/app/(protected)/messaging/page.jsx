"use client";

import { useEffect, useState } from "react";
import { App, Button, Form, Input, Skeleton, Switch, Table, Tag } from "antd";
import { MessageCircle, Send } from "lucide-react";
import { PageHeader, EmptyState, StatusBadge, useHasMounted } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

const PROVIDERS = { zoho: "Zoho CPaaS", meta: "Meta WhatsApp Cloud", twilio: "Twilio", log: "Off — codes are only logged" };
const COMING = [
  { label: "Order confirmed", hint: "Order number, total and a link to track it." },
  { label: "Shipped", hint: "Courier and tracking number." },
  { label: "Delivered", hint: "With a link to leave a review." },
];

function when(iso) {
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
}

function Section({ title, note, extra, children }) {
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

function Row({ label, ok, value, missing }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-app-border last:border-0">
      <span className="text-[13px] text-ink-muted">{label}</span>
      <span className="text-[13px] text-ink text-right">
        {ok ? value : <span className="text-status-danger">{missing}</span>}
      </span>
    </div>
  );
}

/**
 * The WhatsApp templates every store shares. A template is approved once in
 * Zoho CPaaS; here it's matched to the message the platform sends. The
 * server only holds the Zoho account and the sending number.
 */
export default function MessagingPage() {
  const mounted = useHasMounted();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    apiFetch("/api/super-admin/messaging")
      .then((d) => {
        setData(d);
        form.setFieldsValue(d.templates);
      })
      .catch((err) => message.error(err.message));
  }, [form, message]);

  async function save(values) {
    setSaving(true);
    try {
      const saved = await apiFetch("/api/super-admin/messaging/templates", { method: "PUT", body: values });
      setData((d) => ({ ...d, ...saved }));
      form.setFieldsValue(saved.templates);
      message.success("Templates saved — stores use them within a minute");
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      const r = await apiFetch("/api/super-admin/messaging/test", { method: "POST", body: { to: testTo } });
      setData((d) => ({ ...d, recent: r.recent }));
      if (r.status === "sent") message.success(`Test code sent to ${r.to} — check WhatsApp`);
      else message.error(r.error ? `Zoho refused it: ${r.error}` : "The code wasn't sent");
    } catch (err) {
      message.error(err.message);
    } finally {
      setTesting(false);
    }
  }

  if (!mounted || !data) return <Skeleton active paragraph={{ rows: 8 }} />;
  const { status, types, recent } = data;
  const otp = types.otp;
  const live = status.provider !== "log";

  return (
    <div>
      <PageHeader title="Messaging" subtitle="WhatsApp messages every store sends to its shoppers" />
      <div className="flex flex-col gap-5">
        <Section title="WhatsApp connection" note="The account and the sending number live on the server (Railway variables), not here.">
          <Row label="Zoho account" ok={status.zohoAccount} value="Connected" missing="Missing — set ZOHO_CPAAS_TOKEN" />
          <Row label="Sending number" ok={Boolean(status.from)} value={status.from} missing="Missing — set ZOHO_WHATSAPP_FROM" />
          <Row
            label="Codes go out through"
            ok
            value={live ? <Tag color="green" className="!m-0">{PROVIDERS[status.provider] || status.provider}</Tag> : <Tag className="!m-0">{PROVIDERS.log}</Tag>}
          />
          {status.forced === "log" && (
            <p className="text-[12px] text-ink-muted mt-2 mb-0">WHATSAPP_PROVIDER=log on this server keeps every code local (development).</p>
          )}
        </Section>

        <Form form={form} layout="vertical" requiredMark={false} onFinish={save}>
          <Section
            title={otp.label}
            note={otp.hint}
            extra={
              <Form.Item name={["otp", "enabled"]} valuePropName="checked" className="!mb-0">
                <Switch checkedChildren="On" unCheckedChildren="Off" />
              </Form.Item>
            }
          >
            <div className="grid gap-x-5 md:grid-cols-2">
              <Form.Item
                name={["otp", "templateKey"]}
                label="Zoho template key"
                extra={
                  status.otpTemplateFrom === "env" && !data.templates.otp.templateKey
                    ? "Empty here, so the server's ZOHO_WHATSAPP_TEMPLATE_KEY is used."
                    : "Zoho CPaaS ▸ WhatsApp ▸ Templates — the approved template's key."
                }
              >
                <Input placeholder="e.g. 2d3a…" autoComplete="off" spellCheck={false} />
              </Form.Item>
              {otp.vars.map((v) => (
                <Form.Item
                  key={v.key}
                  name={["otp", "vars", v.key]}
                  label={`Placeholder for ${v.label.toLowerCase()}`}
                  extra={`The variable name inside the template — we fill it with e.g. ${v.example}.`}
                  rules={[{ required: true, message: "Enter the placeholder name" }]}
                >
                  <Input placeholder={v.key} autoComplete="off" spellCheck={false} />
                </Form.Item>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2">
                <Input
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="+91 98765 43210"
                  inputMode="tel"
                  className="!w-[200px]"
                  aria-label="Send a test code to"
                  onPressEnter={() => testTo && sendTest()}
                />
                <Button icon={<Send size={14} aria-hidden="true" />} onClick={sendTest} loading={testing} disabled={!testTo || !live}>
                  Send test code
                </Button>
              </div>
              <Button type="primary" htmlType="submit" loading={saving}>
                Save
              </Button>
            </div>
          </Section>
        </Form>

        <Section title="Order & delivery updates" note="These come with the Phone Login app — stores that install it get them on WhatsApp.">
          <div className="grid gap-3 md:grid-cols-3">
            {COMING.map((c) => (
              <div key={c.label} className="rounded-[10px] border border-dashed border-app-border p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-ink">{c.label}</span>
                  <Tag className="!m-0">Coming soon</Tag>
                </div>
                <p className="text-[12px] text-ink-muted mt-1 mb-0">{c.hint}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Recent WhatsApp messages" note="The last ten, from every store. Numbers are masked.">
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            scroll={{ x: "max-content" }}
            dataSource={recent}
            columns={[
              { title: "To", dataIndex: "to", render: (v) => <span className="tabular-nums">{v}</span> },
              { title: "Status", render: (_, r) => <span title={r.error || undefined}><StatusBadge status={r.status} /></span> },
              { title: "Through", dataIndex: "provider", responsive: ["md"], render: (v) => PROVIDERS[v]?.split(" —")[0] || v },
              { title: "Problem", dataIndex: "error", responsive: ["lg"], render: (v) => (v ? <span className="text-[12px] text-status-danger">{v.slice(0, 120)}</span> : "—") },
              { title: "When", dataIndex: "createdAt", render: (v) => <span className="text-[13px] text-ink-muted tabular-nums">{when(v)}</span> },
            ]}
            locale={{ emptyText: <EmptyState icon={<MessageCircle />} title="No WhatsApp messages yet" description="Sign-in and checkout codes appear here." /> }}
          />
        </Section>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { App, Button, Form, Input, Select, Skeleton, Switch, Table, Tag } from "antd";
import { MessageCircle, Send } from "lucide-react";
import { PageHeader, EmptyState, StatusBadge, useHasMounted } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import OyklaneWhatsapp from "./OyklaneWhatsapp";

const PROVIDERS = { zoho: "Zoho CPaaS", meta: "Meta WhatsApp Cloud", oyklane: "Oyklane's WhatsApp number", apitxt: "APITXT", msg91: "MSG91", twilio: "Twilio", log: "Off — codes are only logged" };

/** What a provider's error usually means, in plain words. */
function explain(error) {
  const e = String(error || "");
  if (/429|resource limit|limit exhausted|rate limit/i.test(e)) return "Zoho's limit is used up: top up WhatsApp credits in Zoho CPaaS, and send from your real business number — Meta's +1 555 test number only reaches allow-listed phones.";
  if (/placeholder/i.test(e)) return "The template's placeholder name doesn't match — check it in Zoho ▸ Templates.";
  if (/template/i.test(e)) return "Zoho doesn't know that template key — copy it again from Zoho ▸ Templates (it must be approved).";
  if (/401|403|auth|token|unauthori/i.test(e)) return "Zoho refused the API key — paste a Zoho CPaaS key under WhatsApp connection (a ZeptoMail email key doesn't work for WhatsApp).";
  if (/number|recipient|invalid.*to/i.test(e)) return "Zoho refused the number — it must include the country code.";
  return null;
}
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
  const [smsTo, setSmsTo] = useState("");
  const [smsTesting, setSmsTesting] = useState(false);
  const [zohoForm] = Form.useForm();
  const [zohoSaving, setZohoSaving] = useState(false);

  useEffect(() => {
    apiFetch("/api/super-admin/messaging")
      .then((d) => {
        setData(d);
        form.setFieldsValue(d.templates);
        zohoForm.setFieldsValue({ enabled: d.zoho.enabled, from: d.zoho.from || "", region: d.zoho.region || "in", token: "" });
      })
      .catch((err) => message.error(err.message));
  }, [form, zohoForm, message]);

  async function saveZoho(values) {
    setZohoSaving(true);
    try {
      const r = await apiFetch("/api/super-admin/messaging/zoho", { method: "PUT", body: values });
      setData((d) => ({ ...d, zoho: r.zoho, status: r.status }));
      zohoForm.setFieldValue("token", "");
      message.success("Saved — every store uses it within a minute");
    } catch (err) {
      message.error(err.message);
    } finally {
      setZohoSaving(false);
    }
  }

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

  async function sendSmsTest() {
    setSmsTesting(true);
    try {
      const r = await apiFetch("/api/super-admin/messaging/test", { method: "POST", body: { to: smsTo, channel: "sms" } });
      setData((d) => ({ ...d, recent: r.recent }));
      if (r.status === "sent") message.success(`Test SMS code sent to ${r.to}`);
      else message.error(r.error ? `APITXT refused it: ${r.error}` : "The code wasn't sent");
    } catch (err) {
      message.error(err.message);
    } finally {
      setSmsTesting(false);
    }
  }

  if (!mounted || !data) return <Skeleton active paragraph={{ rows: 8 }} />;
  const { status, types, recent } = data;
  const otp = types.otp;
  const live = status.provider !== "log";

  return (
    <div>
      <PageHeader title="Messaging" subtitle="SMS and WhatsApp messages every store sends to its shoppers" />
      <div className="flex flex-col gap-5">
        <Section
          title="SMS sign-in codes"
          note={`Sent by Oyklane for every store with Phone Login or One-Click checkout. Each SMS is billed to the store whose shopper asked for it — ₹${Number(status.smsPrice ?? 0.5).toFixed(2)} per SMS, on its next bill.`}
        >
          <Row label="Codes go out through" ok value={status.sms !== "log" ? <Tag color="green" className="!m-0">{PROVIDERS[status.sms] || status.sms}</Tag> : <Tag className="!m-0">Off — set APITXT_AUTH_KEY on Railway</Tag>} />
          <div className="flex items-center gap-2 mt-3">
            <Input value={smsTo} onChange={(e) => setSmsTo(e.target.value)} placeholder="+91 98765 43210" inputMode="tel" className="!w-[200px]" aria-label="Send a test SMS code to" onPressEnter={() => smsTo && sendSmsTest()} />
            <Button icon={<Send size={14} aria-hidden="true" />} onClick={sendSmsTest} loading={smsTesting} disabled={!smsTo || status.sms === "log"}>
              Send test SMS
            </Button>
          </div>
          <p className="text-[12px] text-ink-muted mt-2 mb-0">A test isn&apos;t billed to any store (APITXT charges your wallet as usual).</p>
        </Section>

        <Section
          title="WhatsApp connection (Zoho CPaaS)"
          note="One Zoho account for every store's WhatsApp sign-in codes. When Oyklane's own WhatsApp number (below) has its login-code template approved, codes go from it instead, and Zoho is the backup. Any code WhatsApp can't deliver goes by SMS."
        >
          <Form form={zohoForm} layout="vertical" requiredMark={false} onFinish={saveZoho}>
            <div className="grid gap-x-5 md:grid-cols-3">
              <Form.Item
                name="token"
                label="Zoho CPaaS API key"
                extra={data.zoho.keySaved ? "Saved (encrypted). Leave empty to keep it." : data.zoho.envFallback.key ? "Empty here — the server's Railway key is used." : "Zoho CPaaS ▸ Settings ▸ API keys."}
              >
                <Input.Password placeholder={data.zoho.keySaved ? "•••••••• saved" : "Paste the key"} autoComplete="new-password" spellCheck={false} />
              </Form.Item>
              <Form.Item name="from" label="Sending number" extra={!data.zoho.from && data.zoho.envFallback.from ? `Empty here — ${data.zoho.envFallback.from} from Railway is used.` : "Your WhatsApp number in Zoho, with country code."}>
                <Input placeholder="+91 98765 43210" inputMode="tel" autoComplete="off" />
              </Form.Item>
              <Form.Item name="region" label="Zoho data centre">
                <Select options={[{ value: "in", label: "India (zoho.in)" }, { value: "com", label: "Global (zoho.com)" }, { value: "eu", label: "Europe (zoho.eu)" }]} />
              </Form.Item>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Form.Item name="enabled" valuePropName="checked" className="!mb-0">
                <Switch checkedChildren="Zoho on" unCheckedChildren="Zoho off" />
              </Form.Item>
              <span className="flex gap-2">
                {data.zoho.keySaved && (
                  <Button onClick={() => saveZoho({ ...zohoForm.getFieldsValue(), token: "", clearKey: true })} disabled={zohoSaving}>
                    Remove saved key
                  </Button>
                )}
                <Button type="primary" htmlType="submit" loading={zohoSaving}>
                  Save
                </Button>
              </span>
            </div>
          </Form>
          <Row label="Zoho key" ok={status.zohoAccount} value={status.zohoKeyFrom === "env" ? "From Railway" : "Saved here"} missing={status.zohoOff ? "Zoho is off" : "Missing — paste the API key"} />
          <Row label="Sending number" ok={Boolean(status.from)} value={status.from} missing="Missing — add the sending number" />
          <Row
            label="Codes go out through"
            ok
            value={live ? <Tag color="green" className="!m-0">{PROVIDERS[status.provider] || status.provider}</Tag> : <Tag className="!m-0">{PROVIDERS.log}</Tag>}
          />
          {status.testNumber && (
            <div className="mt-3 rounded-lg border border-[#F5D9A8] bg-[#FFF8EC] px-3 py-2.5 text-[12.5px] text-ink">
              <strong>{status.from} is Meta&rsquo;s test number.</strong> It can only message a few phones you&rsquo;ve allow-listed, with tight daily limits — shoppers won&rsquo;t get codes. In Zoho CPaaS ▸ WhatsApp ▸ Configuration choose <strong>Add number</strong>, verify your business number, then put it in Sending number above.
            </div>
          )}
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

        <OyklaneWhatsapp />

        <Section title="Recent messages" note="The last ten SMS and WhatsApp codes, from every store. Numbers are masked.">
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            scroll={{ x: "max-content" }}
            dataSource={recent}
            columns={[
              { title: "To", dataIndex: "to", render: (v) => <span className="tabular-nums">{v}</span> },
              { title: "By", dataIndex: "channel", render: (v) => <Tag className="!m-0">{v === "sms" ? "SMS" : "WhatsApp"}</Tag> },
              { title: "Status", render: (_, r) => <span title={r.error || undefined}><StatusBadge status={r.status} /></span> },
              { title: "Through", dataIndex: "provider", responsive: ["md"], render: (v) => PROVIDERS[v]?.split(" —")[0] || v },
              {
                title: "Problem",
                dataIndex: "error",
                responsive: ["lg"],
                render: (v) =>
                  v ? (
                    <span className="block max-w-[420px]">
                      <span className="text-[12px] text-status-danger">{v.slice(0, 120)}</span>
                      {explain(v) && <span className="block text-[12px] text-ink-muted mt-0.5">{explain(v)}</span>}
                    </span>
                  ) : (
                    "—"
                  ),
              },
              { title: "When", dataIndex: "createdAt", render: (v) => <span className="text-[13px] text-ink-muted tabular-nums">{when(v)}</span> },
            ]}
            locale={{ emptyText: <EmptyState icon={<MessageCircle />} title="No WhatsApp messages yet" description="Sign-in and checkout codes appear here." /> }}
          />
        </Section>
      </div>
    </div>
  );
}

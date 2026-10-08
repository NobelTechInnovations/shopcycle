"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { App, Alert, Button, Card, Form, Input, InputNumber, Skeleton, Switch, Tag } from "antd";
import { Lock, Send } from "lucide-react";
import { apiFetch } from "@/lib/api";

/**
 * Settings ▸ Notifications ▸ Your own email server (Pro plan): customer
 * emails go out through the seller's SMTP server, from their address.
 * Oyklane's own emails to the seller never use it.
 */
export function OwnEmailServer({ canEdit, storeName }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    apiFetch("/api/store/smtp")
      .then(setData)
      .catch((err) => message.error(err.message));
  }, [message]);

  if (!data) return <Skeleton active paragraph={{ rows: 3 }} />;

  if (!data.allowed) {
    return (
      <Card size="small" title={<span className="inline-flex items-center gap-2">Your own email server <Tag color="purple">Pro</Tag></span>}>
        <p className="m-0 text-[13px] text-ink-muted">
          Send order confirmations, shipping updates and every other customer email from your own address (Gmail, Zoho, Outlook or your domain&apos;s server), through your
          own SMTP. Part of the Pro plan.
        </p>
        <Link href="/admin/settings/billing">
          <Button className="mt-3" size="small" icon={<Lock size={13} aria-hidden="true" />}>
            See Pro plan
          </Button>
        </Link>
      </Card>
    );
  }

  const s = data.settings;
  async function save(values) {
    setSaving(true);
    try {
      setData(await apiFetch("/api/store/smtp", { method: "PUT", body: { ...values, port: Number(values.port) } }));
      form.setFieldValue("password", "");
      message.success(values.enabled ? "Connected — customer emails now go through your server" : "Saved — customer emails go through Oyklane");
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    try {
      await apiFetch("/api/store/smtp/test", { method: "POST", body: { to: testTo } });
      message.success(`Test email sent to ${testTo}`);
    } catch (err) {
      message.error(err.message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card size="small" title={<span className="inline-flex items-center gap-2">Your own email server <Tag color="purple">Pro</Tag></span>}>
      <p className="mt-0 text-[13px] text-ink-muted">
        Customer emails (orders, shipping, refunds, replies, sign-in codes) go out through your SMTP server, from your address. Emails Oyklane sends you stay with Oyklane.
        If your server ever fails, Oyklane sends the email instead, so customers never miss one.
      </p>
      {data.lastError && (
        <Alert
          className="mb-4"
          type="warning"
          showIcon
          message="Your server failed last time — Oyklane sent that email instead"
          description={`${data.lastError}${data.lastErrorAt ? ` (${new Date(data.lastErrorAt).toLocaleString("en-IN")})` : ""}`}
        />
      )}
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        disabled={!canEdit}
        initialValues={{ enabled: s?.enabled ?? true, host: s?.host || "", port: s?.port || 587, user: s?.user || "", fromEmail: s?.fromEmail || "", fromName: s?.fromName || storeName, password: "" }}
        onFinish={save}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4">
          <Form.Item className="sm:col-span-2" name="host" label="SMTP server" rules={[{ required: true, message: "Enter the server" }]} extra="Gmail: smtp.gmail.com · Zoho: smtp.zoho.in · Outlook: smtp.office365.com">
            <Input placeholder="smtp.gmail.com" autoComplete="off" />
          </Form.Item>
          <Form.Item name="port" label="Port" extra="587 or 465">
            <InputNumber className="!w-full" min={1} max={65535} />
          </Form.Item>
          <Form.Item name="user" label="Username" rules={[{ required: true, message: "Enter the username" }]}>
            <Input autoComplete="off" placeholder="orders@yourbrand.in" />
          </Form.Item>
          <Form.Item name="password" label="Password" className="sm:col-span-2" extra={s?.hasPassword ? "Saved — leave empty to keep it. For Gmail/Zoho use an app password." : "For Gmail and Zoho, create an app password."}>
            <Input.Password autoComplete="new-password" placeholder={s?.hasPassword ? "••••••••" : ""} />
          </Form.Item>
          <Form.Item name="fromEmail" label="Send from" rules={[{ required: true, type: "email", message: "Enter an email address" }]}>
            <Input placeholder="orders@yourbrand.in" />
          </Form.Item>
          <Form.Item name="fromName" label="Sender name" className="sm:col-span-2">
            <Input maxLength={80} />
          </Form.Item>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Form.Item name="enabled" valuePropName="checked" className="mb-0">
            <Switch checkedChildren="On" unCheckedChildren="Off" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>
            Save and check connection
          </Button>
        </div>
      </Form>
      {s?.hasPassword && (
        <div className="mt-4 pt-4 border-t border-app-border flex flex-wrap gap-2">
          <Input className="!w-64" placeholder="you@example.com" value={testTo} onChange={(e) => setTestTo(e.target.value)} disabled={!canEdit} />
          <Button icon={<Send size={14} aria-hidden="true" />} loading={testing} disabled={!canEdit || !testTo} onClick={test}>
            Send a test email
          </Button>
        </div>
      )}
    </Card>
  );
}

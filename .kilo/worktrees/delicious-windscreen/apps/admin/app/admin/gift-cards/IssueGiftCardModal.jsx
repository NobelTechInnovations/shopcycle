"use client";

import { useState } from "react";
import { Modal, Form, Input, InputNumber, Checkbox, Alert, Button, App } from "antd";
import { Gift, Copy, Check } from "lucide-react";
import { formatCurrency } from "@shopcycle/utils";
import { apiFetch } from "@/lib/api";

const PRESETS = [500, 1000, 2000, 5000];

/** Issues a card. The full code comes back once, in this response, and is
 * shown here to copy — it's never stored or shown again. */
export function IssueGiftCardModal({ open, onClose, onIssued, currency = "INR" }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [issued, setIssued] = useState(null);
  const [copied, setCopied] = useState(false);
  const recipientEmail = Form.useWatch("recipientEmail", form);

  function close() {
    if (issued) onIssued?.();
    setIssued(null);
    setCopied(false);
    form.resetFields();
    onClose();
  }

  async function submit(values) {
    setSaving(true);
    try {
      const result = await apiFetch("/api/gift-cards", {
        method: "POST",
        body: {
          ...values,
          expiresAt: values.expiresAt ? new Date(`${values.expiresAt}T23:59:59`).toISOString() : null,
          sendEmail: Boolean(values.sendEmail && values.recipientEmail),
        },
      });
      setIssued(result);
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(issued.code);
      setCopied(true);
    } catch {
      message.info("Select the code and copy it.");
    }
  }

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  return (
    <Modal
      open={open}
      onCancel={close}
      title={
        <span className="flex items-center gap-2">
          <Gift size={18} aria-hidden="true" /> {issued ? "Gift card issued" : "Issue gift card"}
        </span>
      }
      footer={
        issued ? (
          <Button type="primary" onClick={close}>
            Done
          </Button>
        ) : (
          <div className="flex justify-end gap-2">
            <Button onClick={close}>Cancel</Button>
            <Button type="primary" loading={saving} onClick={() => form.submit()}>
              Issue gift card
            </Button>
          </div>
        )
      }
      width={520}
      destroyOnHidden
    >
      {issued ? (
        <div className="flex flex-col gap-4 mt-3">
          <div className="rounded-xl border border-app-border bg-app-bg p-5 text-center">
            <p className="m-0 text-xs uppercase tracking-wider text-ink-muted">Gift card code</p>
            <p className="m-0 mt-2 font-mono text-xl font-semibold tracking-[0.12em] text-ink select-all break-all">{issued.code}</p>
            <p className="m-0 mt-2 text-sm text-ink-muted tabular-nums">{formatCurrency(issued.card.initialValue, issued.card.currency || currency)}</p>
            <Button className="mt-3" icon={copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />} onClick={copy}>
              {copied ? "Copied" : "Copy code"}
            </Button>
          </div>
          <Alert
            type="warning"
            showIcon
            message="Copy the code now"
            description="For security the full code is shown only once. Afterwards you'll see only its last 4 characters."
          />
          {issued.emailed === "sent" && <Alert type="success" showIcon message={`Emailed to ${issued.card.recipientEmail}.`} />}
          {issued.emailed === "logged" && (
            <Alert type="info" showIcon message="Email isn't set up yet, so it wasn't sent. Share the code with the customer yourself." />
          )}
          {issued.emailed === "failed" && <Alert type="error" showIcon message="The email couldn't be sent. Share the code with the customer yourself." />}
        </div>
      ) : (
        <Form form={form} layout="vertical" requiredMark={false} onFinish={submit} className="mt-3" initialValues={{ sendEmail: true }}>
          <Form.Item name="amount" label="Value" rules={[{ required: true, message: "Enter an amount" }]}>
            <InputNumber className="!w-full" min={1} max={1000000} prefix="₹" placeholder="1000" />
          </Form.Item>
          <div className="flex flex-wrap gap-2 -mt-3 mb-4">
            {PRESETS.map((v) => (
              <Button key={v} size="small" onClick={() => form.setFieldValue("amount", v)}>
                {formatCurrency(v, currency)}
              </Button>
            ))}
          </div>
          <Form.Item name="expiresAt" label="Expires" extra="Optional. Leave empty for a card that never expires.">
            <Input type="date" min={tomorrow} />
          </Form.Item>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            <Form.Item name="recipientName" label="Recipient name">
              <Input maxLength={120} />
            </Form.Item>
            <Form.Item name="recipientEmail" label="Recipient email" rules={[{ type: "email", message: "Enter a valid email" }]}>
              <Input maxLength={200} />
            </Form.Item>
          </div>
          {recipientEmail && (
            <>
              <Form.Item name="message" label="Message to the recipient">
                <Input.TextArea rows={2} maxLength={500} placeholder="Happy birthday!" />
              </Form.Item>
              <Form.Item name="sendEmail" valuePropName="checked">
                <Checkbox>Email the gift card to the recipient</Checkbox>
              </Form.Item>
            </>
          )}
          <Form.Item name="note" label="Internal note" extra="Only staff see this — e.g. why it was issued." className="mb-0">
            <Input maxLength={500} placeholder="Replacement for order #1003" />
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { App, Button, Card, Checkbox, Dropdown, Form, Input, Modal, Radio, Select } from "antd";
import { FileText, ExternalLink, Crown, MoreHorizontal, Ban, RefreshCw } from "lucide-react";
import { API_URL, apiFetch } from "@/lib/api";
import { INDIAN_STATES } from "@/lib/plans";

const GSTIN = /^[0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z][1-9A-Za-z][Zz][0-9A-Za-z]$/;
const day = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");

/** The seller's GST details — asked once, before their first invoice. */
function GstDetailsModal({ open, gst, onClose, onSaved }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const registered = Form.useWatch("gstRegistered", form);

  async function save(values) {
    setSaving(true);
    try {
      await apiFetch("/api/billing/details", { method: "PATCH", body: { ...values, gstin: values.gstRegistered ? values.gstin?.toUpperCase() : null } });
      await onSaved();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Your GST details"
      okText="Save and issue invoice"
      confirmLoading={saving}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
    >
      <p className="mt-0 text-[13px] text-ink-muted">Printed on every invoice. You only do this once — change them later in Settings ▸ Plan & billing ▸ Billing details.</p>
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={save}
        initialValues={{ gstRegistered: gst.registered ?? undefined, ...gst.details }}
      >
        <Form.Item name="gstRegistered" label="Are you registered under GST?" rules={[{ required: true, message: "Choose one" }]}>
          <Radio.Group
            options={[
              { value: true, label: "Yes — I have a GSTIN" },
              { value: false, label: "No" },
            ]}
          />
        </Form.Item>
        {registered === true && (
          <Form.Item name="gstin" label="GSTIN" rules={[{ required: true, pattern: GSTIN, message: "Enter your 15-character GSTIN, e.g. 08ABCDE1234F1Z5" }]}>
            <Input maxLength={15} placeholder="08ABCDE1234F1Z5" className="uppercase" />
          </Form.Item>
        )}
        {registered === false && <p className="-mt-2 mb-4 text-[12.5px] text-ink-muted">Your invoices will say “Invoice” (not “Tax invoice”) and show no GST split.</p>}
        <Form.Item name="billingName" label="Legal business name" extra="As on your GST registration or PAN. Leave empty to use your store name.">
          <Input maxLength={160} />
        </Form.Item>
        <Form.Item name="billingAddress" label="Business address" rules={[{ required: true, message: "Enter your business address" }]}>
          <Input.TextArea rows={3} maxLength={500} placeholder="Street, city, PIN code" />
        </Form.Item>
        <Form.Item name="billingState" label="State" rules={[{ required: true, message: "Choose your state" }]} extra="Orders to your own state get CGST + SGST; other states get IGST.">
          <Select showSearch placeholder="Select a state" options={INDIAN_STATES.map((s) => ({ value: s, label: s }))} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function CancelModal({ open, number, onClose, onDone }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  return (
    <Modal
      open={open}
      title={`Cancel invoice ${number}?`}
      okText="Cancel invoice"
      okButtonProps={{ danger: true }}
      cancelText="Keep it"
      confirmLoading={saving}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
    >
      <p className="mt-0 text-[13px] text-ink-muted">The cancelled invoice is kept (marked cancelled) and its number is never used again. Use this to fix wrong details on an invoice.</p>
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={{ reissue: true }}
        onFinish={async (values) => {
          setSaving(true);
          try {
            await onDone(values);
          } catch (err) {
            message.error(err.message);
          } finally {
            setSaving(false);
          }
        }}
      >
        <Form.Item name="reason" label="Reason" rules={[{ required: true, min: 3, message: "Say why — it's kept with the cancelled invoice" }]}>
          <Input maxLength={200} placeholder="e.g. Wrong buyer GSTIN" />
        </Form.Item>
        <Form.Item name="reissue" valuePropName="checked" className="mb-0">
          <Checkbox>Issue a new invoice with the next number</Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  );
}

/**
 * Order page ▸ GST invoice: issue (asking for the seller's GST details the
 * first time), view, cancel and issue a new one, and the cancelled ones.
 */
export function GstInvoiceCard({ order, hasGstInvoices, cancelled, canIssue, busy, run, openStatusPage, CardTitle }) {
  const [asking, setAsking] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const issue = () =>
    run("invoice", async () => {
      const { invoiceNumber } = await apiFetch(`/api/orders/${order.id}/invoice`, { method: "POST", body: {} });
      return invoiceNumber;
    }, "Invoice issued");

  function viewCancelled(id) {
    window.open(`${API_URL}/api/orders/${order.id}/invoices/cancelled/${id}`, "_blank", "noopener");
  }

  return (
    <Card size="small" title={<CardTitle icon={FileText}>{order.gst?.registered === false ? "Invoice" : "GST invoice"}</CardTitle>}>
      {order.invoiceNumber ? (
        <>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm m-0 font-medium text-ink">{order.invoiceNumber}</p>
              <p className="text-xs text-ink-muted m-0 mt-0.5">Issued {day(order.invoicedAt)}</p>
            </div>
            <Dropdown
              trigger={["click"]}
              menu={{
                items: [
                  { key: "cancel", danger: true, icon: <Ban size={14} aria-hidden="true" />, label: "Cancel invoice…", onClick: () => setCancelling(true) },
                  { key: "details", icon: <RefreshCw size={14} aria-hidden="true" />, label: "Edit my GST details", onClick: () => setAsking(true) },
                ],
              }}
            >
              <Button size="small" type="text" icon={<MoreHorizontal size={16} aria-hidden="true" />} aria-label="Invoice actions" />
            </Dropdown>
          </div>
          <Button className="mt-3" icon={<ExternalLink size={14} aria-hidden="true" />} onClick={() => openStatusPage("/invoice")}>
            View or print
          </Button>
        </>
      ) : hasGstInvoices ? (
        <>
          <p className="text-sm text-ink-muted m-0">
            {order.gst?.ready ? "Issued automatically when the order ships, or now if you need it sooner." : "Add your GST details once, then invoices are issued automatically when orders ship."}
          </p>
          <Button className="mt-3" loading={busy === "invoice"} disabled={!canIssue} onClick={() => (order.gst?.ready ? issue() : setAsking(true))}>
            Issue invoice
          </Button>
        </>
      ) : (
        <p className="text-sm text-ink-muted m-0">
          <Crown size={13} className="inline text-accent mr-1 -mt-0.5" aria-hidden="true" />
          GST invoices come with the Growth and Pro plans.{" "}
          <Link href="/admin/settings/billing" className="text-ink underline">
            See plans
          </Link>
        </p>
      )}

      {order.cancelledInvoices?.length > 0 && (
        <div className="mt-3 pt-3 border-t border-app-border">
          <p className="m-0 mb-1 text-[12px] text-ink-muted">Cancelled</p>
          {order.cancelledInvoices.map((c) => (
            <button key={c.id} type="button" onClick={() => viewCancelled(c.id)} className="block w-full text-left bg-transparent border-0 p-0 py-0.5 cursor-pointer text-[12.5px]">
              <span className="line-through text-ink">{c.number}</span>
              <span className="text-ink-muted">
                {" "}
                · {day(c.cancelledAt)}
                {c.reason ? ` · ${c.reason}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}

      <GstDetailsModal
        open={asking}
        gst={order.gst || { details: {} }}
        onClose={() => setAsking(false)}
        onSaved={async () => {
          setAsking(false);
          if (!order.invoiceNumber && !cancelled) await issue();
          else await run("details", async () => {}, "GST details saved");
        }}
      />
      <CancelModal
        open={cancelling}
        number={order.invoiceNumber}
        onClose={() => setCancelling(false)}
        onDone={async (values) => {
          setCancelling(false);
          await run("invoice", () => apiFetch(`/api/orders/${order.id}/invoice/cancel`, { method: "POST", body: values }), values.reissue ? "Cancelled — a new invoice was issued" : "Invoice cancelled");
        }}
      />
    </Card>
  );
}

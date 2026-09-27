"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, Form, Switch, InputNumber, Input, Button, Table, Modal, Skeleton, Alert, App } from "antd";
import { Mail, Eye } from "lucide-react";
import { StatusBadge } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { SettingsSectionHeader } from "../SettingsNav";

const TEMPLATE_LABEL = {
  order_confirmation: "Order confirmation",
  new_order_alert: "New order alert (to you)",
  shipping_update: "Shipping update",
  order_delivered: "Delivered",
  order_cancelled: "Order cancelled",
  refund_issued: "Refund",
  return_update: "Return update",
  sign_in_code: "Sign-in code",
  abandoned_checkout: "Abandoned checkout",
};

function when(iso) {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

function ToggleRow({ name, title, description, disabled }) {
  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b border-app-border last:border-0">
      <div className="min-w-0">
        <p className="m-0 text-sm font-medium text-ink">{title}</p>
        <p className="m-0 mt-0.5 text-[13px] text-ink-muted">{description}</p>
      </div>
      <Form.Item name={name} valuePropName="checked" className="!mb-0">
        <Switch disabled={disabled} aria-label={title} />
      </Form.Item>
    </div>
  );
}

/** Settings ▸ Notifications: which emails go out, the return window and
 * invoice numbering, and a log of every email sent for the store. */
export function NotificationSettings({ store, settings, canEdit, hasGstInvoices }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [emails, setEmails] = useState(null);
  const [emailTotal, setEmailTotal] = useState(0);
  const [providerConfigured, setProviderConfigured] = useState(true);
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState(null);

  const loadEmails = useCallback(async () => {
    const data = await apiFetch(`/api/email-log/store?page=${page}&pageSize=10`);
    setEmails(data.emails);
    setEmailTotal(data.total);
    setProviderConfigured(data.providerConfigured);
  }, [page]);

  useEffect(() => {
    loadEmails().catch(() => setEmails([]));
  }, [loadEmails]);

  async function save(values) {
    setSaving(true);
    try {
      await apiFetch("/api/store", {
        method: "PATCH",
        body: {
          settings: {
            notifications: { newOrderAlert: values.newOrderAlert, abandonedCheckout: values.abandonedCheckout },
            returnWindowDays: values.returnWindowDays,
            invoicePrefix: values.invoicePrefix,
            lowStockThreshold: values.lowStockThreshold,
          },
        },
      });
      message.success("Settings saved");
      setDirty(false);
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function view(row) {
    setViewing({ ...row, loading: true });
    try {
      const { email } = await apiFetch(`/api/email-log/store/${row.id}`);
      setViewing(email);
    } catch (err) {
      message.error(err.message);
      setViewing(null);
    }
  }

  const columns = [
    {
      title: "Email",
      render: (_, row) => (
        <div className="min-w-0">
          <div className="text-ink truncate max-w-[360px]">{row.subject}</div>
          <div className="text-xs text-ink-muted truncate">
            {TEMPLATE_LABEL[row.template] || row.template} · to {row.to}
          </div>
        </div>
      ),
    },
    { title: "Status", width: 140, render: (_, row) => <StatusBadge status={row.status} /> },
    { title: "Sent", responsive: ["md"], width: 140, render: (_, row) => <span className="text-[13px] text-ink-muted">{when(row.createdAt)}</span> },
    {
      title: "",
      width: 70,
      align: "right",
      render: (_, row) =>
        row.status === "logged" && !["sign_in_code", "gift_card"].includes(row.template) ? (
          <Button size="small" type="text" icon={<Eye size={14} aria-hidden="true" />} onClick={() => view(row)} aria-label={`Open ${row.subject}`}>
            Open
          </Button>
        ) : null,
    },
  ];

  const s = settings;
  return (
    <div className="flex flex-col gap-6">
      <SettingsSectionHeader title="Notifications" description="The emails your customers and your team get, and the rules around returns and invoices." />

      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        disabled={!canEdit}
        initialValues={{
          newOrderAlert: s.notifications.newOrderAlert,
          abandonedCheckout: s.notifications.abandonedCheckout,
          returnWindowDays: s.returnWindowDays,
          invoicePrefix: s.invoicePrefix,
          lowStockThreshold: s.lowStockThreshold,
        }}
        onValuesChange={() => setDirty(true)}
        onFinish={save}
        className="flex flex-col gap-6"
      >
        <Card size="small" title="Emails" styles={{ body: { paddingTop: 0, paddingBottom: 0 } }}>
          <div className="py-4 border-b border-app-border">
            <p className="m-0 text-sm font-medium text-ink">Always sent to customers</p>
            <p className="m-0 mt-0.5 text-[13px] text-ink-muted">
              Order confirmation, shipping and delivery updates, cancellations, refunds, return updates and sign-in codes. Each is sent from “{store.name}” with replies
              going to {store.supportEmail ? <strong className="text-ink font-medium">{store.supportEmail}</strong> : "your login email"} (
              <Link href="/admin/settings" className="underline">
                change
              </Link>
              ).
            </p>
          </div>
          <ToggleRow
            name="newOrderAlert"
            title="New order alerts"
            description={`Email ${store.supportEmail || "the store owner"} each time an order comes in.`}
            disabled={!canEdit}
          />
          <ToggleRow
            name="abandonedCheckout"
            title="Abandoned checkout reminders"
            description="One email, an hour after a shopper leaves checkout without ordering, with a link back to their cart."
            disabled={!canEdit}
          />
        </Card>

        <Card size="small" title="Returns, invoices and stock">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4">
            <Form.Item
              name="returnWindowDays"
              label="Return window"
              extra="Days after delivery a customer can request a return from their order page. 0 turns it off."
            >
              <InputNumber min={0} max={90} className="w-full" suffix="days" />
            </Form.Item>
            <Form.Item
              name="invoicePrefix"
              label="Invoice prefix"
              extra={hasGstInvoices ? "Invoices are numbered like INV-2627-0001." : "For GST invoices (Growth and Pro plans)."}
              rules={[{ pattern: /^[A-Za-z0-9]{1,5}$/, message: "1 to 5 letters or numbers" }]}
            >
              <Input maxLength={5} />
            </Form.Item>
            <Form.Item name="lowStockThreshold" label="Low stock at" extra="Inventory flags variants at or below this.">
              <InputNumber min={0} className="w-full" suffix="units" />
            </Form.Item>
          </div>
        </Card>

        {canEdit && (
          <div className="flex justify-end gap-2 -mt-2">
            <Button
              disabled={!dirty || saving}
              onClick={() => {
                form.resetFields();
                setDirty(false);
              }}
            >
              Discard
            </Button>
            <Button type="primary" htmlType="submit" loading={saving} disabled={!dirty}>
              Save
            </Button>
          </div>
        )}
      </Form>

      <Card
        size="small"
        title={
          <span className="flex items-center gap-2">
            <Mail size={16} className="text-ink-muted" aria-hidden="true" /> Email log
          </span>
        }
        styles={{ body: { padding: 0 } }}
      >
        {!providerConfigured && (
          <Alert
            className="m-4"
            type="info"
            showIcon
            message="No email provider is connected, so emails aren't sent — they're kept here instead. Open one to see exactly what the customer would get."
          />
        )}
        {emails === null ? (
          <div className="p-4">
            <Skeleton active paragraph={{ rows: 3 }} />
          </div>
        ) : (
          <Table
            rowKey="id"
            size="middle"
            scroll={{ x: "max-content" }}
            columns={columns}
            dataSource={emails}
            pagination={emailTotal > 10 && { current: page, pageSize: 10, total: emailTotal, onChange: setPage, showSizeChanger: false }}
            locale={{ emptyText: <p className="text-sm text-ink-muted py-6 m-0">No emails yet. They'll appear here as orders come in.</p> }}
          />
        )}
      </Card>

      <Modal open={Boolean(viewing)} onCancel={() => setViewing(null)} footer={null} width={680} title={viewing?.subject} destroyOnHidden>
        {viewing?.loading ? (
          <Skeleton active />
        ) : viewing?.html ? (
          <>
            <p className="text-xs text-ink-muted mt-1">To {viewing.to} · {when(viewing.createdAt)}</p>
            {/* sandbox="" — no scripts, no forms, no navigation from inside the preview. */}
            <iframe title="Email preview" sandbox="" srcDoc={viewing.html} className="w-full h-[560px] border border-app-border rounded-lg bg-white" />
          </>
        ) : (
          <p className="text-sm text-ink-muted">This email was sent through your email provider, so its content isn't stored here.</p>
        )}
      </Modal>
    </div>
  );
}

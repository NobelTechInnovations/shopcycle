"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { App, Button, DatePicker, Dropdown, Form, Input, InputNumber, Modal, Select, Skeleton, Switch, Table, Tabs } from "antd";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { StatusBadge } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { inr, STATUS, day, dateTime } from "@/lib/billing";

const KIND = { intro: "First month", regular: "Renewal", proration: "Upgrade", fees: "Checkout fees", reactivation: "Reactivation" };

function Field({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="m-0 mt-0.5 text-sm text-ink tabular-nums">{children}</dd>
    </div>
  );
}

/** The actions an operator can take, each with the form it needs. */
const ACTIONS = {
  "extend-trial": { title: "Extend the trial", ok: "Extend", fields: ["days", "reason"] },
  access: { title: "Grant temporary access", ok: "Grant access", fields: ["until", "reason"], help: "Full access to dashboard and storefront until this date, whatever the billing state." },
  "free-plan": {
    title: "Free plan — no monthly fee",
    ok: "Start free plan",
    fields: ["until", "note", "keepOpen"],
    help: "Every billing period that starts before this date costs ₹0 for the plan. Order commission (the plan's %) and paid apps are still billed on each cycle, as for every store. Unpaid plan charges from before are re-priced to ₹0.",
  },
  plan: { title: "Change plan", ok: "Change plan", fields: ["planId", "interval", "reason"], help: "Takes effect now, with no charge or proration." },
  promo: { title: "Promotional price", ok: "Save price", fields: ["price", "cycles", "note"], help: "A price before GST for the next renewals. Leave the price empty to remove the promotion." },
  suspend: { title: "Suspend for billing", ok: "Suspend", danger: true, fields: ["reason"], help: "Dashboard locked, storefront offline, checkout closed." },
  restore: { title: "Restore", ok: "Restore", fields: ["reason"], help: "Back to active. Anything unpaid is waived; a lapsed period gets a fresh month from today." },
  cancel: { title: "Cancel subscription now", ok: "Cancel now", danger: true, fields: ["reason"], help: "Ends it immediately: autopay cancelled, store offline." },
  entitlements: { title: "Grant a feature or limit", ok: "Grant", fields: ["key", "value", "expiresAt", "reason"] },
};

export default function SubscriptionDetailPage({ params }) {
  const { storeId } = use(params);
  const { message } = App.useApp();
  const [d, setD] = useState(null);
  const [plans, setPlans] = useState([]);
  const [features, setFeatures] = useState([]);
  const [action, setAction] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refund, setRefund] = useState(null);
  const [form] = Form.useForm();
  const keyValue = Form.useWatch("key", form);

  const load = useCallback(async () => {
    const [detail, matrix] = await Promise.all([apiFetch(`/api/super-admin/billing/subscriptions/${storeId}`), apiFetch("/api/super-admin/billing/plans")]);
    setD(detail);
    setPlans(matrix.plans);
    setFeatures(matrix.features);
  }, [storeId]);

  useEffect(() => {
    load().catch((err) => message.error(err.message));
  }, [load, message]);

  async function act(path, body, ok) {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/super-admin/billing/subscriptions/${storeId}${path}`, { method: "POST", body });
      if (res.detail) setD(res.detail);
      message.success(ok);
      return true;
    } catch (err) {
      message.error(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitAction(values) {
    const v = { ...values };
    if (v.until) v.until = v.until.toISOString();
    if (v.expiresAt) v.expiresAt = v.expiresAt.toISOString();
    if (action === "promo") {
      v.price = v.price === undefined || v.price === null ? null : v.price;
      v.cycles = v.cycles ?? null;
    }
    if (action === "entitlements") {
      const f = features.find((x) => x.key === v.key);
      if (f?.kind === "limit") v.key = `limit.${v.key}`;
      v.value = f?.kind === "limit" ? Number(v.value) : Boolean(v.value);
    }
    const done = await act(`/${action}`, v, `${ACTIONS[action].title} — done`);
    if (done) setAction(null);
  }

  if (!d) return <Skeleton active paragraph={{ rows: 8 }} />;
  const s = d.subscription;
  const st = STATUS[s.status] || { status: "draft", label: s.status };
  const chosen = action && ACTIONS[action];

  const menu = [
    { key: "remind", label: "Send a reminder now" },
    { key: "retry", label: "Retry the unpaid charge" },
    { key: "extend-trial", label: "Extend trial" },
    { key: "access", label: "Grant temporary access" },
    { key: "free-plan", label: s.freePlan ? "Change free plan" : "Free plan (no monthly fee)" },
    ...(s.freePlan ? [{ key: "end-free-plan", label: "End free plan" }] : []),
    { key: "plan", label: "Change plan" },
    { key: "promo", label: "Promotional price" },
    { key: "entitlements", label: "Grant feature or limit" },
    { type: "divider" },
    s.status === "SUSPENDED" ? { key: "restore", label: "Restore" } : { key: "suspend", label: "Suspend", danger: true },
    ...(s.status !== "ACTIVE" && s.status !== "SUSPENDED" ? [{ key: "restore", label: "Restore to active" }] : []),
    { key: "cancel", label: "Cancel now", danger: true },
  ];

  function onMenu({ key }) {
    if (key === "remind") return act("/remind", {}, "Reminder sent");
    if (key === "retry") return act("/retry", {}, "Charge sent to the bank");
    if (key === "end-free-plan") return act("/free-plan", { until: null }, "Free plan ended — the next renewal is at the plan price");
    form.resetFields();
    if (key === "plan") form.setFieldsValue({ planId: s.plan.id, interval: s.interval });
    if (key === "promo" && s.promo) form.setFieldsValue({ price: s.promo.price, cycles: s.promo.cyclesLeft, note: s.promo.note });
    if (key === "free-plan" && s.freePlan) form.setFieldsValue({ note: s.freePlan.note });
    setAction(key);
  }

  return (
    <div className="flex flex-col gap-5">
      <Link href="/billing/subscriptions" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink w-fit">
        <ArrowLeft size={15} aria-hidden="true" /> Subscriptions
      </Link>

      <div className="bg-app-surface border border-app-border rounded-[14px] shadow-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-xl font-semibold text-ink m-0">{d.store.name}</h2>
              <StatusBadge status={st.status} label={st.label} />
              {d.store.status === "suspended" && <StatusBadge status="suspended" label="Store suspended by platform" />}
            </div>
            <p className="text-[13px] text-ink-muted m-0 mt-1">
              {d.store.handle} · {d.store.owners.map((o) => o.email).join(", ")} · since {day(d.store.createdAt)}
            </p>
            <p className="text-[13px] text-ink m-0 mt-2">
              Dashboard {d.access.dashboard ? "open" : "locked"} · storefront {d.access.storefront ? "live" : "offline"} ({d.access.reason})
            </p>
          </div>
          <Dropdown menu={{ items: menu, onClick: onMenu }} trigger={["click"]}>
            <Button type="primary" loading={busy}>
              Actions <ChevronDown size={14} aria-hidden="true" />
            </Button>
          </Dropdown>
        </div>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 pt-4 border-t border-app-border m-0">
          <Field label="Plan">
            {s.plan.name} · {s.interval === "year" ? "yearly" : "monthly"} · {s.plan.commissionPercent}%
          </Field>
          <Field label="Trial">{s.trialEndsAt ? `ends ${day(s.trialEndsAt)}` : "—"}</Field>
          <Field label="Current period">{s.currentPeriodStart ? `${day(s.currentPeriodStart)} – ${day(s.currentPeriodEnd)}` : "—"}</Field>
          <Field label="Next charge">{d.next ? `${inr(d.next.total)} on ${day(d.next.date)}` : "—"}</Field>
          <Field label="Unpaid cycles">{s.consecutiveFailures}</Field>
          <Field label="Grace ends">{day(s.graceEndsAt)}</Field>
          <Field label="Access granted until">{day(s.accessGrantedUntil)}</Field>
          <Field label="Promotion">{s.promo ? `${inr(s.promo.price)} × ${s.promo.cyclesLeft ?? "∞"}` : "—"}</Field>
          <Field label="Free plan">{s.freePlan ? `until ${day(s.freePlan.until)} · commission only` : "—"}</Field>
          <Field label="Staff">
            {d.staff.used} / {d.staff.limit}
          </Field>
          <Field label="Fees to collect">{inr(d.fees.accrued.amount + d.fees.billed.amount)}</Field>
          <Field label="Razorpay customer">{s.providerCustomerId || "—"}</Field>
          <Field label="Billing state · GSTIN">
            {d.store.billingState || "—"} · {d.store.gstin || "—"}
          </Field>
        </dl>
      </div>

      <div className="bg-app-surface border border-app-border rounded-[14px] shadow-card px-4 pb-2">
        <Tabs
          items={[
            {
              key: "cycles",
              label: "Charges",
              children: (
                <Table
                  rowKey="id"
                  size="small"
                  dataSource={d.cycles}
                  pagination={false}
                  scroll={{ x: 800 }}
                  columns={[
                    { title: "Created", dataIndex: "dueAt", render: day },
                    { title: "What", dataIndex: "kind", render: (k) => KIND[k] || k },
                    { title: "Period", render: (_, c) => `${day(c.periodStart)} – ${day(c.periodEnd)}` },
                    { title: "Plan + fees", render: (_, c) => `${inr(c.planAmount)}${c.feesAmount ? ` + ${inr(c.feesAmount)}` : ""}${c.creditAmount ? ` − ${inr(c.creditAmount)}` : ""}` },
                    { title: "GST", dataIndex: "taxAmount", render: inr },
                    { title: "Total", dataIndex: "total", render: (v) => <strong>{inr(v)}</strong> },
                    { title: "Status", render: (_, c) => <StatusBadge status={c.status === "due" ? "pending" : c.status === "waived" ? "archived" : c.status === "void" ? "disabled" : c.status} label={c.status === "processing" ? "With bank" : undefined} /> },
                    {
                      title: "",
                      render: (_, c) =>
                        ["due", "failed"].includes(c.status) ? (
                          <Button size="small" onClick={() => act(`/cycles/${c.id}/waive`, { reason: "Waived by operator" }, "Charge waived")}>
                            Waive
                          </Button>
                        ) : null,
                    },
                  ]}
                />
              ),
            },
            {
              key: "payments",
              label: "Payments",
              children: (
                <Table
                  rowKey="id"
                  size="small"
                  dataSource={d.payments}
                  pagination={false}
                  scroll={{ x: 800 }}
                  columns={[
                    { title: "When", dataIndex: "createdAt", render: dateTime },
                    { title: "Type", dataIndex: "purpose" },
                    { title: "Amount", render: (_, p) => `${inr(p.amount)}${p.refundedAmount ? ` (−${inr(p.refundedAmount)})` : ""}` },
                    { title: "Status", render: (_, p) => <span className="flex flex-col"><StatusBadge status={p.status === "captured" ? "paid" : p.status} />{p.failureReason && <span className="text-xs text-ink-muted">{p.failureReason}</span>}</span> },
                    { title: "Razorpay", dataIndex: "providerPaymentId", render: (v) => <span className="font-mono text-xs">{v || "—"}</span> },
                    {
                      title: "",
                      render: (_, p) =>
                        ["captured", "partially_refunded"].includes(p.status) ? (
                          <Button size="small" onClick={() => setRefund({ ...p, value: Math.round((p.amount - p.refundedAmount) * 100) / 100 })}>
                            Refund
                          </Button>
                        ) : null,
                    },
                  ]}
                />
              ),
            },
            {
              key: "mandates",
              label: "Mandates",
              children: (
                <Table
                  rowKey="id"
                  size="small"
                  dataSource={d.mandates}
                  pagination={false}
                  scroll={{ x: 800 }}
                  columns={[
                    { title: "Created", dataIndex: "createdAt", render: day },
                    { title: "Method", render: (_, m) => `${m.methodLabel} · ${m.label}` },
                    { title: "Status", dataIndex: "status", render: (v) => <StatusBadge status={v === "active" ? "active" : v === "pending" ? "pending" : v} /> },
                    { title: "Mode", dataIndex: "livemode", render: (v) => (v ? "Live" : "Test") },
                    { title: "Activated", dataIndex: "activatedAt", render: day },
                    { title: "Cancelled", dataIndex: "cancelledAt", render: day },
                    { title: "Token", dataIndex: "providerTokenId", render: (v) => <span className="font-mono text-xs">{v || "—"}</span> },
                  ]}
                />
              ),
            },
            {
              key: "invoices",
              label: "Invoices",
              children: (
                <Table rowKey="id" size="small" dataSource={d.invoices} pagination={false} columns={[
                  { title: "Number", dataIndex: "number", render: (v) => <span className="font-mono text-xs">{v}</span> },
                  { title: "Issued", dataIndex: "issuedAt", render: day },
                  { title: "For", dataIndex: "kind" },
                  { title: "GST", dataIndex: "taxAmount", render: inr },
                  { title: "Total", dataIndex: "total", render: inr },
                ]} />
              ),
            },
            {
              key: "events",
              label: "History",
              children: (
                <Table rowKey="id" size="small" dataSource={d.events} pagination={{ pageSize: 20 }} scroll={{ x: 800 }} columns={[
                  { title: "When", dataIndex: "createdAt", render: dateTime },
                  { title: "Event", dataIndex: "type", render: (v) => <span className="font-mono text-xs">{v}</span> },
                  { title: "Status", render: (_, e) => (e.fromStatus && e.toStatus && e.fromStatus !== e.toStatus ? `${e.fromStatus} → ${e.toStatus}` : "") },
                  { title: "By", render: (_, e) => `${e.actorType}${e.actorId ? ` (${e.actorId.slice(0, 8)}…)` : ""}` },
                  { title: "Details", dataIndex: "data", render: (v) => <span className="text-xs text-ink-muted break-all">{JSON.stringify(v).slice(0, 160)}</span> },
                ]} />
              ),
            },
            {
              key: "failures",
              label: "Failures",
              children: (
                <Table rowKey="id" size="small" dataSource={d.failures} pagination={false} columns={[
                  { title: "When", dataIndex: "occurredAt", render: dateTime },
                  { title: "#", dataIndex: "failureNumber" },
                  { title: "Reason", dataIndex: "reason" },
                  { title: "Grace ends", dataIndex: "graceEndsAt", render: day },
                  { title: "Resolved", render: (_, f) => (f.resolvedAt ? `${day(f.resolvedAt)} (${f.resolution})` : "—") },
                ]} />
              ),
            },
            {
              key: "grants",
              label: "Grants",
              children: (
                <Table rowKey="id" size="small" dataSource={d.grants} pagination={false} columns={[
                  { title: "Key", dataIndex: "key", render: (v) => <span className="font-mono text-xs">{v}</span> },
                  { title: "Value", dataIndex: "value", render: (v) => String(v) },
                  { title: "Expires", dataIndex: "expiresAt", render: day },
                  { title: "Reason", dataIndex: "reason" },
                  { title: "", render: (_, g) => (g.revokedAt ? <span className="text-xs text-ink-muted">revoked {day(g.revokedAt)}</span> : (
                    <Button size="small" danger onClick={async () => {
                      try {
                        const res = await apiFetch(`/api/super-admin/billing/subscriptions/${storeId}/entitlements/${g.id}`, { method: "DELETE" });
                        setD(res.detail);
                        message.success("Grant revoked");
                      } catch (err) {
                        message.error(err.message);
                      }
                    }}>Revoke</Button>
                  )) },
                ]} />
              ),
            },
            {
              key: "notices",
              label: "Notices sent",
              children: (
                <Table rowKey="id" size="small" dataSource={d.notifications} pagination={{ pageSize: 15 }} columns={[
                  { title: "When", dataIndex: "createdAt", render: dateTime },
                  { title: "Notice", dataIndex: "title" },
                  { title: "Emailed", dataIndex: "emailed", render: (v) => (v ? "Yes" : "No") },
                ]} />
              ),
            },
          ]}
        />
      </div>

      <Modal open={Boolean(chosen)} title={chosen?.title} okText={chosen?.ok} okButtonProps={{ danger: chosen?.danger }} confirmLoading={busy} onCancel={() => setAction(null)} onOk={() => form.submit()} destroyOnHidden>
        {chosen?.help && <p className="text-sm text-ink-muted mt-2">{chosen.help}</p>}
        <Form form={form} layout="vertical" requiredMark={false} onFinish={submitAction} className="mt-3">
          {chosen?.fields.includes("days") && (
            <Form.Item name="days" label="Extra days" rules={[{ required: true }]} initialValue={3}>
              <InputNumber min={1} max={90} />
            </Form.Item>
          )}
          {chosen?.fields.includes("until") && (
            <Form.Item name="until" label="Until" rules={[{ required: true }]}>
              <DatePicker showTime />
            </Form.Item>
          )}
          {chosen?.fields.includes("planId") && (
            <div className="grid grid-cols-2 gap-3">
              <Form.Item name="planId" label="Plan" rules={[{ required: true }]}>
                <Select options={plans.map((p) => ({ value: p.id, label: p.name }))} />
              </Form.Item>
              <Form.Item name="interval" label="Billing">
                <Select options={[{ value: "month", label: "Monthly" }, { value: "year", label: "Yearly" }]} />
              </Form.Item>
            </div>
          )}
          {chosen?.fields.includes("price") && (
            <div className="grid grid-cols-2 gap-3">
              <Form.Item name="price" label="Price before GST (₹)">
                <InputNumber min={0} className="!w-full" />
              </Form.Item>
              <Form.Item name="cycles" label="For how many renewals" extra="Empty = every renewal">
                <InputNumber min={1} max={36} className="!w-full" />
              </Form.Item>
            </div>
          )}
          {chosen?.fields.includes("keepOpen") && (
            <Form.Item name="keepOpen" label="Keep the dashboard open even if a commission payment fails" valuePropName="checked" initialValue={false} extra="For your own store or a partner. Commission stays owed either way.">
              <Switch />
            </Form.Item>
          )}
          {chosen?.fields.includes("note") && (
            <Form.Item name="note" label="Note (shown to the seller)">
              <Input maxLength={200} />
            </Form.Item>
          )}
          {chosen?.fields.includes("key") && (
            <>
              <Form.Item name="key" label="Feature" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label" options={features.map((f) => ({ value: f.key, label: `${f.name}${f.kind === "limit" ? " (limit)" : ""}` }))} />
              </Form.Item>
              {features.find((f) => f.key === keyValue)?.kind === "limit" ? (
                <Form.Item name="value" label="Limit" rules={[{ required: true }]}>
                  <InputNumber min={0} max={10000} />
                </Form.Item>
              ) : (
                <Form.Item name="value" label="Enabled" valuePropName="checked" initialValue>
                  <Switch />
                </Form.Item>
              )}
              <Form.Item name="expiresAt" label="Expires (optional)">
                <DatePicker />
              </Form.Item>
            </>
          )}
          {chosen?.fields.includes("reason") && (
            <Form.Item name="reason" label="Reason (for the audit log)">
              <Input.TextArea rows={2} maxLength={500} />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        open={Boolean(refund)}
        title="Refund payment"
        okText="Refund through Razorpay"
        okButtonProps={{ danger: true }}
        confirmLoading={busy}
        onCancel={() => setRefund(null)}
        onOk={async () => {
          setBusy(true);
          try {
            const res = await apiFetch(`/api/super-admin/billing/subscriptions/${storeId}/payments/${refund.id}/refund`, { method: "POST", body: { amount: refund.value, reason: refund.reason } });
            setD(res.detail);
            message.success(`Refunded ${inr(res.result.refunded)}`);
            setRefund(null);
          } catch (err) {
            message.error(err.message);
          } finally {
            setBusy(false);
          }
        }}
        destroyOnHidden
      >
        {refund && (
          <div className="flex flex-col gap-3 mt-3">
            <p className="text-sm text-ink-muted m-0">Up to {inr(refund.amount - refund.refundedAmount)} can be refunded. This doesn't change the subscription.</p>
            <InputNumber min={0.01} max={refund.amount - refund.refundedAmount} value={refund.value} onChange={(v) => setRefund({ ...refund, value: v })} prefix="₹" className="!w-48" />
            <Input.TextArea rows={2} placeholder="Reason" value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} />
          </div>
        )}
      </Modal>
    </div>
  );
}

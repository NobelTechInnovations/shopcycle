"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Button, Form, Input, InputNumber, Select, Table, Modal, App, Skeleton, Segmented, Radio } from "antd";
import { AlertTriangle, ArrowRight, CalendarClock, Check, CreditCard, Receipt, Users } from "lucide-react";
import { StatusBadge, EmptyState } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { INDIAN_STATES } from "@/lib/plans";
import { inr, STATUS, METHODS, KIND_LABEL, PURPOSE_LABEL, formatDay, daysLeft, completeCheckout } from "@/lib/billing";
import { SettingsSectionHeader } from "./SettingsNav";
import { BillingModeNotice } from "@/components/BillingModeNotice";

function Stat({ label, value, sub }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-ink-muted m-0">{label}</p>
      <p className="text-[15px] font-semibold text-ink m-0 mt-0.5 tabular-nums truncate">{value}</p>
      {sub && <p className="text-xs text-ink-muted m-0 mt-0.5">{sub}</p>}
    </div>
  );
}

function Line({ label, value, strong }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 ${strong ? "border-t border-app-border mt-1 pt-2.5 font-semibold text-ink" : "text-[13px]"}`}>
      <span className={strong ? "" : "text-ink-muted"}>{label}</span>
      <span className="tabular-nums text-ink">{value}</span>
    </div>
  );
}

/** One sentence on where the subscription stands — from the engine's state. */
function describe(b) {
  const s = b.subscription;
  switch (s.status) {
    case "TRIALING":
      return b.mandateUsable
        ? `Free trial until ${formatDay(s.trialEndsAt)}. Autopay is on — your first payment is taken then.`
        : `Free trial until ${formatDay(s.trialEndsAt)} (${daysLeft(s.trialEndsAt)} days left). Turn on autopay before it ends to keep your dashboard open.`;
    case "ACTIVE":
      return `Renews on ${formatDay(s.nextBillingAt)}${b.mandateUsable ? " with autopay" : ""}.`;
    case "CANCEL_SCHEDULED":
      return `Cancelled — ${s.plan?.name} stays active until ${formatDay(s.currentPeriodEnd)}. Resume any time before then.`;
    case "GRACE_PERIOD":
      return `Your last payment failed. Pay by ${formatDay(s.graceEndsAt)} to keep your dashboard open — we'll also retry automatically.`;
    case "PAST_DUE":
      return `Payment overdue — your dashboard is paused, your store is still live. ${s.consecutiveFailures} of ${b.settings.maxConsecutiveFailures} unpaid cycles before it goes offline.`;
    case "PENDING_PAYMENT":
      return "Your trial has ended. Complete your subscription to unlock your dashboard.";
    case "SUSPENDED":
      return "Your store is offline because billing is unpaid. Pay now to bring it back.";
    case "EXPIRED":
      return "Your subscription has ended. Choose a plan to continue.";
    default:
      return "";
  }
}

export function BillingSettings() {
  const router = useRouter();
  const { message } = App.useApp();
  const [b, setB] = useState(null);
  const [lists, setLists] = useState({ invoices: [], payments: [], transactions: [], requests: [] });
  const [role, setRole] = useState(null);
  const [interval, setInterval] = useState("month");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(null);
  const [methodOpen, setMethodOpen] = useState(false);
  const [method, setMethod] = useState("upi");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [limitOpen, setLimitOpen] = useState(false);
  const [detailsForm] = Form.useForm();
  const [limitForm] = Form.useForm();

  const load = useCallback(async () => {
    const [overview, invoices, payments, commissions, requests, storeRes] = await Promise.all([
      apiFetch("/api/billing"),
      apiFetch("/api/billing/invoices?pageSize=12"),
      apiFetch("/api/billing/payments?pageSize=12"),
      apiFetch("/api/billing/commissions?pageSize=15"),
      apiFetch("/api/billing/limit-requests"),
      apiFetch("/api/store"),
    ]);
    setB(overview);
    setInterval((v) => (overview.subscription?.interval && !preview ? overview.subscription.interval : v));
    setLists({ invoices: invoices.invoices, payments: payments.payments, transactions: commissions.transactions, requests: requests.requests });
    setRole(storeRes.role);
    detailsForm.setFieldsValue(overview.billingDetails);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailsForm]);

  useEffect(() => {
    load().catch((err) => message.error(err.message));
  }, [load, message]);

  const run = async (key, fn, ok) => {
    setBusy(key);
    try {
      await fn();
      if (ok) message.success(ok);
      await load();
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  if (!b || !b.subscription) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton active paragraph={{ rows: 4 }} />
        <Skeleton active paragraph={{ rows: 3 }} />
      </div>
    );
  }

  const sub = b.subscription;
  const canManage = role && role !== "staff";
  const status = STATUS[sub.status] || { status: "draft", label: sub.status };
  const unpaid = ["PENDING_PAYMENT", "GRACE_PERIOD", "PAST_DUE", "SUSPENDED", "EXPIRED", "CANCELLED"].includes(sub.status);
  const pendingRequest = lists.requests.find((r) => r.status === "pending");
  const staffPct = b.staff.limit ? Math.min(100, Math.round((b.staff.used / b.staff.limit) * 100)) : 0;
  const month = b.fees.months.find((m) => m.month === b.fees.currentMonth);

  async function openPreview(plan) {
    setBusy(`preview-${plan.id}`);
    try {
      const res = await apiFetch("/api/billing/plan/preview", { method: "POST", body: { planId: plan.id, interval } });
      setPreview({ plan, ...res.preview });
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function confirmChange() {
    await run(
      "change",
      async () => {
        const res = await apiFetch("/api/billing/plan", { method: "POST", body: { planId: preview.planId, interval: preview.interval } });
        const r = res.result;
        message.success(
          r.type === "downgrade" ? `${preview.planName} starts on ${formatDay(r.effectiveDate)}` : r.type === "upgrade" ? `You're on ${preview.planName} — the difference is being charged to autopay` : `You're on ${preview.planName}`
        );
      }
    );
    setPreview(null);
  }

  async function changeMethod() {
    setBusy("method");
    try {
      const started = await apiFetch("/api/billing/mandate", { method: "POST", body: { method } });
      const done = await completeCheckout(apiFetch, started);
      if (done) {
        message.success("Payment method updated");
        setMethodOpen(false);
        await load();
      }
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingsSectionHeader
        title="Plan & billing"
        description={`Your Oyklane subscription, checkout fees and invoices. Prices are shown before ${b.settings.taxRate}% GST, which is added on each invoice.`}
      />
      <BillingModeNotice billing={b} />
      {!canManage && (
        <p className="text-[13px] text-ink-muted bg-app-surface border border-app-border rounded-lg px-4 py-2.5 m-0">Only the store owner or an admin can change the plan or pay.</p>
      )}

      {/* ── Subscription ── */}
      <Card styles={{ body: { padding: 24 } }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="text-[22px] font-semibold text-ink m-0" style={{ letterSpacing: "-0.02em" }}>
                {sub.plan?.name}
              </h3>
              <span className="text-sm text-ink-muted">{sub.interval === "year" ? "Yearly" : "Monthly"}</span>
              <StatusBadge status={status.status} label={status.label} />
            </div>
            <p className="text-sm text-ink-muted mt-1.5 mb-0 max-w-xl">{describe(b)}</p>
            {sub.pendingPlan && (
              <p className="text-[13px] text-ink mt-2 mb-0 inline-flex flex-wrap items-center gap-2">
                <CalendarClock size={14} aria-hidden="true" /> Switching to {sub.pendingPlan.name}
                {sub.pendingInterval && sub.pendingInterval !== sub.interval ? ` (${sub.pendingInterval === "year" ? "yearly" : "monthly"})` : ""} on {formatDay(sub.currentPeriodEnd)}.
                {canManage && (
                  <Button size="small" type="link" className="!p-0" loading={busy === "keep"} onClick={() => run("keep", () => apiFetch("/api/billing/plan/pending", { method: "DELETE" }), `You'll stay on ${sub.plan?.name}`)}>
                    Keep {sub.plan?.name}
                  </Button>
                )}
              </p>
            )}
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              {unpaid || (sub.status === "TRIALING" && !b.mandateUsable) ? (
                <Link href="/billing">
                  <Button type="primary" icon={<ArrowRight size={15} aria-hidden="true" />} iconPosition="end">
                    {sub.status === "TRIALING" ? "Turn on autopay" : b.due ? `Pay ${inr(b.due.total)}` : "Choose a plan"}
                  </Button>
                </Link>
              ) : sub.status === "CANCEL_SCHEDULED" ? (
                <Button type="primary" loading={busy === "resume"} onClick={() => run("resume", () => apiFetch("/api/billing/resume", { method: "POST" }), "Subscription resumed")}>
                  Resume subscription
                </Button>
              ) : null}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-5 border-t border-app-border">
          <Stat label={sub.status === "TRIALING" ? "Trial ends" : "Next payment"} value={formatDay(sub.status === "TRIALING" ? sub.trialEndsAt : sub.nextBillingAt)} sub={b.next ? `about ${inr(b.next.total)}` : null} />
          <Stat label="Current period" value={sub.currentPeriodStart ? `${formatDay(sub.currentPeriodStart)} – ${formatDay(sub.currentPeriodEnd)}` : "—"} />
          <Stat label="Checkout fee" value={`${sub.plan?.commissionPercent ?? "—"}% per order`} sub={b.entitlements?.features ? "on orders placed at checkout" : null} />
          <Stat label="Autopay" value={b.mandate ? b.mandate.label : "Not set up"} sub={b.mandate ? (b.mandate.status === "active" ? `since ${formatDay(b.mandate.activatedAt)}` : "waiting for your bank") : null} />
        </div>
        {sub.freePlan && (
          <p className="text-[13px] text-ink mt-4 mb-0 rounded-lg bg-accent-soft px-3 py-2">
            <strong>Free plan until {formatDay(sub.freePlan.until)}</strong> — no monthly plan fee. The {sub.plan?.commissionPercent}% checkout fee on paid orders is still billed with each cycle
            {sub.freePlan.note ? ` · ${sub.freePlan.note}` : ""}.
          </p>
        )}
        {sub.promo && !sub.freePlan && (
          <p className="text-[13px] text-ink mt-4 mb-0">
            Special price: {inr(sub.promo.price)} + GST for {sub.promo.cyclesLeft == null ? "every renewal" : `the next ${sub.promo.cyclesLeft} renewal${sub.promo.cyclesLeft === 1 ? "" : "s"}`}
            {sub.promo.note ? ` · ${sub.promo.note}` : ""}.
          </p>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Next charge ── */}
        <Card size="small" title="Your next payment" styles={{ body: { padding: 20 } }}>
          {b.next ? (
            <>
              <Line label={b.next.kind === "intro" ? `${sub.plan?.name} — first month` : `${sub.plan?.name} plan`} value={inr(b.next.planAmount)} />
              <Line label={`Checkout fees so far (${b.next.feeOrders} order${b.next.feeOrders === 1 ? "" : "s"})`} value={inr(b.next.fees)} />
              {b.next.apps > 0 && <Line label="Apps" value={inr(b.next.apps)} />}
              <Line label={`GST (${b.next.taxRate}%)`} value={inr(b.next.tax)} />
              <Line label={`Total on ${formatDay(b.next.date)}`} value={inr(b.next.total)} strong />
              <p className="text-xs text-ink-muted mt-3 mb-0">
                Fees keep adding up until the payment is taken.{sub.interval === "year" ? " On a yearly plan, fees are settled every month." : ""}
              </p>
            </>
          ) : b.due ? (
            <>
              <Line label={KIND_LABEL[b.due.kind] || "Subscription"} value={inr(b.due.planAmount)} />
              {b.due.feesAmount !== 0 && <Line label="Checkout fees" value={inr(b.due.feesAmount)} />}
              {b.due.appsAmount > 0 && <Line label="Apps" value={inr(b.due.appsAmount)} />}
              <Line label={`GST (${b.due.taxRate}%)`} value={inr(b.due.taxAmount)} />
              <Line label="Due now" value={inr(b.due.total)} strong />
            </>
          ) : (
            <p className="text-sm text-ink-muted m-0">No payment scheduled.</p>
          )}
        </Card>

        {/* ── Autopay ── */}
        <Card
          size="small"
          title="Autopay"
          extra={canManage && b.mandate && !unpaid ? <Button size="small" onClick={() => setMethodOpen(true)}>Change method</Button> : null}
          styles={{ body: { padding: 20 } }}
        >
          {b.mandate ? (
            <div className="flex items-start gap-3">
              <CreditCard size={20} className="text-ink mt-0.5" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink m-0">{b.mandate.label}</p>
                <p className="text-[13px] text-ink-muted m-0 mt-0.5">
                  {b.mandate.methodLabel} · up to {inr(b.mandate.maxAmount)} per payment · {b.mandate.status === "active" ? "active" : b.mandate.status}
                </p>
                <p className="text-xs text-ink-muted m-0 mt-2">Only Razorpay's reference to your mandate is kept — never your card or bank details.</p>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm text-ink-muted m-0">No autopay yet. Set it up once and every payment is taken automatically — with a reminder before each one.</p>
              {canManage && (
                <Link href="/billing">
                  <Button className="mt-3">Set up autopay</Button>
                </Link>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* ── Plans ── */}
      <Card
        size="small"
        title="Plans"
        extra={
          <Segmented
            size="small"
            value={interval}
            onChange={setInterval}
            options={[
              { label: "Monthly", value: "month" },
              { label: `Yearly (save ${b.settings.annualDiscountPercent}%)`, value: "year" },
            ]}
          />
        }
        styles={{ body: { padding: 20 } }}
      >
        <div className="grid gap-3 md:grid-cols-3">
          {b.plans.map((p) => {
            const current = p.id === sub.planId && interval === sub.interval;
            const price = interval === "year" ? p.priceYearly : p.priceMonthly;
            return (
              <div key={p.id} className={`rounded-xl p-4 flex flex-col ${current ? "border-2 border-ink" : "border border-app-border"}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-semibold text-ink">{p.name}</span>
                  {current && <StatusBadge status="active" label="Current" />}
                </div>
                <p className="m-0 mt-2">
                  <span className="text-xl font-semibold text-ink tabular-nums">{inr(price)}</span>
                  <span className="text-[13px] text-ink-muted">/{interval === "year" ? "year" : "month"} + GST</span>
                </p>
                <ul className="list-none p-0 m-0 mt-3 grid gap-1 text-[13px] text-ink flex-1">
                  <li>{p.commissionPercent}% fee on checkout orders</li>
                  <li>{p.staffLimit} staff accounts · unlimited products</li>
                  <li className="text-ink-muted">{p.features.length} features</li>
                </ul>
                {canManage && !current && !unpaid && sub.status !== "CANCEL_SCHEDULED" && (
                  <Button className="mt-4" block loading={busy === `preview-${p.id}`} onClick={() => openPreview(p)}>
                    Switch to {p.name}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-ink-muted mt-4 mb-0">
          Upgrades start now — you pay the difference for the rest of this period. Downgrades and yearly → monthly switch at the end of the period you've paid for.
          During the trial and your first month, switching is free.
        </p>
      </Card>

      {/* ── Checkout fees ── */}
      <Card size="small" title="Checkout fees" styles={{ body: { padding: 0 } }}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5 border-b border-app-border">
          <Stat label="This month" value={inr(month?.baseFee || 0)} sub={`${month?.orders || 0} orders · ${inr(month?.orderAmount || 0)} sales`} />
          <Stat label="One-Click Checkout" value={inr(month?.oneClickAmount || 0)} sub="this month" />
          <Stat label="Waiting for next payment" value={inr(b.fees.accrued.amount)} sub={`+ ${inr(b.fees.accrued.tax)} GST`} />
          <Stat label="Paid so far" value={inr(b.fees.paid.amount)} sub={`${b.fees.paid.count} orders`} />
        </div>
        <Table
          rowKey="id"
          size="small"
          dataSource={lists.transactions}
          pagination={false}
          scroll={{ x: 640 }}
          columns={[
            { title: "Order", dataIndex: "orderNumber", render: (n, r) => <Link href={`/admin/orders/${r.orderId}`} className="text-ink hover:underline">#{n}</Link> },
            { title: "Date", dataIndex: "createdAt", render: (d) => <span className="text-[13px]">{formatDay(d)}</span> },
            { title: "Order amount", dataIndex: "orderAmount", align: "right", render: (v) => <span className="tabular-nums">{inr(v)}</span> },
            {
              title: "Rate",
              align: "right",
              render: (_, r) => <span className="tabular-nums text-[13px]">{r.commissionRate}%{r.oneClickActive ? ` + ${r.oneClickRate}%` : ""}</span>,
            },
            { title: "Fee", dataIndex: "baseFee", align: "right", render: (v) => <span className="tabular-nums">{inr(v)}</span> },
            { title: "GST", dataIndex: "taxAmount", align: "right", render: (v) => <span className="tabular-nums text-ink-muted">{inr(v)}</span> },
            { title: "Status", dataIndex: "status", render: (s, r) => <StatusBadge status={r.kind === "reversal" ? "refunded" : s === "accrued" ? "pending" : s === "billed" ? "scheduled" : s} label={r.kind === "reversal" ? "Credited back" : s === "accrued" ? "Next payment" : s === "billed" ? "Billed" : undefined} /> },
          ]}
          locale={{ emptyText: <EmptyState icon={<Receipt />} title="No fees yet" description="A fee is added for each paid order placed at your store's checkout." /> }}
        />
      </Card>

      {/* ── Staff ── */}
      <Card size="small" title="Staff accounts" styles={{ body: { padding: 20 } }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex-1 min-w-[220px]">
            <div className="flex items-baseline justify-between text-[13px]">
              <span className="text-ink-muted inline-flex items-center gap-1.5">
                <Users size={14} aria-hidden="true" /> In use (the owner doesn't count)
              </span>
              <span className="tabular-nums text-ink">
                {b.staff.used} <span className="text-ink-muted">/ {b.staff.limit}</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-app-bg overflow-hidden mt-1.5" aria-hidden="true">
              <div className={`h-full rounded-full ${staffPct >= 90 ? "bg-status-danger" : staffPct >= 75 ? "bg-status-warning" : "bg-ink"}`} style={{ width: `${Math.max(staffPct, 2)}%` }} />
            </div>
          </div>
          {canManage &&
            (pendingRequest ? (
              <span className="text-[13px] text-ink-muted">Request for {pendingRequest.requested} accounts is being reviewed.</span>
            ) : (
              <Button onClick={() => setLimitOpen(true)}>Request more staff</Button>
            ))}
        </div>
      </Card>

      {/* ── Invoices & payments ── */}
      <Card size="small" title="Invoices" styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          size="small"
          dataSource={lists.invoices}
          pagination={false}
          scroll={{ x: 560 }}
          rowClassName="oy-row-link"
          onRow={(row) => ({ onClick: () => router.push(`/admin/settings/billing/invoices/${row.id}`) })}
          columns={[
            {
              title: "Invoice",
              dataIndex: "number",
              render: (n, row) => (
                <Link href={`/admin/settings/billing/invoices/${row.id}`} className="font-medium text-ink hover:underline font-mono text-[13px]" onClick={(e) => e.stopPropagation()}>
                  {n}
                </Link>
              ),
            },
            { title: "Date", dataIndex: "issuedAt", render: (d) => <span className="text-[13px]">{formatDay(d)}</span> },
            { title: "For", dataIndex: "kind", render: (k) => <span className="text-[13px]">{KIND_LABEL[k] || k}</span> },
            { title: "GST", dataIndex: "taxAmount", align: "right", render: (v) => <span className="tabular-nums text-ink-muted">{inr(v)}</span> },
            { title: "Total", dataIndex: "total", align: "right", render: (v) => <span className="font-medium tabular-nums">{inr(v)}</span> },
          ]}
          locale={{ emptyText: <EmptyState icon={<Receipt />} title="No invoices yet" description="An invoice with GST is issued for every payment to Oyklane." /> }}
        />
      </Card>

      <Card size="small" title="Payment history" styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          size="small"
          dataSource={lists.payments}
          pagination={false}
          scroll={{ x: 560 }}
          columns={[
            { title: "Date", dataIndex: "createdAt", render: (d) => <span className="text-[13px]">{formatDay(d)}</span> },
            { title: "Type", dataIndex: "purpose", render: (p) => <span className="text-[13px]">{PURPOSE_LABEL[p] || p}</span> },
            { title: "Amount", dataIndex: "amount", align: "right", render: (v, r) => <span className="tabular-nums">{inr(v)}{r.refundedAmount > 0 ? <span className="text-ink-muted"> ({inr(r.refundedAmount)} refunded)</span> : null}</span> },
            {
              title: "Status",
              dataIndex: "status",
              render: (s, r) => (
                <span className="inline-flex flex-col">
                  <StatusBadge status={s === "captured" ? "paid" : s} />
                  {r.failureReason && <span className="text-xs text-ink-muted mt-0.5">{r.failureReason}</span>}
                </span>
              ),
            },
          ]}
          locale={{ emptyText: <EmptyState icon={<CreditCard />} title="No payments yet" description="Payments appear here as they're made." /> }}
        />
      </Card>

      {/* ── Billing details ── */}
      <Card size="small" title="Billing details" extra={<span className="text-xs text-ink-muted">Printed on your GST invoices</span>} styles={{ body: { padding: 24 } }}>
        <Form
          form={detailsForm}
          layout="vertical"
          requiredMark={false}
          disabled={!canManage}
          onFinish={(values) => run("details", () => apiFetch("/api/billing/details", { method: "PATCH", body: values }), "Billing details saved — they'll appear on your next invoice")}
        >
          <Form.Item name="gstRegistered" label="Registered under GST?" extra="Also decides your invoices to customers: “Tax invoice” with the GST split, or a plain “Invoice”.">
            <Radio.Group
              options={[
                { value: true, label: "Yes" },
                { value: false, label: "No" },
              ]}
            />
          </Form.Item>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5">
            <Form.Item name="billingName" label="Legal business name" extra="Leave empty to use your store name.">
              <Input maxLength={160} />
            </Form.Item>
            <Form.Item
              name="gstin"
              label="GSTIN"
              extra="Add it to claim input tax credit on Oyklane invoices."
              rules={[{ pattern: /^[0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z][1-9A-Za-z][Zz][0-9A-Za-z]$/, message: "Enter a valid 15-character GSTIN, e.g. 27ABCDE1234F1Z5" }]}
            >
              <Input maxLength={15} placeholder="27ABCDE1234F1Z5" className="uppercase" />
            </Form.Item>
            <Form.Item name="billingAddress" label="Billing address">
              <Input.TextArea rows={3} maxLength={500} placeholder="Street, city, PIN code" />
            </Form.Item>
            <Form.Item name="billingState" label="State" extra="Same state as Oyklane: CGST + SGST. Other states: IGST.">
              <Select showSearch allowClear placeholder="Select a state" options={INDIAN_STATES.map((s) => ({ value: s, label: s }))} />
            </Form.Item>
          </div>
          {canManage && (
            <div className="flex justify-end">
              <Button type="primary" htmlType="submit" loading={busy === "details"}>
                Save billing details
              </Button>
            </div>
          )}
        </Form>
      </Card>

      {canManage && ["ACTIVE", "TRIALING"].includes(sub.status) && (
        <Card size="small" title="Cancel subscription" styles={{ body: { padding: 20 } }}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-ink-muted m-0 max-w-xl">
              Nothing more is charged. {sub.status === "TRIALING" ? "Your trial" : `${sub.plan?.name}`} stays active until {formatDay(sub.status === "TRIALING" ? sub.trialEndsAt : sub.currentPeriodEnd)}; after that
              your dashboard closes and, if it stays unpaid, your store goes offline. You can resume before then.
            </p>
            <Button danger onClick={() => setCancelOpen(true)}>
              Cancel subscription
            </Button>
          </div>
        </Card>
      )}

      {/* ── Modals ── */}
      <Modal
        open={Boolean(preview)}
        title={preview ? `Switch to ${preview.planName} (${preview.interval === "year" ? "yearly" : "monthly"})?` : ""}
        onCancel={() => setPreview(null)}
        onOk={confirmChange}
        okText={preview?.type === "upgrade" ? `Upgrade and pay ${inr(preview?.charge?.total)}` : preview?.type === "downgrade" ? "Schedule the switch" : "Switch now"}
        confirmLoading={busy === "change"}
        destroyOnHidden
      >
        {preview && (
          <div className="mt-3 text-sm text-ink">
            {preview.type === "free" && <p className="m-0">This switch is free and happens right away — the new price applies from your next payment.</p>}
            {preview.type === "downgrade" && (
              <p className="m-0">
                You keep {sub.plan?.name} until {formatDay(preview.effectiveDate)}, then move to {preview.planName} at {inr(preview.price)} + GST. Nothing is refunded for the current period. You can undo this any time before then.
              </p>
            )}
            {preview.type === "upgrade" && (
              <>
                <p className="m-0 mb-3">
                  {preview.planName} starts now{preview.newPeriod ? `, with a new yearly period until ${formatDay(preview.newPeriod.end)}` : ""}. You pay the difference now, on autopay:
                </p>
                <Line label={`${preview.planName} for the rest of the period`} value={inr(preview.charge.planAmount)} />
                <Line label="Credit for unused time" value={`−${inr(preview.charge.credit)}`} />
                <Line label={`GST (${preview.charge.taxRate}%)`} value={inr(preview.charge.tax)} />
                <Line label="Charged now" value={inr(preview.charge.total)} strong />
              </>
            )}
          </div>
        )}
      </Modal>

      <Modal open={methodOpen} title="Change payment method" onCancel={() => setMethodOpen(false)} onOk={changeMethod} okText="Continue to Razorpay" confirmLoading={busy === "method"} destroyOnHidden>
        <p className="text-sm text-ink-muted mt-2">Your new autopay replaces the current one once it's approved.</p>
        <Radio.Group value={method} onChange={(e) => setMethod(e.target.value)} className="!flex !flex-col gap-2 mt-2">
          {METHODS.map((m) => (
            <Radio key={m.key} value={m.key}>
              <span className="text-sm text-ink">{m.label}</span> <span className="text-xs text-ink-muted">— {m.hint}</span>
            </Radio>
          ))}
        </Radio.Group>
      </Modal>

      <Modal
        open={cancelOpen}
        title="Cancel your subscription?"
        onCancel={() => setCancelOpen(false)}
        okText="Cancel subscription"
        okButtonProps={{ danger: true }}
        confirmLoading={busy === "cancel"}
        onOk={async () => {
          await run("cancel", () => apiFetch("/api/billing/cancel", { method: "POST", body: { reason: cancelReason || undefined } }), "Subscription cancelled — it stays active until the end of the period");
          setCancelOpen(false);
        }}
        destroyOnHidden
      >
        <div className="flex items-start gap-2.5 mt-3 text-sm text-ink">
          <AlertTriangle size={16} className="text-status-warning mt-0.5 shrink-0" aria-hidden="true" />
          <p className="m-0">You'll keep everything until {formatDay(sub.status === "TRIALING" ? sub.trialEndsAt : sub.currentPeriodEnd)}. Autopay is switched off when the period ends.</p>
        </div>
        <Input.TextArea className="mt-4" rows={3} maxLength={500} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Anything we could do better? (optional)" />
      </Modal>

      <Modal open={limitOpen} title="Request more staff accounts" onCancel={() => setLimitOpen(false)} onOk={() => limitForm.submit()} okText="Send request" confirmLoading={busy === "limit"} destroyOnHidden>
        <p className="text-sm text-ink-muted mt-2">
          {sub.plan?.name} includes {b.staff.limit} staff accounts. {sub.plan?.key !== "pro" ? "Upgrading gives you more straight away — or ask us for a higher limit." : "Tell us how many you need."}
        </p>
        <Form
          form={limitForm}
          layout="vertical"
          requiredMark={false}
          initialValues={{ requested: b.staff.limit + 5 }}
          onFinish={async (values) => {
            await run("limit", () => apiFetch("/api/billing/limit-request", { method: "POST", body: values }), "Request sent — we'll email you when it's reviewed");
            setLimitOpen(false);
          }}
        >
          <Form.Item name="requested" label="Staff accounts you need" rules={[{ required: true }]}>
            <InputNumber min={b.staff.limit + 1} max={500} className="!w-40" />
          </Form.Item>
          <Form.Item name="reason" label="Why (optional)">
            <Input.TextArea rows={3} maxLength={1000} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

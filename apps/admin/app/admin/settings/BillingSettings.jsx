"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Button, Form, Input, Select, Table, Modal, App, Skeleton } from "antd";
import { Crown, Check, Minus, ArrowRight, Receipt, AlertTriangle, CalendarClock, Sparkles } from "lucide-react";
import { StatusBadge, EmptyState } from "@shopcycle/ui";
import { formatCurrency } from "@shopcycle/utils";
import { apiFetch } from "@/lib/api";
import { FEATURE_ROWS, INDIAN_STATES, formatDate, daysUntil } from "@/lib/plans";
import { SettingsSectionHeader } from "./SettingsNav";
import { BillingModeNotice } from "@/components/BillingModeNotice";

const STATUS = {
  trialing: { status: "scheduled", label: "Free trial" },
  active: { status: "active", label: "Active" },
  past_due: { status: "failed", label: "Payment failed" },
  cancelled: { status: "cancelled", label: "Cancelled" },
  no_plan: { status: "draft", label: "No plan" },
};

function Meter({ label, used, limit }) {
  const unlimited = limit >= 100000;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  const tone = pct >= 90 ? "bg-status-danger" : pct >= 75 ? "bg-status-warning" : "bg-ink";
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-ink-muted">{label}</span>
        <span className="tabular-nums text-ink">
          {used.toLocaleString("en-IN")} <span className="text-ink-muted">/ {unlimited ? "Unlimited" : limit.toLocaleString("en-IN")}</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-app-bg overflow-hidden mt-1.5" aria-hidden="true">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${unlimited ? 2 : Math.max(pct, 2)}%` }} />
      </div>
    </div>
  );
}

function FeatureValue({ value }) {
  if (typeof value === "string") return <span className="text-[13px] text-ink font-medium">{value}</span>;
  return value ? (
    <Check size={15} className="text-status-success" aria-label="Included" />
  ) : (
    <Minus size={15} className="text-ink-subtle" aria-label="Not included" />
  );
}

/** Plain-language explanation of what switching to `target` will do, and
 * when — shown in the confirmation before anything changes. */
function describeSwitch(target, current, billing) {
  const inTrial = billing.subscriptionStatus === "trialing";
  const upgrade = Number(target.priceMonthly) > Number(current?.priceMonthly || 0);
  const price = `${formatCurrency(target.priceMonthly)}/month`;
  if (inTrial) {
    return `You'll move to ${target.name} right away. Your free trial continues, and your first payment on ${formatDate(billing.trialEndsAt)} will be ${price}.`;
  }
  if (upgrade) {
    return `${target.name} features start right away. You'll be charged ${price} from your next renewal on ${formatDate(billing.currentPeriodEnd)} — nothing extra today.`;
  }
  const lost = [];
  if (current?.hasMetaAds && !target.hasMetaAds) lost.push("Meta Ads");
  if (current?.hasWhatsappIntegration && !target.hasWhatsappIntegration) lost.push("WhatsApp");
  return `You'll keep ${current?.name} until ${formatDate(billing.currentPeriodEnd)}, then switch to ${target.name} at ${price}.${
    lost.length ? ` ${lost.join(" and ")} will be locked from then.` : ""
  } You can cancel the change any time before that.`;
}

export function BillingSettings() {
  const router = useRouter();
  const { message } = App.useApp();
  const [data, setData] = useState(null);
  const [store, setStore] = useState(null);
  const [role, setRole] = useState(null);
  const [switching, setSwitching] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [detailsForm] = Form.useForm();

  const load = useCallback(async () => {
    const [billing, storeRes] = await Promise.all([apiFetch("/api/store/billing"), apiFetch("/api/store")]);
    setData(billing);
    setStore(storeRes.store);
    setRole(storeRes.role);
  }, []);

  useEffect(() => {
    load().catch((err) => message.error(err.message));
  }, [load, message]);

  useEffect(() => {
    if (data) detailsForm.setFieldsValue(data.billing.billingDetails);
  }, [data, detailsForm]);

  const canManage = role && role !== "staff";
  const billing = data?.billing;
  const plans = data?.plans || [];
  const current = store?.plan || null;
  const pendingPlan = useMemo(() => plans.find((p) => p.id === billing?.pendingPlanId), [plans, billing]);
  const hasPlan = billing && !["no_plan", "cancelled"].includes(billing.subscriptionStatus);

  async function confirmSwitch() {
    setSwitching(true);
    try {
      const res = await apiFetch("/api/store/plan", { method: "POST", body: { planId: confirmTarget.id } });
      message.success(
        res.appliesAt === "now"
          ? `You're now on ${confirmTarget.name}`
          : res.appliesAt === "cancelled"
            ? "Scheduled change cancelled"
            : `Switch to ${confirmTarget.name} scheduled for ${formatDate(res.effectiveDate)}`
      );
      await load();
      setConfirmTarget(null);
    } catch (err) {
      message.error(err.message);
    } finally {
      setSwitching(false);
    }
  }

  async function cancelPending() {
    setCancelling(true);
    try {
      await apiFetch("/api/store/plan/pending", { method: "DELETE" });
      await load();
      message.success(`You'll stay on ${current?.name}`);
    } catch (err) {
      message.error(err.message);
    } finally {
      setCancelling(false);
    }
  }

  async function saveDetails(values) {
    setSavingDetails(true);
    try {
      await apiFetch("/api/store/billing/details", { method: "PATCH", body: values });
      message.success("Billing details saved — they'll appear on your next invoice");
      await load();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSavingDetails(false);
    }
  }

  if (!data || !store) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton active paragraph={{ rows: 4 }} />
        <Skeleton active paragraph={{ rows: 3 }} />
      </div>
    );
  }

  const status = STATUS[billing.subscriptionStatus] || STATUS.no_plan;
  const nextFees = data.fees.scheduled.amount;
  // A scheduled downgrade takes effect AT the next renewal, so that charge
  // is already at the new plan's price.
  const billedPlan = pendingPlan || current;
  const nextPayment = billedPlan ? Number(billedPlan.priceMonthly) + nextFees : null;

  return (
    <div className="flex flex-col gap-6">
      <SettingsSectionHeader
        title="Plan & billing"
        description="Your Oyklane subscription, platform fees on orders, and GST invoices. Prices include 18% GST."
      />

      <BillingModeNotice billing={billing} />

      {!canManage && (
        <p className="text-[13px] text-ink-muted bg-app-surface border border-app-border rounded-lg px-4 py-2.5 m-0">
          Only the store owner or an admin can change the plan or billing details.
        </p>
      )}

      {/* ── Current plan ── */}
      <div className="relative overflow-hidden rounded-[14px] border border-app-border bg-app-surface shadow-card">
        <div className="absolute inset-x-0 top-0 h-1 bg-brand-gradient" aria-hidden="true" />
        <div className="p-6 flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-subtle m-0">Current plan</p>
            <div className="flex flex-wrap items-center gap-2.5 mt-2">
              <h3 className="text-[26px] font-semibold text-ink m-0 flex items-center gap-2" style={{ letterSpacing: "-0.02em" }}>
                {current?.name === "Premium" && <Crown size={22} className="text-accent" aria-hidden="true" />}
                {hasPlan ? current?.name : "No plan yet"}
              </h3>
              <StatusBadge status={status.status} label={status.label} />
            </div>
            {hasPlan && current && (
              <p className="text-sm text-ink-muted mt-1 mb-0">
                <span className="text-ink font-medium tabular-nums">{formatCurrency(current.priceMonthly)}</span> per month ·{" "}
                {Number(current.commissionPercent)}% platform fee per order
              </p>
            )}
            <div className="mt-4 flex items-center gap-2 text-sm text-ink">
              <CalendarClock size={16} className="text-ink-muted shrink-0" aria-hidden="true" />
              {billing.subscriptionStatus === "trialing" && (
                <span>
                  Free trial ends <strong className="font-semibold">{formatDate(billing.trialEndsAt)}</strong>
                  {" "}({daysUntil(billing.trialEndsAt)} days left). First payment then.
                </span>
              )}
              {billing.subscriptionStatus === "active" && (
                <span>
                  Renews <strong className="font-semibold">{formatDate(billing.currentPeriodEnd)}</strong>
                </span>
              )}
              {billing.subscriptionStatus === "past_due" && (
                <span className="text-status-danger">
                  Payment failed on {formatDate(billing.paymentFailedAt)}. Update your payment method to keep your store running.
                </span>
              )}
              {billing.subscriptionStatus === "no_plan" &&
                (billing.mandateDeadline ? (
                  <span>
                    Choose a plan by <strong className="font-semibold">{formatDate(billing.mandateDeadline)}</strong> — your first month is free.
                  </span>
                ) : (
                  <span>Choose a plan to get started — your first month is free.</span>
                ))}
              {billing.subscriptionStatus === "cancelled" && <span>Your subscription was cancelled. Choose a plan to reactivate.</span>}
            </div>
          </div>

          {!hasPlan ? (
            <Link href="/billing">
              <Button type="primary" size="large" icon={<Sparkles size={16} aria-hidden="true" />}>
                Choose a plan
              </Button>
            </Link>
          ) : (
            nextPayment !== null && (
              <div className="rounded-lg bg-app-bg px-4 py-3 min-w-[200px]">
                <p className="text-xs text-ink-muted m-0">
                  {billing.subscriptionStatus === "trialing" ? "First payment" : "Next payment"}
                </p>
                <p className="text-[22px] font-semibold text-ink m-0 tabular-nums" style={{ letterSpacing: "-0.02em" }}>
                  {formatCurrency(nextPayment)}
                </p>
                <p className="text-xs text-ink-muted m-0">
                  {pendingPlan ? `${pendingPlan.name} plan` : "Plan"}
                  {nextFees > 0 ? ` + ${formatCurrency(nextFees)} platform fees` : " fee"} ·{" "}
                  {formatDate(billing.subscriptionStatus === "trialing" ? billing.trialEndsAt : billing.currentPeriodEnd)}
                </p>
              </div>
            )
          )}
        </div>

        {pendingPlan && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 bg-[#FEF3E2] border-t border-[#F5D9A8] text-[13px] text-[#8A4B0B]">
            <span className="flex items-center gap-2">
              <AlertTriangle size={15} aria-hidden="true" />
              Switching to {pendingPlan.name} on {formatDate(billing.currentPeriodEnd)}. You keep {current?.name} until then.
            </span>
            {canManage && (
              <Button size="small" onClick={cancelPending} loading={cancelling}>
                Keep {current?.name}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ── Usage + fees ── */}
      {hasPlan && current && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <Card size="small" title="Usage" styles={{ body: { padding: 20 } }}>
            <div className="flex flex-col gap-4">
              <Meter label="Products" used={data.usage.products} limit={current.productLimit} />
              <Meter label="Staff accounts" used={data.usage.staff} limit={current.staffLimit} />
            </div>
          </Card>
          <Card size="small" title="Platform fees" styles={{ body: { padding: 20 } }}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[13px] text-ink-muted m-0">This cycle so far</p>
                {data.fees.accrued.amount < 0 ? (
                  <>
                    <p className="text-[22px] font-semibold text-status-success m-0 tabular-nums">
                      {formatCurrency(-data.fees.accrued.amount)} <span className="text-sm font-medium">credit</span>
                    </p>
                    <p className="text-xs text-ink-muted m-0">From refunds · taken off future fees</p>
                  </>
                ) : (
                  <>
                    <p className="text-[22px] font-semibold text-ink m-0 tabular-nums">{formatCurrency(data.fees.accrued.amount)}</p>
                    <p className="text-xs text-ink-muted m-0">
                      {data.fees.accrued.count} order{data.fees.accrued.count === 1 ? "" : "s"}
                      {data.fees.accrued.credits > 0 &&
                        ` · ${data.fees.accrued.credits} refund credit${data.fees.accrued.credits === 1 ? "" : "s"}`}
                      {" · billed next cycle"}
                    </p>
                  </>
                )}
              </div>
              <div>
                <p className="text-[13px] text-ink-muted m-0">On next renewal</p>
                <p className="text-[22px] font-semibold text-ink m-0 tabular-nums">{formatCurrency(nextFees)}</p>
                <p className="text-xs text-ink-muted m-0">Paid to date {formatCurrency(data.fees.paid.amount)}</p>
              </div>
            </div>
            <p className="text-xs text-ink-muted mt-4 mb-0 leading-relaxed">
              {Number(current.commissionPercent)}% of each paid order. Refunds and cancellations are credited back automatically.
            </p>
          </Card>
        </div>
      )}

      {/* ── Plans ── */}
      <div>
        <h3 className="text-[15px] font-semibold text-ink mt-0 mb-3">Compare plans</h3>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {plans.map((plan) => {
            const isCurrent = hasPlan && plan.id === current?.id;
            const isPending = plan.id === billing.pendingPlanId;
            const upgrade = Number(plan.priceMonthly) > Number(current?.priceMonthly || 0);
            const premium = plan.name === "Premium";
            return (
              <div
                key={plan.id}
                className={`rounded-[14px] border bg-app-surface p-6 flex flex-col shadow-card ${
                  isCurrent ? "border-ink" : premium ? "border-accent/50" : "border-app-border"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-[17px] font-semibold text-ink m-0 flex items-center gap-1.5">
                    {premium && <Crown size={16} className="text-accent" aria-hidden="true" />}
                    {plan.name}
                  </h4>
                  {isCurrent && <StatusBadge status="active" label="Current plan" />}
                  {isPending && <StatusBadge status="scheduled" label="Scheduled" />}
                </div>
                <p className="text-sm text-ink-muted mt-1 mb-4">{plan.description}</p>
                <p className="m-0">
                  <span className="text-[28px] font-semibold text-ink tabular-nums" style={{ letterSpacing: "-0.02em" }}>
                    {formatCurrency(plan.priceMonthly)}
                  </span>
                  <span className="text-sm text-ink-muted"> /month</span>
                </p>
                <ul className="list-none p-0 mt-5 mb-6 flex-1 divide-y divide-app-border">
                  {FEATURE_ROWS.map((row) => (
                    <li key={row.label} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                      <span className="text-ink-muted">{row.label}</span>
                      <FeatureValue value={row.render(plan)} />
                    </li>
                  ))}
                </ul>
                {!hasPlan ? (
                  <Link href="/billing">
                    <Button block type={premium ? "primary" : "default"} size="large">
                      Choose {plan.name}
                    </Button>
                  </Link>
                ) : isCurrent ? (
                  <Button block size="large" disabled>
                    {billing.pendingPlanId ? `On ${plan.name} until ${formatDate(billing.currentPeriodEnd)}` : "Your current plan"}
                  </Button>
                ) : (
                  <Button
                    block
                    size="large"
                    type={upgrade ? "primary" : "default"}
                    disabled={!canManage || isPending}
                    icon={upgrade ? <ArrowRight size={16} aria-hidden="true" /> : null}
                    iconPosition="end"
                    onClick={() => setConfirmTarget(plan)}
                  >
                    {isPending ? "Switch scheduled" : upgrade ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Billing details ── */}
      <Card
        size="small"
        title="Billing details"
        extra={<span className="text-xs text-ink-muted">Printed on your GST invoices</span>}
        styles={{ body: { padding: 24 } }}
      >
        <Form form={detailsForm} layout="vertical" requiredMark={false} onFinish={saveDetails} disabled={!canManage}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5">
            <Form.Item name="billingName" label="Legal business name" extra="Leave empty to use your store name.">
              <Input maxLength={160} placeholder={store.name} />
            </Form.Item>
            <Form.Item
              name="gstin"
              label="GSTIN"
              extra="Add it to claim input tax credit on Oyklane invoices."
              rules={[
                {
                  pattern: /^[0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z][1-9A-Za-z][Zz][0-9A-Za-z]$/,
                  message: "Enter a valid 15-character GSTIN, e.g. 27ABCDE1234F1Z5",
                },
              ]}
            >
              <Input maxLength={15} placeholder="27ABCDE1234F1Z5" className="uppercase" />
            </Form.Item>
            <Form.Item name="billingAddress" label="Billing address">
              <Input.TextArea rows={3} maxLength={500} placeholder="Street, city, PIN code" />
            </Form.Item>
            <Form.Item name="billingState" label="State" extra="Decides whether invoices show CGST + SGST or IGST.">
              <Select showSearch allowClear placeholder="Select a state" options={INDIAN_STATES.map((s) => ({ value: s, label: s }))} />
            </Form.Item>
          </div>
          {canManage && (
            <div className="flex justify-end">
              <Button type="primary" htmlType="submit" loading={savingDetails}>
                Save billing details
              </Button>
            </div>
          )}
        </Form>
      </Card>

      {/* ── Invoices ── */}
      <Card size="small" title="Invoices" styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          dataSource={data.invoices}
          pagination={false}
          rowClassName="oy-row-link"
          onRow={(row) => ({ onClick: () => router.push(`/admin/settings/billing/invoices/${row.id}`) })}
          columns={[
            {
              title: "Invoice",
              dataIndex: "number",
              render: (n, row) => (
                <Link
                  href={`/admin/settings/billing/invoices/${row.id}`}
                  className="font-medium text-ink hover:underline font-mono text-[13px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  {n}
                </Link>
              ),
            },
            { title: "Date", dataIndex: "issuedAt", render: (d) => <span className="text-[13px]">{formatDate(d)}</span> },
            {
              title: "Period",
              render: (_, r) => (
                <span className="text-[13px] text-ink-muted">
                  {r.periodStart ? `${formatDate(r.periodStart)} – ${formatDate(r.periodEnd)}` : "—"}
                </span>
              ),
            },
            { title: "Status", dataIndex: "status", width: 110, render: (s) => <StatusBadge status={s} /> },
            {
              title: "Amount",
              dataIndex: "total",
              align: "right",
              width: 130,
              render: (v) => <span className="font-medium tabular-nums">{formatCurrency(v)}</span>,
            },
          ]}
          locale={{
            emptyText: (
              <EmptyState
                icon={<Receipt />}
                title="No invoices yet"
                description="An invoice is issued for every payment to Oyklane, starting when your free trial ends."
              />
            ),
          }}
        />
      </Card>

      <Modal
        open={Boolean(confirmTarget)}
        title={confirmTarget ? `Switch to ${confirmTarget.name}?` : ""}
        onCancel={() => setConfirmTarget(null)}
        onOk={confirmSwitch}
        okText={confirmTarget && Number(confirmTarget.priceMonthly) > Number(current?.priceMonthly || 0) ? `Upgrade to ${confirmTarget.name}` : "Confirm switch"}
        confirmLoading={switching}
        destroyOnHidden
      >
        {confirmTarget && <p className="text-sm text-ink leading-relaxed mt-3 mb-0">{describeSwitch(confirmTarget, current, billing)}</p>}
      </Modal>
    </div>
  );
}

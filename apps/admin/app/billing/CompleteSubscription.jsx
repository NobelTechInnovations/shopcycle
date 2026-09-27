"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { App, Button, Checkbox, Segmented } from "antd";
import { AlertTriangle, ArrowLeft, Check, Clock, CreditCard, Landmark, Lock, ShieldCheck, Smartphone, Store } from "lucide-react";
import { BrandMark } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { inr, withGst, gstOf, formatDay, daysLeft, METHODS, completeCheckout } from "@/lib/billing";
import { BillingModeNotice } from "@/components/BillingModeNotice";

const METHOD_ICON = { upi: Smartphone, card: CreditCard, emandate: Landmark };

/** The headline for each state the billing engine can put a store in. */
function heading(billing) {
  const sub = billing.subscription;
  const reason = billing.access?.reason;
  const left = daysLeft(sub?.trialEndsAt);
  switch (reason) {
    case "trial":
      return {
        title: "Set up your subscription",
        text: `Your free trial ends on ${formatDay(sub.trialEndsAt)}${left != null ? ` — ${left} day${left === 1 ? "" : "s"} left` : ""}. Turn on autopay now; nothing is charged until the trial ends.`,
        tone: "info",
      };
    case "pending_payment":
      return { title: "Your free trial has ended", text: "Complete your subscription to unlock your dashboard. Your store is still live for customers.", tone: "danger" };
    case "grace":
      return { title: "Your last payment didn't go through", text: `Pay by ${formatDay(sub.graceEndsAt)} to keep your dashboard open. We'll also retry automatically.`, tone: "warning" };
    case "locked":
      return { title: "Your dashboard is paused", text: "We couldn't collect your subscription payment. Your store is still live — pay now to unlock your dashboard.", tone: "danger" };
    case "suspended":
      return { title: "Your store is offline", text: "After several unpaid billing cycles your store was taken offline. Pay what's owed and it's back instantly.", tone: "danger" };
    case "expired_grace":
    case "cancelled":
      return { title: "Your subscription has ended", text: "Choose a plan to continue — your products, orders and settings are all still here.", tone: "warning" };
    case "cancel_scheduled":
      return { title: "Your subscription is ending", text: `It stays active until ${formatDay(sub.currentPeriodEnd)}. Resume it from Settings ▸ Plan & billing.`, tone: "warning" };
    default:
      return { title: "You're all set", text: "Your subscription is active and autopay is on.", tone: "success" };
  }
}

const TONE = {
  info: "border-app-border bg-app-surface",
  success: "border-status-success/30 bg-status-success/5",
  warning: "border-status-warning/30 bg-status-warning/5",
  danger: "border-status-danger/30 bg-status-danger/5",
};

function Row({ label, value, strong, muted }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 ${strong ? "text-[15px] font-semibold text-ink" : "text-[13px]"}`}>
      <span className={muted ? "text-ink-muted" : strong ? "" : "text-ink-muted"}>{label}</span>
      <span className="tabular-nums text-ink">{value}</span>
    </div>
  );
}

export function CompleteSubscription({ initial, storeName, role }) {
  const router = useRouter();
  const { message } = App.useApp();
  const [billing, setBilling] = useState(initial);
  const sub = billing.subscription;
  const [interval, setInterval] = useState(sub?.interval || "month");
  const [planId, setPlanId] = useState(sub?.planId);
  const [method, setMethod] = useState("upi");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [waitingBank, setWaitingBank] = useState(false);

  const s = billing.settings || {};
  const plans = billing.plans || [];
  const due = billing.due;
  const head = heading(billing);
  const status = sub?.status;
  const canChoose = ["TRIALING", "PENDING_PAYMENT", "EXPIRED", "CANCELLED"].includes(status) || (status === "SUSPENDED" && (!due || due.status === "quote"));
  const oneTime = billing.mandateUsable && Boolean(due);
  const settled = !due && billing.mandateUsable && !["TRIALING", "PENDING_PAYMENT"].includes(status);
  const trialRunning = status === "TRIALING" && daysLeft(sub?.trialEndsAt) > 0;
  const selected = plans.find((p) => p.id === planId) || plans[0];
  const price = (p, iv) => (iv === "year" ? p.priceYearly : p.priceMonthly);

  // What's paid now, and what comes after — from the API's numbers; the
  // plan price is only recomputed when the seller picks another plan for
  // a charge that hasn't been created yet.
  const summary = useMemo(() => {
    if (!selected) return null;
    const rate = s.taxRate ?? 18;
    const regular = price(selected, interval);
    const after = { amount: regular, total: withGst(regular, rate), per: interval === "year" ? "year" : "month" };
    if (due && due.status !== "quote" && due.kind !== "reactivation") {
      return { now: due, nowLabel: due.kind === "intro" ? `${selected.name} — first month` : `${selected.name} plan`, after };
    }
    if (due) {
      const subtotal = Math.round((regular + (due.feesAmount || 0) + (due.appsAmount || 0)) * 100) / 100;
      return {
        now: { planAmount: regular, feesAmount: due.feesAmount || 0, appsAmount: due.appsAmount || 0, creditAmount: 0, subtotal, taxRate: rate, taxAmount: gstOf(subtotal, rate), total: withGst(subtotal, rate) },
        nowLabel: `${selected.name} — ${interval === "year" ? "first year" : "first month"}`,
        after,
      };
    }
    if (trialRunning) {
      const intro = sub.introAvailable ? s.introPrice : regular;
      return {
        verify: method === "emandate" ? 0 : 1,
        first: { date: sub.trialEndsAt, label: sub.introAvailable ? "First month (introductory price)" : `First ${interval}`, amount: intro, total: withGst(intro, rate) },
        after,
      };
    }
    return { after };
  }, [selected, interval, due, trialRunning, method, s.taxRate, s.introPrice, sub?.introAvailable, sub?.trialEndsAt]);

  async function pay() {
    setBusy(true);
    try {
      const started = await apiFetch("/api/billing/checkout", {
        method: "POST",
        body: { ...(canChoose && { planId, interval }), ...(!oneTime && { method }) },
      });
      const done = await completeCheckout(apiFetch, started);
      if (!done) {
        setBusy(false);
        return;
      }
      const fresh = done.billing || (await apiFetch("/api/billing"));
      setBilling(fresh);
      if (fresh.mandate?.status === "pending" && !fresh.access?.dashboard) {
        setWaitingBank(true);
      } else if (fresh.access?.dashboard) {
        message.success(oneTime || due ? "Payment received — thank you!" : "Autopay is on. You won't be charged until your trial ends.");
        router.push("/admin/settings/billing");
        router.refresh();
        return;
      } else {
        message.info("We're waiting for your bank to confirm the payment. This page will update once it does.");
      }
    } catch (err) {
      message.error(err.message);
    }
    setBusy(false);
  }

  const unavailable = billing.mode === "unconfigured";
  const isStaff = role === "staff";
  const payLabel = oneTime
    ? `Pay ${inr(summary?.now?.total)}`
    : summary?.now
      ? `Pay ${inr(summary.now.total)} & turn on autopay`
      : "Turn on autopay";

  return (
    <div className="min-h-screen bg-app-bg px-4 py-6 sm:py-10">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-8">
          <BrandMark />
          {billing.access?.dashboard ? (
            <Link href="/admin/settings/billing" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
              <ArrowLeft size={15} aria-hidden="true" /> Back to admin
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted">
              <Lock size={13} aria-hidden="true" /> Dashboard paused
            </span>
          )}
        </div>

        <header className="mb-6">
          <p className="text-sm text-ink-muted m-0 mb-1 inline-flex items-center gap-1.5">
            <Store size={14} aria-hidden="true" /> {storeName}
          </p>
          <h1 className="text-[26px] sm:text-[30px] font-semibold text-ink m-0" style={{ letterSpacing: "-0.025em", textWrap: "balance" }}>
            {head.title}
          </h1>
        </header>

        <div className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 mb-6 ${TONE[head.tone]}`} role="status">
          {head.tone === "danger" || head.tone === "warning" ? (
            <AlertTriangle size={16} className={`mt-0.5 shrink-0 ${head.tone === "danger" ? "text-status-danger" : "text-status-warning"}`} aria-hidden="true" />
          ) : head.tone === "success" ? (
            <Check size={16} className="mt-0.5 shrink-0 text-status-success" aria-hidden="true" />
          ) : (
            <Clock size={16} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
          )}
          <p className="text-sm text-ink m-0">{head.text}</p>
        </div>
        <BillingModeNotice billing={billing} className="mb-6" />

        {waitingBank && (
          <div className="rounded-lg border border-app-border bg-app-surface px-4 py-3 mb-6 text-sm text-ink">
            <strong className="font-semibold">Your bank is confirming the e-mandate.</strong> This usually takes 1–3 working days. We'll charge what's due as soon as it's confirmed and email you — no need to keep this page open.
          </div>
        )}

        {settled ? (
          <div className="rounded-[14px] border border-app-border bg-app-surface p-6 shadow-card max-w-xl">
            <p className="text-sm text-ink m-0">
              You're on <strong>{sub.plan?.name}</strong>, billed {sub.interval === "year" ? "yearly" : "monthly"}. Next payment: {formatDay(sub.nextBillingAt)}.
            </p>
            <Link href="/admin/settings/billing">
              <Button type="primary" className="mt-4">
                Go to Plan & billing
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
            <div className="flex flex-col gap-6 min-w-0">
              <section aria-labelledby="choose-plan">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <h2 id="choose-plan" className="text-[15px] font-semibold text-ink m-0">
                    {canChoose ? "1. Choose your plan" : "Your plan"}
                  </h2>
                  {canChoose && (
                    <Segmented
                      value={interval}
                      onChange={setInterval}
                      options={[
                        { label: "Monthly", value: "month" },
                        { label: `Yearly · save ${s.annualDiscountPercent ?? 20}%`, value: "year" },
                      ]}
                    />
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Plans">
                  {plans.map((p, i) => {
                    const active = p.id === selected?.id;
                    const prev = plans[i - 1];
                    const extra = prev ? p.features.filter((f) => !prev.features.some((x) => x.key === f.key)) : p.features;
                    const disabled = !canChoose && !active;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={disabled}
                        onClick={() => canChoose && setPlanId(p.id)}
                        className={`text-left rounded-[14px] bg-app-surface p-5 flex flex-col transition-shadow ${
                          active ? "border-2 border-ink shadow-raised" : "border border-app-border shadow-card hover:border-ink/40"
                        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-base font-semibold text-ink">{p.name}</span>
                          <span className={`w-4 h-4 rounded-full border-2 ${active ? "border-ink bg-ink" : "border-app-border"}`} aria-hidden="true" />
                        </span>
                        <span className="text-[13px] text-ink-muted mt-1 min-h-[2.6em]">{p.tagline}</span>
                        <span className="mt-3 flex items-baseline gap-1">
                          <span className="text-[26px] font-semibold text-ink tabular-nums" style={{ letterSpacing: "-0.03em" }}>
                            {inr(price(p, interval))}
                          </span>
                          <span className="text-[13px] text-ink-muted">/{interval === "year" ? "year" : "month"}</span>
                        </span>
                        <span className="text-xs text-ink-muted">
                          + GST{interval === "year" ? ` · ${inr(p.yearlyPerMonth)}/month, save ${inr(p.yearlySavings)}` : ""}
                        </span>
                        <span className="mt-3 grid gap-1 text-[13px] text-ink">
                          <span>
                            <strong className="font-semibold">{p.commissionPercent}%</strong> fee on checkout orders
                          </span>
                          <span>
                            <strong className="font-semibold">{p.staffLimit}</strong> staff accounts · unlimited products
                          </span>
                        </span>
                        <span className="mt-3 pt-3 border-t border-app-border text-xs text-ink-muted">{prev ? `Everything in ${prev.name}, plus:` : "Includes:"}</span>
                        <ul className="mt-1.5 grid gap-1 p-0 m-0 list-none">
                          {extra.slice(0, 7).map((f) => (
                            <li key={f.key} className="flex items-start gap-1.5 text-[13px] text-ink">
                              <Check size={13} className="text-status-success mt-[3px] shrink-0" aria-hidden="true" /> {f.name}
                            </li>
                          ))}
                          {extra.length > 7 && <li className="text-xs text-ink-muted">+ {extra.length - 7} more</li>}
                        </ul>
                      </button>
                    );
                  })}
                </div>
              </section>

              {!oneTime && (
                <section aria-labelledby="pay-method">
                  <h2 id="pay-method" className="text-[15px] font-semibold text-ink m-0 mb-3">
                    {canChoose ? "2. " : ""}How you'll pay
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Payment method">
                    {METHODS.map((m) => {
                      const Icon = METHOD_ICON[m.key];
                      const active = m.key === method;
                      const limit = s.mandateMaxAmount?.[m.key];
                      const tooBig = summary?.now && limit && summary.now.total > limit;
                      return (
                        <button
                          key={m.key}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          disabled={tooBig}
                          onClick={() => setMethod(m.key)}
                          className={`text-left rounded-xl bg-app-surface p-4 ${active ? "border-2 border-ink" : "border border-app-border hover:border-ink/40"} ${tooBig ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          <Icon size={18} className="text-ink" aria-hidden="true" />
                          <span className="block text-sm font-semibold text-ink mt-2">{m.label}</span>
                          <span className="block text-xs text-ink-muted mt-0.5">{tooBig ? `Up to ${inr(limit)} per payment` : m.hint}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>

            <aside className="lg:sticky lg:top-6 rounded-[14px] border border-app-border bg-app-surface shadow-card p-5">
              <h2 className="text-[15px] font-semibold text-ink m-0 mb-3">Summary</h2>
              {summary?.now && (
                <div className="border-b border-app-border pb-3 mb-3">
                  <Row label={summary.nowLabel} value={inr(summary.now.planAmount)} />
                  {summary.now.creditAmount > 0 && <Row label="Credit" value={`−${inr(summary.now.creditAmount)}`} />}
                  {summary.now.feesAmount !== 0 && <Row label="Checkout fees" value={inr(summary.now.feesAmount)} />}
                  {summary.now.appsAmount > 0 && <Row label="Apps" value={inr(summary.now.appsAmount)} />}
                  <Row label={`GST (${summary.now.taxRate}%)`} value={inr(summary.now.taxAmount)} />
                  <Row label="Due now" value={inr(summary.now.total)} strong />
                </div>
              )}
              {summary?.first && (
                <div className="border-b border-app-border pb-3 mb-3">
                  <Row label="Due today" value={summary.verify ? `${inr(summary.verify)} (refunded)` : inr(0)} strong />
                  <p className="text-xs text-ink-muted m-0 mt-1 mb-2">
                    {summary.verify ? "A ₹1 check confirms your autopay and is refunded straight away." : "Your bank approves the mandate — no money moves today."}
                  </p>
                  <Row label={`On ${formatDay(summary.first.date)}`} value="" />
                  <Row label={summary.first.label} value={inr(summary.first.amount)} />
                  <Row label={`GST (${s.taxRate}%)`} value={inr(gstOf(summary.first.amount, s.taxRate))} />
                  <Row label="First payment" value={inr(summary.first.total)} strong />
                </div>
              )}
              {summary?.after && (
                <p className="text-[13px] text-ink-muted m-0 mb-4">
                  Then <strong className="text-ink tabular-nums">{inr(summary.after.amount)}</strong> + GST ({inr(summary.after.total)}) every {summary.after.per}, plus {selected?.commissionPercent}% on
                  checkout orders — collected with each payment.
                </p>
              )}

              {isStaff ? (
                <p className="text-sm text-ink m-0">Only the store owner or an admin can complete the subscription.</p>
              ) : (
                <>
                  {!oneTime && (
                    <Checkbox checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="!text-[13px] !text-ink-muted mb-4">
                      I authorise Oyklane to charge my {METHODS.find((m) => m.key === method)?.label.toLowerCase()} automatically for this subscription and its checkout fees until I cancel. I can cancel any time from Settings.
                    </Checkbox>
                  )}
                  <Button
                    type="primary"
                    size="large"
                    block
                    loading={busy}
                    disabled={unavailable || (!oneTime && !agreed)}
                    onClick={pay}
                    className="!h-11 font-medium"
                  >
                    {payLabel}
                  </Button>
                </>
              )}
              <p className="flex items-start gap-1.5 text-xs text-ink-muted m-0 mt-3">
                <ShieldCheck size={13} className="mt-[1px] shrink-0" aria-hidden="true" />
                Payments are processed by Razorpay. Oyklane never sees your card or bank details. All prices exclude {s.taxRate}% GST, shown separately.
              </p>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

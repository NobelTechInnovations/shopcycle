"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Checkbox, Segmented } from "antd";
import { ArrowLeft, ArrowRight, Check, CreditCard, Landmark, ShieldCheck, Smartphone } from "lucide-react";
import { BrandMark } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { inr, withGst, formatDay, METHODS, completeCheckout } from "@/lib/billing";
import { BillingModeNotice } from "@/components/BillingModeNotice";
import { PlanCards } from "@/components/PlanCards";

const METHOD_ICON = { upi: Smartphone, card: CreditCard, emandate: Landmark };
// Bank e-mandate first: no ₹1 check, and it suits a recurring business charge.
const METHOD_ORDER = ["emandate", "upi", "card"];

function Steps({ step }) {
  const items = ["Choose a plan", "Turn on autopay"];
  return (
    <ol className="flex items-center gap-3 m-0 p-0 list-none text-[13px]" aria-label="Setup steps">
      {items.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const current = n === step;
        return (
          <li key={label} className="flex items-center gap-3" aria-current={current ? "step" : undefined}>
            {i > 0 && <span className="w-8 h-px bg-app-border" aria-hidden="true" />}
            <span className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                  done ? "bg-status-success text-white" : current ? "bg-ink text-white" : "bg-app-surface border border-app-border text-ink-muted"
                }`}
              >
                {done ? <Check size={13} strokeWidth={3} aria-hidden="true" /> : n}
              </span>
              <span className={current ? "text-ink font-medium" : "text-ink-muted"}>{label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1 ${strong ? "text-[15px] font-semibold text-ink" : "text-[13px] text-ink-muted"}`}>
      <span>{label}</span>
      <span className="tabular-nums text-ink">{value}</span>
    </div>
  );
}

export function Welcome({ initial, storeName, userName }) {
  const router = useRouter();
  const { message } = App.useApp();
  const [billing, setBilling] = useState(initial);
  const [step, setStep] = useState(1);
  const sub = billing.subscription;
  const s = billing.settings || {};
  const plans = billing.plans || [];
  const [interval, setInterval] = useState(sub?.interval || "month");
  const [planId, setPlanId] = useState(() => plans.find((p) => p.key === "growth")?.id || sub?.planId || plans[0]?.id);
  const [method, setMethod] = useState("emandate");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  const selected = plans.find((p) => p.id === planId);
  const firstName = (userName || "").split(" ")[0];
  const regular = selected ? (interval === "year" ? selected.priceYearly : selected.priceMonthly) : 0;
  const firstAmount = sub?.introAvailable && interval === "month" ? s.introPrice : regular;
  const unavailable = billing.mode === "unconfigured";
  const methods = METHOD_ORDER.map((k) => METHODS.find((m) => m.key === k)).filter(Boolean);

  async function choosePlan() {
    setBusy(true);
    try {
      const res = await apiFetch("/api/billing/setup/plan", { method: "POST", body: { planId, interval } });
      setBilling(res.billing);
      setStep(2);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      message.error(err.message);
    }
    setBusy(false);
  }

  function finish(text) {
    if (text) message.success(text);
    router.push("/admin");
    router.refresh();
  }

  async function turnOnAutopay() {
    setBusy(true);
    try {
      const started = await apiFetch("/api/billing/checkout", { method: "POST", body: { method } });
      const done = await completeCheckout(apiFetch, started);
      if (!done) {
        setBusy(false);
        return;
      }
      const fresh = done.billing || (await apiFetch("/api/billing"));
      if (fresh.mandate?.status === "pending") return finish("Your bank is confirming the e-mandate — usually 1–3 working days. We'll email you once it's on.");
      return finish("Autopay is on. Nothing is charged until your trial ends.");
    } catch (err) {
      message.error(err.message);
    }
    setBusy(false);
  }

  return (
    <div className="min-h-screen bg-app-bg">
      <header className="border-b border-app-border bg-app-surface">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <BrandMark />
          <Steps step={step} />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-32">
        {step === 1 ? (
          <>
            <p className="text-sm text-ink-muted m-0 mb-1">{firstName ? `Welcome, ${firstName}` : "Welcome"} 👋</p>
            <h1 className="text-[26px] sm:text-[32px] font-semibold text-ink m-0" style={{ letterSpacing: "-0.025em", textWrap: "balance" }}>
              Choose a plan for {storeName}
            </h1>
            <p className="text-[15px] text-ink-muted mt-2 mb-6 max-w-2xl">
              Your {s.trialDays}-day free trial runs on the plan you pick
              {s.introEnabled && sub?.introAvailable ? `, then it's ${inr(s.introPrice)} for your first month` : ""}. You can switch plans any time during the
              trial.
            </p>

            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <Segmented
                value={interval}
                onChange={setInterval}
                options={[
                  { label: "Monthly", value: "month" },
                  { label: `Yearly · save ${s.annualDiscountPercent ?? 20}%`, value: "year" },
                ]}
              />
              <span className="text-xs text-ink-muted">Prices exclude {s.taxRate ?? 18}% GST.</span>
            </div>
            <PlanCards plans={plans} value={planId} onChange={setPlanId} interval={interval} recommended="growth" />
          </>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
            <div className="min-w-0">
              <button type="button" onClick={() => setStep(1)} className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink mb-4">
                <ArrowLeft size={15} aria-hidden="true" /> Change plan
              </button>
              <h1 className="text-[26px] sm:text-[32px] font-semibold text-ink m-0" style={{ letterSpacing: "-0.025em" }}>
                Turn on autopay
              </h1>
              <p className="text-[15px] text-ink-muted mt-2 mb-6 max-w-2xl">
                Keep {storeName} running without a break when your trial ends on <strong className="text-ink font-medium">{formatDay(sub?.trialEndsAt)}</strong>. Nothing
                is charged today.
              </p>
              <BillingModeNotice billing={billing} className="mb-5" />

              <h2 className="text-[15px] font-semibold text-ink m-0 mb-3">How you'll pay</h2>
              <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Payment method">
                {methods.map((m) => {
                  const Icon = METHOD_ICON[m.key];
                  const active = m.key === method;
                  const limit = s.mandateMaxAmount?.[m.key];
                  const tooBig = limit && withGst(regular, s.taxRate ?? 18) > limit;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={tooBig}
                      onClick={() => setMethod(m.key)}
                      className={`relative text-left rounded-xl bg-app-surface p-4 transition-shadow ${
                        active ? "border-2 border-ink shadow-raised" : "border border-app-border shadow-card hover:border-ink/40"
                      } ${tooBig ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      {m.key === "emandate" && <span className="absolute top-3 right-3 rounded-full bg-status-success/10 text-status-success px-2 py-0.5 text-[11px] font-medium">No ₹1 check</span>}
                      <Icon size={20} className="text-ink" aria-hidden="true" />
                      <span className="block text-sm font-semibold text-ink mt-2.5">{m.label}</span>
                      <span className="block text-xs text-ink-muted mt-0.5 leading-snug">{tooBig ? `Up to ${inr(limit)} per payment` : m.hint}</span>
                    </button>
                  );
                })}
              </div>

              <ul className="mt-6 grid gap-2 p-0 m-0 list-none text-[13px] text-ink">
                {[
                  "Cancel or change the payment method any time from Settings ▸ Plan & billing.",
                  "We remind you before every charge.",
                  "Your checkout fees are collected with the subscription — no separate bills.",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <Check size={14} className="text-status-success mt-[2px] shrink-0" aria-hidden="true" /> {t}
                  </li>
                ))}
              </ul>
            </div>

            <aside className="lg:sticky lg:top-6 rounded-[14px] border border-app-border bg-app-surface shadow-card p-5">
              <h2 className="text-[15px] font-semibold text-ink m-0 mb-3">
                {selected?.name} plan · {interval === "year" ? "yearly" : "monthly"}
              </h2>
              <div className="border-b border-app-border pb-3 mb-3">
                <Row label="Due today" value={method === "emandate" ? inr(0) : `${inr(1)} (refunded)`} strong />
                <p className="text-xs text-ink-muted m-0 mt-1">
                  {method === "emandate" ? "Your bank approves the mandate — no money moves today." : "A ₹1 check confirms autopay and is refunded straight away."}
                </p>
              </div>
              <Row
                label={`${formatDay(sub?.trialEndsAt)} · ${sub?.introAvailable && interval === "month" ? "first month (intro price)" : `first ${interval}`}`}
                value={inr(firstAmount)}
              />
              <Row label={`GST (${s.taxRate ?? 18}%)`} value={inr(withGst(firstAmount, s.taxRate ?? 18) - firstAmount)} />
              <Row label="First payment" value={inr(withGst(firstAmount, s.taxRate ?? 18))} strong />
              <p className="text-[13px] text-ink-muted mt-2 mb-4">
                Then {inr(regular)} + GST every {interval === "year" ? "year" : "month"}, plus {selected?.commissionPercent}% on checkout orders.
              </p>

              <Checkbox checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="!text-[13px] !text-ink-muted mb-4">
                I authorise Oyklane to charge my {METHODS.find((m) => m.key === method)?.label.toLowerCase()} automatically for this subscription and its checkout fees until I cancel.
              </Checkbox>
              <Button type="primary" size="large" block loading={busy} disabled={unavailable || !agreed} onClick={turnOnAutopay} className="!h-11 font-medium">
                Turn on autopay
              </Button>
              <Button type="text" block className="!mt-2 !text-ink-muted" disabled={busy} onClick={() => finish()}>
                Skip for now
              </Button>
              <p className="flex items-start gap-1.5 text-xs text-ink-muted m-0 mt-3">
                <ShieldCheck size={13} className="mt-[1px] shrink-0" aria-hidden="true" />
                Payments are processed by Razorpay. Oyklane never sees your card or bank details.
              </p>
            </aside>
          </div>
        )}
      </main>

      {step === 1 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-app-border bg-app-surface/95 backdrop-blur">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
            <p className="m-0 text-sm text-ink min-w-0 truncate">
              {selected ? (
                <>
                  <strong className="font-semibold">{selected.name}</strong>
                  <span className="text-ink-muted">
                    {" "}
                    · {inr(regular)}/{interval === "year" ? "year" : "month"} after your {s.trialDays}-day trial
                  </span>
                </>
              ) : (
                <span className="text-ink-muted">Choose a plan to continue</span>
              )}
            </p>
            <Button type="primary" size="large" disabled={!selected} loading={busy} onClick={choosePlan} className="!h-11 shrink-0">
              Continue <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

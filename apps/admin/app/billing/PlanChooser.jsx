"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, X, Crown, AlertTriangle, ArrowLeft, ShieldCheck } from "lucide-react";
import { App, Button } from "antd";
import { BrandMark } from "@shopcycle/ui";
import { formatCurrency } from "@shopcycle/utils";
import { apiFetch } from "@/lib/api";
import { FEATURE_ROWS } from "@/lib/plans";
import { BillingModeNotice } from "@/components/BillingModeNotice";

function FeatureCell({ value }) {
  if (typeof value === "string") return <span className="text-sm text-ink font-medium tabular-nums">{value}</span>;
  return value ? (
    <Check className="w-4 h-4 text-status-success" aria-label="Included" />
  ) : (
    <X className="w-4 h-4 text-ink-subtle" aria-label="Not included" />
  );
}

const STATUS_BANNER = {
  needs_plan: "Choose a plan and authorize billing to keep using your admin. Your storefront stays live either way.",
  admin_blocked:
    "Your last payment failed and it's been over 7 days — admin access is paused until billing is fixed. Your storefront is still live for now.",
  storefront_blocked:
    "Your last payment failed 15+ days ago — both your admin and storefront are paused. Fix billing below to restore them.",
};

export function PlanChooser({ plans, billing, storeName, currentPlanId }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { message } = App.useApp();
  const [subscribing, setSubscribing] = useState(null);

  useEffect(() => {
    const billingError = searchParams.get("billingError");
    if (billingError) message.error(billingError);
  }, [searchParams, message]);

  const banner = STATUS_BANNER[billing.accessState];
  const unavailable = billing.mode === "unconfigured";
  const sandbox = billing.mode === "sandbox";

  async function handleChoose(plan) {
    setSubscribing(plan.id);
    try {
      const res = await apiFetch("/api/store/subscribe", { method: "POST", body: { planId: plan.id } });
      if (res.sandbox) {
        message.success(`${plan.name} is on — your free month has started (test mode, no payment taken)`);
        router.push("/admin/settings/billing");
        router.refresh();
        return;
      }
      router.push(
        `/billing/pay?subscriptionId=${encodeURIComponent(res.subscriptionId)}&key=${encodeURIComponent(
          res.razorpayKeyId
        )}&planId=${encodeURIComponent(res.planId)}`
      );
    } catch (err) {
      message.error(err.message);
      setSubscribing(null);
    }
  }

  const minPrice = plans[0]?.priceMonthly ?? 0;
  const maxPrice = plans.at(-1)?.priceMonthly ?? 0;

  return (
    <div className="min-h-screen bg-app-bg px-4 py-8 sm:py-12">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-10">
          <BrandMark />
          <Link
            href="/admin/settings/billing"
            className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink transition-colors"
          >
            <ArrowLeft size={15} aria-hidden="true" />
            Back to admin
          </Link>
        </div>

        <div className="text-center mb-8">
          <p className="text-sm text-ink-muted mb-1.5">{storeName}</p>
          <h1 className="text-[28px] sm:text-[32px] font-semibold text-ink m-0" style={{ letterSpacing: "-0.025em" }}>
            Choose your plan
          </h1>
          <p className="text-sm text-ink-muted mt-2 max-w-xl mx-auto">
            Your first month is free on either plan. Switch or cancel any time from Settings. Prices include GST.
          </p>
        </div>

        <div className="flex flex-col gap-3 mb-8 max-w-3xl mx-auto">
          {banner && (
            <div className="flex items-start gap-2.5 rounded-lg border border-status-danger/30 bg-status-danger/5 px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-status-danger mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-sm text-status-danger m-0">{banner}</p>
            </div>
          )}
          <BillingModeNotice billing={billing} />
        </div>

        <div className="grid gap-5 md:grid-cols-2 max-w-3xl mx-auto">
          {plans.map((plan) => {
            const isPremium = plan.name.toLowerCase() === "premium";
            const isCurrent = plan.id === currentPlanId && !["no_plan", "cancelled"].includes(billing.subscriptionStatus);
            return (
              <div
                key={plan.id}
                className={`relative rounded-[14px] bg-app-surface p-6 flex flex-col ${
                  isPremium ? "border-2 border-ink shadow-raised" : "border border-app-border shadow-card"
                }`}
              >
                {isPremium && (
                  <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1 text-xs font-medium text-white">
                    <Crown className="w-3 h-3" aria-hidden="true" /> Most features
                  </span>
                )}
                <h2 className="text-lg font-semibold text-ink m-0">{plan.name}</h2>
                <p className="text-sm text-ink-muted mt-1 mb-5 min-h-[2.5em]">{plan.description}</p>
                <p className="m-0 flex items-baseline gap-1">
                  <span className="text-[34px] font-semibold text-ink tabular-nums" style={{ letterSpacing: "-0.03em" }}>
                    {formatCurrency(plan.priceMonthly, "INR")}
                  </span>
                  <span className="text-sm text-ink-muted">/month</span>
                </p>
                <p className="text-xs text-ink-muted mt-1 mb-0">+ {Number(plan.commissionPercent)}% platform fee on paid orders</p>

                <ul className="flex-1 mt-6 mb-6 flex flex-col border-t border-app-border">
                  {FEATURE_ROWS.map((row) => (
                    <li key={row.label} className="flex items-center justify-between gap-3 text-sm py-2.5 border-b border-app-border">
                      <span className="text-ink-muted">{row.label}</span>
                      <FeatureCell value={row.render(plan)} />
                    </li>
                  ))}
                </ul>

                <Button
                  type={isPremium ? "primary" : "default"}
                  size="large"
                  block
                  disabled={isCurrent || unavailable}
                  loading={subscribing === plan.id}
                  onClick={() => handleChoose(plan)}
                  className="!h-11 font-medium"
                >
                  {isCurrent ? "Current plan" : `Start free month on ${plan.name}`}
                </Button>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-ink-muted text-center mt-8 max-w-xl mx-auto flex items-start justify-center gap-1.5">
          <ShieldCheck size={14} className="shrink-0 mt-px" aria-hidden="true" />
          <span>
            {sandbox
              ? "Test mode: no mandate is set up and nothing is charged."
              : `You'll authorize a Razorpay mandate for ${formatCurrency(minPrice, "INR")}${
                  maxPrice !== minPrice ? `–${formatCurrency(maxPrice, "INR")}` : ""
                } a month, depending on the plan. The first charge is in 30 days — cancel before then and you pay nothing.`}
          </span>
        </p>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, X, Crown, AlertTriangle } from "lucide-react";
import { App, Button } from "antd";
import { formatCurrency } from "@shopcycle/utils";
import { apiFetch } from "@/lib/api";

// Every row in the comparison table — keyed to the exact Plan booleans/
// numbers from the schema (see packages/database/prisma/schema.prisma) so
// this list never drifts out of sync with what a plan actually unlocks.
// `render(plan)` returns either a boolean (Check/X) or a string (shown as
// plain text, e.g. "2.5%").
const FEATURE_ROWS = [
  { label: "Products & staff", render: (p) => `Up to ${p.staffLimit} staff accounts` },
  { label: "Commission per order", render: (p) => `${Number(p.commissionPercent)}%` },
  { label: "1-click checkout", render: () => true },
  { label: "Customizable cart", render: (p) => p.cartCustomizable },
  { label: "GST software", render: (p) => p.hasGstSoftware },
  { label: "In-built Ads Manager", render: (p) => p.hasAdsManagerIncluded },
  { label: "Meta Ads Manager", render: (p) => p.hasMetaAds },
  { label: "Paid apps included free", render: (p) => p.paidAppsIncluded },
  { label: "Premium themes included", render: (p) => p.premiumThemesIncluded },
  { label: "WhatsApp integration", render: (p) => p.hasWhatsappIntegration },
  { label: "Social media manager", render: (p) => p.hasSocialMediaManager },
  { label: "Priority support", render: (p) => p.prioritySupport },
  { label: "API access", render: (p) => p.hasApiAccess },
  { label: "CSV export (orders, customers, products)", render: (p) => p.hasCsvExport },
];

function FeatureCell({ value }) {
  if (typeof value === "string") return <span className="text-sm text-ink">{value}</span>;
  return value ? (
    <Check className="w-4 h-4 text-status-success" aria-label="Included" />
  ) : (
    <X className="w-4 h-4 text-ink-muted/50" aria-label="Not included" />
  );
}

const STATUS_BANNER = {
  needs_plan: {
    tone: "danger",
    text: "Choose a plan and authorize billing to keep using your admin. Your storefront stays live either way.",
  },
  admin_blocked: {
    tone: "danger",
    text: "Your last payment failed and it's been over 7 days — admin access is paused until billing is fixed. Your storefront is still live for now.",
  },
  storefront_blocked: {
    tone: "danger",
    text: "Your last payment failed 15+ days ago — both your admin and storefront are paused. Fix billing below to restore them.",
  },
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

  async function handleChoose(plan) {
    setSubscribing(plan.id);
    try {
      const { subscriptionId, razorpayKeyId, planId } = await apiFetch("/api/store/subscribe", {
        method: "POST",
        body: { planId: plan.id },
      });
      router.push(
        `/billing/pay?subscriptionId=${encodeURIComponent(subscriptionId)}&key=${encodeURIComponent(
          razorpayKeyId
        )}&planId=${encodeURIComponent(planId)}`
      );
    } catch (err) {
      message.error(err.message);
      setSubscribing(null);
    }
  }

  return (
    <div className="min-h-screen bg-app-bg px-4 py-10">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <p className="text-sm text-ink-muted mb-1">{storeName}</p>
          <h1 className="text-2xl font-semibold text-ink m-0">Choose your plan</h1>
          <p className="text-sm text-ink-muted mt-2">
            Authorize a Razorpay mandate now — you won't be charged for a full month. Cancel anytime before then and
            you pay nothing.
          </p>
        </div>

        {banner && (
          <div className="mb-6 flex items-start gap-2.5 rounded-lg border border-status-danger/30 bg-status-danger/5 px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-status-danger mt-0.5 shrink-0" />
            <p className="text-sm text-status-danger m-0">{banner.text}</p>
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          {plans.map((plan) => {
            const isPremium = plan.name.toLowerCase() === "premium";
            const isCurrent = plan.id === currentPlanId && billing.subscriptionStatus !== "no_plan";
            return (
              <div
                key={plan.id}
                className={`relative rounded-lg border bg-app-surface p-6 flex flex-col ${
                  isPremium ? "border-brand shadow-card" : "border-app-border"
                }`}
              >
                {isPremium && (
                  <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1 text-xs font-medium text-white">
                    <Crown className="w-3 h-3" /> Most features
                  </span>
                )}
                <h2 className="text-lg font-semibold text-ink m-0">{plan.name}</h2>
                <p className="text-sm text-ink-muted mt-1 mb-4 min-h-[2.5em]">{plan.description}</p>
                <p className="text-3xl font-semibold text-ink m-0">
                  {formatCurrency(plan.priceMonthly, "INR")}
                  <span className="text-sm font-normal text-ink-muted">/month</span>
                </p>

                <ul className="flex-1 mt-5 mb-6 space-y-2.5">
                  {FEATURE_ROWS.map((row) => (
                    <li key={row.label} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-ink-muted">{row.label}</span>
                      <FeatureCell value={row.render(plan)} />
                    </li>
                  ))}
                </ul>

                <Button
                  type={isPremium ? "primary" : "default"}
                  size="large"
                  block
                  disabled={isCurrent}
                  loading={subscribing === plan.id}
                  onClick={() => handleChoose(plan)}
                  className="!h-11"
                >
                  {isCurrent
                    ? "Current plan"
                    : billing.subscriptionStatus === "no_plan"
                      ? `Choose ${plan.name} — free for 1 month`
                      : `Switch to ${plan.name}`}
                </Button>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-ink-muted text-center mt-6">
          You'll authorize a Razorpay mandate for {formatCurrency(plans[0]?.priceMonthly ?? 0, "INR")}
          {plans[1] ? `–${formatCurrency(plans[1].priceMonthly, "INR")}` : ""} depending on the plan you pick. The
          first real charge happens in 30 days — cancel the mandate in Settings ▸ Billing before then to pay nothing.
        </p>
      </div>
    </div>
  );
}

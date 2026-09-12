"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, Button, Tag, App } from "antd";
import { formatCurrency } from "@shopcycle/utils";
import { apiFetch } from "@/lib/api";

function daysLeft(dateStr) {
  if (!dateStr) return null;
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

// billing.subscriptionStatus (see apps/api/src/modules/billing/service.js
// #serializeBillingStatus) → how it reads on this screen. `no_plan` isn't
// listed here — a store on it never actually reaches this tab, since
// admin/layout.jsx redirects it to /billing the moment the grace period
// (billing.graceDays) runs out, and while still in grace there's nothing
// wrong to report yet.
const STATUS_TAGS = {
  trialing: { color: "blue", label: "Free trial" },
  active: { color: "green", label: "Active" },
  past_due: { color: "red", label: "Payment failed" },
  cancelled: { color: "default", label: "Cancelled" },
};

export function BillingSettings() {
  const { message } = App.useApp();
  const [store, setStore] = useState(null);
  const [plans, setPlans] = useState([]);
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [storeData, billingData] = await Promise.all([
        apiFetch("/api/store"),
        apiFetch("/api/store/billing"),
      ]);
      setStore(storeData.store);
      setPlans(billingData.plans);
      setBilling(billingData.billing);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Only for a store already actively billed — swaps limits/features on
  // this database without touching the Razorpay mandate itself (see the
  // doc comment on switchPlanHandler in stores/controller.js for why the
  // price charged doesn't change until the merchant re-subscribes).
  async function handleSwitch(plan) {
    setSwitching(plan.id);
    try {
      await apiFetch("/api/store/plan", { method: "POST", body: { planId: plan.id } });
      message.success(`Switched to the ${plan.name} plan`);
      load();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSwitching(null);
    }
  }

  const trial = billing ? daysLeft(billing.trialEndsAt) : null;
  const canSwitchInPlace = billing && ["trialing", "active"].includes(billing.subscriptionStatus);
  const statusTag = billing && STATUS_TAGS[billing.subscriptionStatus];

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <Card size="small" title="Current plan" loading={loading}>
        {store?.plan && billing && (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-semibold m-0">{store.plan.name}</p>
              <p className="text-sm text-ink-muted m-0">
                {formatCurrency(store.plan.priceMonthly, "INR")}/month · up to {store.plan.productLimit} products ·
                up to {store.plan.staffLimit} staff
              </p>
            </div>
            <div className="flex items-center gap-2">
              {trial !== null && trial > 0 && billing.subscriptionStatus === "trialing" && (
                <Tag color="blue">{trial} days left in trial</Tag>
              )}
              {statusTag && <Tag color={statusTag.color}>{statusTag.label}</Tag>}
            </div>
          </div>
        )}
        {billing?.subscriptionStatus === "past_due" && (
          <p className="text-xs text-status-danger mt-3 mb-0">
            Your last payment on file failed. Update your payment method on Razorpay or{" "}
            <Link href="/billing" className="underline">
              set up a new mandate
            </Link>{" "}
            to avoid admin access being paused.
          </p>
        )}
        {billing?.subscriptionStatus === "cancelled" && (
          <p className="text-xs text-ink-muted mt-3 mb-0">
            Your subscription was cancelled.{" "}
            <Link href="/billing" className="underline">
              Choose a plan
            </Link>{" "}
            to reactivate.
          </p>
        )}
      </Card>

      <Card size="small" title="Available plans">
        <p className="text-xs text-ink-muted mt-0 mb-3">
          {canSwitchInPlace
            ? "Switching plans below updates your limits and features immediately. Your Razorpay mandate keeps billing at your original plan's price until you re-subscribe from the billing page."
            : "Manage your plan and Razorpay mandate from the billing page."}
        </p>
        <div className="flex flex-col gap-2">
          {plans.map((plan) => {
            const isCurrent = store?.planId === plan.id;
            return (
              <div key={plan.id} className="flex items-center justify-between py-3 border-t border-app-border first:border-t-0">
                <div>
                  <p className="text-sm font-medium m-0">
                    {plan.name} — {formatCurrency(plan.priceMonthly, "INR")}/mo
                  </p>
                  <p className="text-xs text-ink-muted m-0">{plan.description}</p>
                </div>
                {canSwitchInPlace ? (
                  <Button
                    size="small"
                    type={isCurrent ? "default" : "primary"}
                    disabled={isCurrent}
                    loading={switching === plan.id}
                    onClick={() => handleSwitch(plan)}
                  >
                    {isCurrent ? "Current plan" : "Switch"}
                  </Button>
                ) : (
                  <Link href="/billing">
                    <Button size="small" type={isCurrent ? "default" : "primary"} disabled={isCurrent}>
                      {isCurrent ? "Current plan" : "Choose"}
                    </Button>
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

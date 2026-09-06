"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Button, Tag, App } from "antd";
import { formatCurrency } from "@shopcycle/utils";
import { apiFetch } from "@/lib/api";

function daysLeft(dateStr) {
  if (!dateStr) return null;
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export function BillingSettings() {
  const { message } = App.useApp();
  const [store, setStore] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [storeData, plansData] = await Promise.all([
        apiFetch("/api/store"),
        apiFetch("/api/store/plans"),
      ]);
      setStore(storeData.store);
      setPlans(plansData.plans);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  const trial = store ? daysLeft(store.trialEndsAt) : null;

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <Card size="small" title="Current plan" loading={loading}>
        {store?.plan && (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-semibold m-0">{store.plan.name}</p>
              <p className="text-sm text-ink-muted m-0">
                {formatCurrency(store.plan.priceMonthly, store.currency)}/month · up to {store.plan.productLimit}{" "}
                products · up to {store.plan.staffLimit} staff
              </p>
            </div>
            {trial !== null && trial > 0 && <Tag color="blue">{trial} days left in trial</Tag>}
          </div>
        )}
      </Card>

      <Card size="small" title="Available plans">
        <p className="text-xs text-ink-muted mt-0 mb-3">
          This is a demo billing flow — switching plans updates your limits immediately and doesn&apos;t charge a
          real card.
        </p>
        <div className="flex flex-col gap-2">
          {plans.map((plan) => {
            const isCurrent = store?.planId === plan.id;
            return (
              <div key={plan.id} className="flex items-center justify-between py-3 border-t border-app-border first:border-t-0">
                <div>
                  <p className="text-sm font-medium m-0">
                    {plan.name} — {formatCurrency(plan.priceMonthly, store?.currency)}/mo
                  </p>
                  <p className="text-xs text-ink-muted m-0">{plan.description}</p>
                </div>
                <Button
                  size="small"
                  type={isCurrent ? "default" : "primary"}
                  disabled={isCurrent}
                  loading={switching === plan.id}
                  onClick={() => handleSwitch(plan)}
                >
                  {isCurrent ? "Current plan" : "Switch"}
                </Button>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

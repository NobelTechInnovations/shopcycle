"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { inr } from "@/lib/billing";

/** Every new store starts by choosing its plan (antd form control:
 * value / onChange = the plan's key). Prices come from the API, so they
 * always match what Super admin ▸ Plans says. */
export function PlanPicker({ value, onChange }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch("/api/auth/plans")
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="text-sm text-status-danger m-0">Couldn't load the plans: {error}</p>;
  if (!data) return <div className="h-[116px] rounded-lg bg-app-bg animate-pulse" />;

  return (
    <div>
      <div role="radiogroup" aria-label="Plan" className="grid gap-2 sm:grid-cols-3">
        {data.plans.map((p) => {
          const selected = value === p.key;
          return (
            <button
              key={p.key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange?.(p.key)}
              className={`relative text-left rounded-lg border px-3 py-2.5 transition-colors ${selected ? "border-ink bg-app-surface ring-1 ring-ink" : "border-app-border bg-app-surface hover:border-ink/40"}`}
            >
              {selected && <Check size={14} className="absolute top-2.5 right-2.5 text-ink" aria-hidden="true" />}
              <span className="block text-sm font-semibold text-ink">{p.name}</span>
              <span className="block text-[13px] text-ink mt-0.5">
                {inr(p.priceMonthly)}
                <span className="text-ink-muted">/mo</span>
              </span>
              <span className="block text-xs text-ink-muted mt-1 leading-snug">
                {p.commissionPercent}% fee · {p.staffLimit} staff
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-ink-muted mt-2 mb-0">
        {data.trialDays}-day free trial{data.introEnabled ? `, then ${inr(data.introPrice)} for your first month` : ""}. Prices exclude GST. No payment needed now; you can change plans during the trial.
      </p>
    </div>
  );
}

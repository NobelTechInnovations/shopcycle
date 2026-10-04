"use client";

import { Check } from "lucide-react";
import { inr } from "@/lib/billing";

const price = (p, interval) => (interval === "year" ? p.priceYearly : p.priceMonthly);

/**
 * The plans as selectable cards (/welcome and /billing). Each card lists
 * only what it adds over the plan before it. `locked` greys out every plan
 * but the selected one (a plan that can't be changed right now).
 */
export function PlanCards({ plans, value, onChange, interval = "month", locked = false, recommended }) {
  return (
    <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Plans">
      {plans.map((p, i) => {
        const active = p.id === value;
        const prev = plans[i - 1];
        const extra = prev ? p.features.filter((f) => !prev.features.some((x) => x.key === f.key)) : p.features;
        const disabled = locked && !active;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => !locked && onChange?.(p.id)}
            className={`relative text-left rounded-[14px] bg-app-surface p-5 flex flex-col transition-shadow ${
              active ? "border-2 border-ink shadow-raised" : "border border-app-border shadow-card hover:border-ink/40"
            } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            {recommended === p.key && (
              <span className="absolute -top-2.5 left-5 rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-medium text-white">Most popular</span>
            )}
            <span className="flex items-center justify-between gap-2">
              <span className="text-base font-semibold text-ink">{p.name}</span>
              <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${active ? "border-ink bg-ink" : "border-app-border"}`} aria-hidden="true">
                {active && <Check size={10} strokeWidth={3} className="text-white" />}
              </span>
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
  );
}

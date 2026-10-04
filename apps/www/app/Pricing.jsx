"use client";

import { useState } from "react";

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function Tick() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** The plans, live from the platform (see plans.js), with a monthly/yearly
 * switch. Each plan lists what it adds over the one before it. */
export function Pricing({ data, appUrl }) {
  const [yearly, setYearly] = useState(false);
  const { plans } = data;
  return (
    <>
      <div className="billing-switch" role="radiogroup" aria-label="Billing period">
        <button type="button" role="radio" aria-checked={!yearly} className={!yearly ? "is-on" : ""} onClick={() => setYearly(false)}>
          Monthly
        </button>
        <button type="button" role="radio" aria-checked={yearly} className={yearly ? "is-on" : ""} onClick={() => setYearly(true)}>
          Yearly <span className="save">Save {data.annualDiscountPercent}%</span>
        </button>
      </div>
      <div className="plans">
        {plans.map((p, i) => {
          const prev = plans[i - 1];
          const extra = (prev ? p.features.filter((f) => !prev.features.some((x) => x.key === f.key)) : p.features).slice(0, 7);
          const featured = p.key === "growth";
          const perMonth = yearly ? p.priceYearly / 12 : p.priceMonthly;
          return (
            <div key={p.key} className={`plan${featured ? " plan--featured" : ""}`}>
              {featured && <span className="plan__badge">Most popular</span>}
              <div>
                <h3 className="h3">{p.name}</h3>
                <p className="muted">{p.tagline}</p>
              </div>
              <div>
                <p className="plan__price">
                  <strong>{inr(perMonth)}</strong>
                  <span className="muted">/month</span>
                </p>
                <p className="plan__sub">{yearly ? `${inr(p.priceYearly)} billed yearly · save ${inr(p.priceMonthly * 12 - p.priceYearly)}` : "Billed monthly · + GST"}</p>
              </div>
              <ul>
                {prev && (
                  <li className="plan__base">
                    <Tick /> Everything in {prev.name}
                  </li>
                )}
                {extra.map((f) => (
                  <li key={f.key}>
                    <Tick /> {f.name}
                  </li>
                ))}
                <li>
                  <Tick /> {p.staffLimit} staff accounts · unlimited products
                </li>
                <li>
                  <Tick /> {p.commissionPercent}% fee per paid order
                </li>
              </ul>
              <a href={`${appUrl}/register`} className={`btn ${featured ? "btn--primary" : "btn--ghost"}`}>
                Start with {p.name}
              </a>
            </div>
          );
        })}
      </div>
      <p className="plans__note">
        {data.trialDays}-day free trial{data.introEnabled ? `, then ${inr(data.introPrice)} for your first month` : ""} on any plan. Prices exclude 18% GST. The
        One-Click Checkout app adds 0.3% to the per-order fee.
      </p>
    </>
  );
}

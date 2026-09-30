"use client";

import { useMemo, useState } from "react";
import { APP_CATEGORY, APP_LOGO } from "../data/apps";
import { Logo } from "../components/Logo";

const price = (n) => `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}/month`;

/** The live app catalog with a category filter. */
export function AppsBrowser({ apps, appUrl }) {
  const [cat, setCat] = useState("all");
  const cats = useMemo(() => [...new Set(apps.map((a) => a.category))].sort((a, b) => Object.keys(APP_CATEGORY).indexOf(a) - Object.keys(APP_CATEGORY).indexOf(b)), [apps]);
  const shown = apps.filter((a) => cat === "all" || a.category === cat);
  return (
    <>
      <div className="filters" role="group" aria-label="Filter apps">
        <button type="button" aria-pressed={cat === "all"} onClick={() => setCat("all")}>
          All apps
        </button>
        {cats.map((c) => (
          <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}>
            {APP_CATEGORY[c] || c}
          </button>
        ))}
      </div>
      <div className="cards">
        {shown.map((a) => {
          const logo = APP_LOGO[a.key] || { icon: "puzzle" };
          return (
            <article className="card" key={a.key}>
              <div className="card__top">
                <Logo {...logo} size={48} />
                {a.priceMonthly ? <span className="badge badge--paid">{price(a.priceMonthly)}</span> : <span className="badge badge--built">Free</span>}
              </div>
              <h3>{a.name}</h3>
              <p>{a.description}</p>
              <div className="card__foot">
                <span>{APP_CATEGORY[a.category] || "App"}{a.premium ? " · Growth & Pro" : ""}</span>
                <a href={`${appUrl}/register`} className="link-arrow" style={{ fontSize: 14 }}>
                  Install
                </a>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

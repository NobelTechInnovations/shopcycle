"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, I } from "./Icon";
import { StorefrontMock, CheckoutMock, FlowMock, DashboardMock } from "./mocks";

const SLIDES = [
  { key: "store", label: "Storefront", icon: I.store, render: () => <StorefrontMock /> },
  { key: "checkout", label: "Checkout", icon: I.bolt, render: () => <CheckoutMock /> },
  { key: "flow", label: "Automations", icon: I.flow, render: () => <FlowMock /> },
  { key: "dashboard", label: "Dashboard", icon: I.chart, render: () => <DashboardMock /> },
];
const EVERY = 7000;

/** The hero's product tour: tabs that advance on their own (paused while
 * hovered or focused, and for people who prefer less motion). */
export function HeroShowcase() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (paused || reduced.current) return undefined;
    const t = setTimeout(() => setI((n) => (n + 1) % SLIDES.length), EVERY);
    return () => clearTimeout(t);
  }, [i, paused]);

  const slide = SLIDES[i];
  return (
    <div
      className={`showcase${paused ? " is-paused" : ""}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="showcase__tabs" role="tablist" aria-label="Product tour">
        {SLIDES.map((s, n) => (
          <button key={s.key} type="button" role="tab" id={`tour-${s.key}`} aria-selected={n === i} aria-controls="tour-panel" className="showcase__tab" onClick={() => setI(n)}>
            <Icon d={s.icon} />
            {s.label}
            <span className="bar" key={`${n}-${i}`} />
          </button>
        ))}
      </div>
      <div className="showcase__stage" id="tour-panel" role="tabpanel" aria-labelledby={`tour-${slide.key}`}>
        <div className="slide" key={slide.key}>
          {slide.render()}
        </div>
      </div>
      <div className="dots">
        {SLIDES.map((s, n) => (
          <button key={s.key} type="button" aria-label={`Show ${s.label}`} aria-current={n === i} onClick={() => setI(n)} />
        ))}
      </div>
    </div>
  );
}

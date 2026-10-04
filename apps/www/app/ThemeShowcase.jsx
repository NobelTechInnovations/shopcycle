"use client";

import { useState } from "react";

const THEMES = [
  {
    key: "atelier",
    name: "Atelier",
    for: "Clothing & fashion",
    text: "A split Women / Men hero, category circles, shop-the-look with product dots and tall photos. Size and colour pickers on every product.",
    url: "loomwear.oyklane.com",
    colors: ["#ffffff", "#121212", "#c8102e", "#f4f4f2"],
    demo: true,
  },
  {
    key: "lumiere",
    name: "Lumière",
    for: "Jewellery & luxury",
    text: "Serif type, emerald and champagne gold, category arches, a craft story with facts, a gift guide and a hallmark-and-insurance trust row.",
    url: "maison-aurum.oyklane.com",
    colors: ["#f5f3ef", "#123b30", "#b8935a", "#1f2421"],
  },
  {
    key: "modern",
    name: "Modern",
    for: "D2C brands",
    text: "Bold and editorial — full-bleed hero, scrolling text, bento categories, promo tiles, reviews and FAQ.",
    url: "your-brand.oyklane.com",
    colors: ["#f3f3ef", "#0e0e0e", "#d7f75b", "#ffffff"],
  },
  {
    key: "classic",
    name: "Classic",
    for: "Any shop",
    text: "Clean and versatile — slideshow, collections, product rows, offers, reviews and a journal. Suits home, beauty and gifting too.",
    url: "your-brand.oyklane.com",
    colors: ["#ffffff", "#1a1a1a", "#d2452f", "#f6f3ee"],
  },
];

/** The theme library, one screenshot at a time. */
export function ThemeShowcase({ demoUrl, appUrl }) {
  const [active, setActive] = useState(THEMES[0].key);
  const t = THEMES.find((x) => x.key === active);

  function onKey(e, i) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const dir = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
    const next = THEMES[(i + dir + THEMES.length) % THEMES.length];
    setActive(next.key);
    document.getElementById(`tab-${next.key}`)?.focus();
  }

  return (
    <div className="themes">
      <ul className="themes__tabs" role="tablist" aria-label="Themes">
        {THEMES.map((x, i) => (
          <li key={x.key} role="presentation">
            <button
              id={`tab-${x.key}`}
              type="button"
              role="tab"
              aria-selected={x.key === active}
              aria-controls="theme-panel"
              tabIndex={x.key === active ? 0 : -1}
              className="theme-tab"
              onClick={() => setActive(x.key)}
              onKeyDown={(e) => onKey(e, i)}
            >
              <span className="theme-tab__top">
                <span className="theme-tab__name">{x.name}</span>
                <span className="theme-tab__for">{x.for}</span>
              </span>
              <span className="theme-tab__text">{x.text}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="themes__stage" id="theme-panel" role="tabpanel" aria-labelledby={`tab-${t.key}`}>
        <div className="browser">
          <div className="browser__bar">
            <span className="browser__dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="browser__url">{t.url}</span>
          </div>
          <div className="browser__screen">
            <img key={t.key} src={`/showcase/${t.key}.webp`} alt={`A store using the ${t.name} theme`} width="1440" height="1000" />
          </div>
        </div>
        <div className="themes__meta">
          <span className="swatches">
            {t.colors.map((c) => (
              <i key={c} style={{ background: c }} aria-hidden="true" />
            ))}
            <span>Colours, fonts and every section are yours to change.</span>
          </span>
          {t.demo && demoUrl ? (
            <a className="btn btn--ghost btn--sm" href={demoUrl} target="_blank" rel="noopener">
              Visit the live demo store ↗
            </a>
          ) : (
            <a className="btn btn--ghost btn--sm" href={`${appUrl}/register`}>
              Start with {t.name}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

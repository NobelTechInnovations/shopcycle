import Link from "next/link";
import { inr, CATEGORY_LABELS, withShots } from "@/lib/config";

export function Price({ item, suffix = true }) {
  if (item.free) return <span className="price price--free">Free</span>;
  return (
    <span className="price">
      {inr(item.price)}
      {suffix && item.kind === "app" ? <span className="subtle">/mo</span> : null}
    </span>
  );
}

/** A theme without screenshots, drawn in its own colours. */
export function ThemeMock({ swatch }) {
  const s = swatch || { bg: "#fff", surface: "#f2f2f5", text: "#111", accent: "#6d4dff" };
  return (
    <div className="mock" style={{ background: s.bg }} aria-hidden="true">
      <div className="mock__bar" style={{ background: s.text, width: "38%" }} />
      <div className="mock__hero" style={{ background: `linear-gradient(135deg, ${s.accent}, ${s.text})` }}>
        <i />
      </div>
      <div className="mock__row">
        {[0, 1, 2, 3].map((k) => (
          <span key={k} style={{ background: s.surface, border: `1px solid ${s.text}14` }} />
        ))}
      </div>
    </div>
  );
}

export function ThemeCard({ item: raw }) {
  const item = withShots(raw);
  return (
    <Link href={`/themes/${item.slug}`} className="card tcard">
      <div className="tcard__shot">{item.screenshots?.[0] ? <img src={item.screenshots[0]} alt="" loading="lazy" /> : <ThemeMock swatch={item.swatch} />}</div>
      <div className="tcard__body">
        <div className="tcard__top">
          <h3>{item.name}</h3>
          <Price item={item} />
        </div>
        <p className="small muted clamp2">{item.tagline || CATEGORY_LABELS[item.category]}</p>
        <div className="row" style={{ gap: 6, marginTop: 6 }}>
          <span className={`badge ${item.official ? "badge--accent" : ""}`}>{item.official ? "By Oyklane" : `By ${item.by?.name || "a developer"}`}</span>
          {item.installs ? <span className="badge">{item.installs.toLocaleString("en-IN")} stores</span> : null}
        </div>
      </div>
    </Link>
  );
}

export function AppCard({ item }) {
  return (
    <Link href={`/apps/${item.slug}`} className="card acard">
      <span className="acard__icon" aria-hidden="true">
        {item.icon ? <img src={item.icon} alt="" /> : <b>{item.name.slice(0, 1)}</b>}
      </span>
      <span className="acard__body">
        <span className="spread" style={{ gap: 8 }}>
          <h3 style={{ fontSize: 16 }}>{item.name}</h3>
          <Price item={item} />
        </span>
        <span className="small muted clamp2">{item.tagline || item.description}</span>
        <span className="row" style={{ gap: 6, marginTop: 4 }}>
          <span className={`badge ${item.official ? "badge--accent" : ""}`}>{item.official ? "By Oyklane" : `By ${item.by?.name || "a developer"}`}</span>
          <span className="badge">{CATEGORY_LABELS[item.category] || item.category}</span>
        </span>
      </span>
    </Link>
  );
}

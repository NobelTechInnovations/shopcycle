import Link from "next/link";
import { api } from "@/lib/api";
import { CATEGORY_LABELS } from "@/lib/config";
import { ThemeCard, AppCard } from "./Cards";

const PRICES = [
  ["all", "Any price"],
  ["free", "Free"],
  ["paid", "Paid"],
];
const SORTS = [
  ["popular", "Popular"],
  ["newest", "Newest"],
  ["price", "Price: low to high"],
];

function href(base, current, patch) {
  const q = new URLSearchParams();
  const next = { ...current, ...patch };
  for (const [k, v] of Object.entries(next)) if (v && !(k === "price" && v === "all") && !(k === "sort" && v === "popular")) q.set(k, v);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/** Themes or apps (or both, for search), with filters in the URL. */
export async function Browse({ kind, searchParams, base, title, intro }) {
  const sp = await searchParams;
  const current = { price: sp.price || "all", category: sp.category || "", sort: sp.sort || "popular", q: sp.q || "" };
  const qs = new URLSearchParams({ ...(kind && { kind }), price: current.price, sort: current.sort, ...(current.category && { category: current.category }), ...(current.q && { q: current.q }) });
  const data = await api(`/api/market/public/browse?${qs}`).catch(() => ({ items: [], categories: { theme: [], app: [] } }));
  const themes = data.items.filter((i) => i.kind === "theme");
  const apps = data.items.filter((i) => i.kind === "app");
  const categories = kind ? data.categories[kind] : [];
  return (
    <div className="wrap">
      <div style={{ paddingTop: 40 }}>
        <h1 style={{ fontSize: "clamp(28px,4vw,40px)" }}>{title}</h1>
        {intro && <p className="muted" style={{ marginTop: 8 }}>{intro}</p>}
      </div>
      <div className="layout-browse">
        <aside className="filters" aria-label="Filters">
          <div>
            <h4>Price</h4>
            {PRICES.map(([v, label]) => (
              <Link key={v} href={href(base, current, { price: v })} aria-current={current.price === v ? "page" : undefined}>
                {label}
              </Link>
            ))}
          </div>
          {categories.length > 0 && (
            <div>
              <h4>Category</h4>
              <Link href={href(base, current, { category: "" })} aria-current={!current.category ? "page" : undefined}>
                All
              </Link>
              {categories.map((c) => (
                <Link key={c} href={href(base, current, { category: c })} aria-current={current.category === c ? "page" : undefined}>
                  {CATEGORY_LABELS[c] || c}
                </Link>
              ))}
            </div>
          )}
          <div>
            <h4>Sort</h4>
            {SORTS.map(([v, label]) => (
              <Link key={v} href={href(base, current, { sort: v })} aria-current={current.sort === v ? "page" : undefined}>
                {label}
              </Link>
            ))}
          </div>
        </aside>
        <div className="stack" style={{ minWidth: 0 }}>
          <p className="small muted">
            {data.items.length} {data.items.length === 1 ? "result" : "results"}
            {current.q ? ` for “${current.q}”` : ""}
          </p>
          {data.items.length === 0 && <div className="empty">Nothing matches. Try another filter.</div>}
          {themes.length > 0 && (
            <div className="grid grid--themes">
              {themes.map((t) => (
                <ThemeCard key={t.id} item={t} />
              ))}
            </div>
          )}
          {apps.length > 0 && (
            <div className="grid grid--apps" style={{ marginTop: themes.length ? 28 : 0 }}>
              {apps.map((a) => (
                <AppCard key={a.id} item={a} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

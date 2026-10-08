"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Tag, Skeleton } from "antd";
import { Search, Crown, Lock, Check, ArrowRight, Sparkles } from "lucide-react";
import { PageHeader, EmptyState } from "@shopcycle/ui";
import { useApps, appHref, detailsHref, APP_CATEGORIES, rupees } from "@/lib/apps";
import { useAppActions } from "@/components/apps/useAppActions";
import { AppTile } from "@/components/apps/AppTile";
import { apiFetch } from "@/lib/api";

function PriceTag({ app }) {
  if (app.priceMonthly) {
    return (
      <span className="text-[12px] text-ink-muted" title="Plus GST, billed with your plan">
        {rupees(app.priceMonthly)}/month
      </span>
    );
  }
  return <span className="text-[12px] text-ink-muted">Free</span>;
}

function AppCard({ app }) {
  const router = useRouter();
  const { install } = useAppActions();
  const [busy, setBusy] = useState(false);
  const needsSetup = (app.settingsSchema || []).length > 0;

  async function onInstall(e) {
    e.preventDefault();
    if (needsSetup) return router.push(detailsHref(app));
    setBusy(true);
    const ok = await install(app);
    setBusy(false);
    if (ok) router.push(appHref(app));
  }

  return (
    <Link
      href={detailsHref(app)}
      className="group flex flex-col bg-app-surface border border-app-border rounded-[14px] p-[18px] no-underline shadow-card hover:shadow-raised hover:border-[#DADAE0] transition-all"
    >
      <div className="flex items-start gap-3">
        <AppTile app={app} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="m-0 font-semibold text-[15px] text-ink truncate">{app.name}</p>
            {app.installed && <Check size={14} className="text-status-success shrink-0" aria-label="Installed" />}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[12px] text-ink-subtle">{APP_CATEGORIES[app.category] || "Other"}</span>
            <span className="text-ink-subtle text-[10px]">•</span>
            <PriceTag app={app} />
          </div>
        </div>
        {app.premium && (
          <Tag className="!mr-0 !border-0 !bg-accent-soft !text-accent inline-flex items-center gap-1">
            <Crown size={11} aria-hidden="true" /> Growth+
          </Tag>
        )}
      </div>
      <p className="text-[13px] text-ink-muted mt-3 mb-4 leading-relaxed line-clamp-3">{app.description}</p>
      <div className="flex items-center justify-between gap-2 mt-auto">
        {app.installed ? (
          <>
            <span className="text-[12px] font-medium text-status-success inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-status-success" aria-hidden="true" /> Installed
            </span>
            <Button
              size="small"
              onClick={async (e) => {
                e.preventDefault();
                // A developer's app (Oyklane Store) opens on its own site, signed for this store.
                if (!app.marketplace) return router.push(appHref(app));
                const tab = window.open("", "_blank");
                try {
                  const { url } = await apiFetch(`/api/market/store/apps/${app.key}/open`);
                  if (tab) tab.location.href = url;
                  else window.location.href = url;
                } catch {
                  tab?.close();
                  router.push(appHref(app));
                }
              }}
            >
              Open
            </Button>
          </>
        ) : app.locked ? (
          <>
            <span className="text-[12px] text-ink-muted">On Growth and Pro</span>
            <Button size="small" icon={<Lock size={12} aria-hidden="true" />} onClick={(e) => { e.preventDefault(); router.push("/admin/settings/billing"); }}>
              Upgrade
            </Button>
          </>
        ) : (
          <>
            <span className="text-[12px] text-ink-subtle group-hover:text-ink inline-flex items-center gap-1 transition-colors">
              Details <ArrowRight size={12} aria-hidden="true" />
            </span>
            <Button size="small" type="primary" loading={busy} onClick={onInstall}>
              {needsSetup ? "Set up" : "Install"}
            </Button>
          </>
        )}
      </div>
    </Link>
  );
}

function FeaturedFlow({ app }) {
  const router = useRouter();
  const { install } = useAppActions();
  const [busy, setBusy] = useState(false);
  if (!app) return null;
  return (
    <section className="relative overflow-clip rounded-[16px] mb-6 p-6 sm:p-7 text-white" style={{ background: "radial-gradient(120% 140% at 0% 0%, #7C5CFF 0%, #4C33C9 45%, #111114 100%)" }}>
      <div className="absolute -right-10 -top-10 w-56 h-56 rounded-full opacity-30" style={{ background: "radial-gradient(circle, #2DD4BF 0%, transparent 70%)" }} aria-hidden="true" />
      <div className="relative flex flex-col md:flex-row md:items-center gap-5">
        <div className="flex-1 min-w-0">
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] bg-white/15 rounded-full px-2.5 py-1">
            <Sparkles size={12} aria-hidden="true" /> New app
          </span>
          <h2 className="text-[22px] font-semibold mt-3 mb-1.5" style={{ letterSpacing: "-0.02em" }}>
            Flow — emails that send themselves
          </h2>
          <p className="text-[14px] text-white/80 m-0 max-w-xl leading-relaxed">
            Thank first-time buyers, ask for reviews after delivery, win back quiet customers and follow up abandoned checkouts. Pick a recipe, switch it on.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {app.installed ? (
            <Button size="large" className="!bg-white !text-ink !border-white font-semibold" onClick={() => router.push(appHref(app))}>
              Open Flow
            </Button>
          ) : (
            <Button
              size="large"
              loading={busy}
              className="!bg-white !text-ink !border-white font-semibold"
              onClick={async () => {
                setBusy(true);
                const ok = await install(app);
                setBusy(false);
                if (ok) router.push(appHref(app));
              }}
            >
              Install free
            </Button>
          )}
          <Button size="large" ghost onClick={() => router.push(detailsHref(app))}>
            Learn more
          </Button>
        </div>
      </div>
      <ol className="relative hidden md:flex flex-wrap items-center gap-2 mt-6 mb-0 p-0 list-none text-[12.5px]" aria-label="An example flow">
        {["Order delivered", "Wait 3 days", "Not refunded?", "Email: How was it?"].map((step, i) => (
          <li key={step} className="flex items-center gap-2">
            <span className="rounded-lg bg-white/10 border border-white/20 px-3 py-1.5 backdrop-blur-sm">{step}</span>
            {i < 3 && <ArrowRight size={14} className="text-white/60" aria-hidden="true" />}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function AppsPage() {
  const { apps, loading } = useApps();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");

  const categories = useMemo(() => {
    const present = [...new Set((apps || []).map((a) => a.category))];
    return present.sort((a, b) => Object.keys(APP_CATEGORIES).indexOf(a) - Object.keys(APP_CATEGORIES).indexOf(b));
  }, [apps]);

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase();
    return (apps || [])
      .filter((a) => (cat === "all" ? true : cat === "installed" ? a.installed : a.category === cat))
      .filter((a) => !words || `${a.name} ${a.description} ${a.category}`.toLowerCase().includes(words))
      .sort((a, b) => Number(b.installed) - Number(a.installed) || a.name.localeCompare(b.name));
  }, [apps, q, cat]);

  const installedCount = (apps || []).filter((a) => a.installed).length;
  const pill = (key, label, count) => (
    <button
      key={key}
      type="button"
      onClick={() => setCat(key)}
      aria-pressed={cat === key}
      className={`h-8 px-3 rounded-full text-[13px] border cursor-pointer transition-colors ${cat === key ? "bg-ink text-white border-ink" : "bg-app-surface text-ink-muted border-app-border hover:text-ink hover:border-[#D4D4DA]"}`}
    >
      {label}
      {count !== undefined && <span className={`ml-1.5 ${cat === key ? "text-white/70" : "text-ink-subtle"}`}>{count}</span>}
    </button>
  );

  return (
    <div>
      <PageHeader
        title="Apps"
        subtitle="Add features to your store. Installed apps are pinned in your sidebar."
        actions={
          <a href={`${process.env.NEXT_PUBLIC_MARKET_ORIGIN || "https://oyklanestore.com"}/apps`} target="_blank" rel="noopener noreferrer">
            <Button icon={<Sparkles size={15} aria-hidden="true" />}>More apps — Oyklane Store</Button>
          </a>
        }
      />
      <FeaturedFlow app={(apps || []).find((a) => a.key === "flow")} />

      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-5">
        <Input
          allowClear
          prefix={<Search size={15} className="text-ink-subtle" aria-hidden="true" />}
          placeholder="Search apps"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="md:max-w-xs"
          aria-label="Search apps"
        />
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filter apps">
          {pill("all", "All")}
          {pill("installed", "Installed", installedCount)}
          {categories.map((c) => pill(c, APP_CATEGORIES[c] || c))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-app-surface border border-app-border rounded-[14px] p-5">
              <Skeleton avatar active paragraph={{ rows: 2 }} />
            </div>
          ))}
        </div>
      ) : shown.length ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {shown.map((app) => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>
      ) : (
        <EmptyState icon={<Search />} title="No apps match" description={cat === "installed" ? "You haven't installed any apps yet." : "Try another word or category."} />
      )}

      <p className="text-[13px] text-ink-muted mt-8">
        Missing something your store needs?{" "}
        <Link href="/admin/support?new=feature" className="text-ink font-medium">
          Tell us
        </Link>{" "}
        — new apps are on the way.
      </p>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, Skeleton, Dropdown, App } from "antd";
import { Palette, Code2, Eye, Sparkles, MoreHorizontal, Trash2, LayoutTemplate, Lock } from "lucide-react";
import { PageHeader, StatusBadge, useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

const STOREFRONT_URL = process.env.NEXT_PUBLIC_STOREFRONT_URL || "http://localhost:3002";

// Previews open on the store's own Oyklane address (never a hosting URL).
function previewUrl(store, themeId) {
  const base = store.oyklaneUrl || `${STOREFRONT_URL}/store/${store.handle}`;
  return `${base.replace(/\/$/, "")}/?themeId=${themeId}`;
}

/** A live, scaled-down render of the theme's home page. */
function LivePreview({ src, title }) {
  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[10px] border border-app-border bg-app-bg">
      <iframe
        title={title}
        src={src}
        loading="lazy"
        tabIndex={-1}
        aria-hidden="true"
        className="absolute left-0 top-0 origin-top-left pointer-events-none border-0"
        style={{ width: "400%", height: "400%", transform: "scale(0.25)" }}
      />
    </div>
  );
}

/** A small mock of the theme — its palette and heading font — for themes
 * not installed yet (installed ones show a live render instead). */
function ThemeSwatch({ handle, meta }) {
  const c = meta.swatch || { bg: "#FFFFFF", surface: "#F6F3EE", text: "#1A1A1A", accent: "#7C5CFF", font: "Inter" };
  const fontUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(c.font).replace(/%20/g, "+")}:wght@500;600&display=swap`;
  return (
    <div className="aspect-[16/10] rounded-[10px] border border-app-border overflow-hidden flex flex-col" style={{ background: c.bg, color: c.text }} aria-hidden="true">
      <link rel="stylesheet" href={fontUrl} />
      <div className="flex items-center justify-between px-3 py-2 text-[9px] uppercase tracking-[0.14em]" style={{ borderBottom: `1px solid ${c.text}1a` }}>
        <span>Shop</span>
        <span style={{ fontFamily: `"${c.font}", serif`, fontSize: 12, letterSpacing: "0.08em" }}>{meta.name}</span>
        <span>Cart</span>
      </div>
      <div className="flex-1 grid grid-cols-[1.2fr_1fr] gap-2 p-3">
        <div className="rounded-sm flex flex-col justify-end p-2.5" style={{ background: c.text, color: c.bg }}>
          <span className="block w-6 h-[3px] mb-1.5" style={{ background: c.accent }} />
          <span style={{ fontFamily: `"${c.font}", serif`, fontSize: 17, lineHeight: 1.05, fontWeight: 600 }}>New season</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="rounded-sm" style={{ background: c.surface, border: `1px solid ${c.text}12` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ThemesPage() {
  const { message } = App.useApp();
  const { confirmDialog } = useConfirmDialog();
  const [themes, setThemes] = useState([]);
  const [available, setAvailable] = useState({});
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    const [themesData, storeData] = await Promise.all([apiFetch("/api/themes"), apiFetch("/api/store")]);
    setThemes(themesData.themes);
    setAvailable(themesData.available);
    setStore(storeData.store);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(key, fn, success) {
    setBusy(key);
    try {
      await fn();
      if (success) message.success(success);
      await load();
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  const install = (handle) =>
    run(`install-${handle}`, () => apiFetch("/api/themes/install", { method: "POST", body: { handle } }), `${available[handle].name} ${available[handle].version} added — preview it, then publish when you're ready`);
  const publish = (theme) =>
    confirmDialog({
      title: `Publish ${theme.name}?`,
      description: "It replaces your current theme on the live store straight away. Your current theme stays installed, so you can switch back any time.",
      okText: "Publish",
      onConfirm: () => run(`publish-${theme.id}`, () => apiFetch(`/api/themes/${theme.id}/activate`, { method: "POST" }), `${theme.name} is live`),
    });
  const remove = (theme) =>
    confirmDialog({
      title: `Delete ${theme.name}?`,
      description: "Its customisations and code changes are deleted too. This can't be undone.",
      okText: "Delete theme",
      danger: true,
      onConfirm: () => run(`delete-${theme.id}`, () => apiFetch(`/api/themes/${theme.id}`, { method: "DELETE" }), "Theme deleted"),
    });

  if (loading) {
    return (
      <div>
        <PageHeader title="Themes" />
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  const live = themes.find((t) => t.isActive);
  const others = themes.filter((t) => !t.isActive);
  const liveHasUpdate = live?.updateAvailable && !themes.some((t) => t.handle === live.handle && t.version === live.latestVersion);

  return (
    <div>
      <PageHeader
        title="Themes"
        subtitle="Your theme designs the home page, header and footer, and sets the fonts and colours for your whole store."
        actions={
          <a href={`${process.env.NEXT_PUBLIC_MARKET_ORIGIN || "https://oyklanestore.com"}/themes`} target="_blank" rel="noopener noreferrer">
            <Button icon={<Sparkles size={15} aria-hidden="true" />}>More themes — Oyklane Store</Button>
          </a>
        }
      />

      <div className="mb-6 flex items-start gap-3 rounded-[14px] border border-app-border bg-app-surface px-4 py-3 shadow-card">
        <Lock size={16} className="text-ink-muted mt-0.5 shrink-0" aria-hidden="true" />
        <p className="text-[13px] text-ink-muted m-0">
          Product, collection, cart, checkout and account pages use Oyklane's built-in design on every theme — tested for speed and conversion. They follow your theme's
          fonts and colours automatically.
        </p>
      </div>

      {liveHasUpdate && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-accent/30 bg-accent/5 px-4 py-3">
          <div className="flex items-start gap-3">
            <Sparkles size={18} className="text-accent mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-sm text-ink m-0">
              <strong className="font-semibold">
                {available[live.handle]?.name} {live.latestVersion} is available.
              </strong>{" "}
              Add it as a new theme to try the redesign — your live store doesn't change until you publish it.
            </p>
          </div>
          <Button type="primary" loading={busy === `install-${live.handle}`} onClick={() => install(live.handle)}>
            Add {available[live.handle]?.name} {live.latestVersion}
          </Button>
        </div>
      )}

      {live && store && (
        <Card className="mb-8" styles={{ body: { padding: 20 } }}>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6 items-center">
            <LivePreview src={previewUrl(store, live.id)} title={`${live.name} preview`} />
            <div className="flex flex-col gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[20px] font-semibold text-ink m-0" style={{ letterSpacing: "-0.02em" }}>
                    {live.name}
                  </h2>
                  <StatusBadge status="live" label="Live" />
                  <span className="text-xs text-ink-muted">v{live.version}</span>
                </div>
                <p className="text-sm text-ink-muted mt-2 mb-0">{live.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/theme-editor/${live.id}`}>
                  <Button type="primary" icon={<Palette size={15} aria-hidden="true" />}>
                    Customize
                  </Button>
                </Link>
                <a href={previewUrl(store, live.id)} target="_blank" rel="noopener noreferrer">
                  <Button icon={<Eye size={15} aria-hidden="true" />}>View store</Button>
                </a>
                {!live.locked && (
                  <Link href={`/theme-editor/${live.id}/code`}>
                    <Button icon={<Code2 size={15} aria-hidden="true" />}>Edit code</Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {others.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-ink-muted uppercase tracking-[0.08em] mb-3">Installed, not published</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {others.map((theme) => (
              <Card key={theme.id} size="small" styles={{ body: { padding: 14 } }}>
                <LivePreview src={previewUrl(store, theme.id)} title={`${theme.name} preview`} />
                <div className="flex items-start justify-between gap-2 mt-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold m-0 truncate">{theme.name}</h3>
                    <p className="text-xs text-ink-muted m-0">
                      v{theme.version} · added {new Date(theme.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      {theme.listingId ? " · Oyklane Store" : ""}
                    </p>
                  </div>
                  <Dropdown
                    trigger={["click"]}
                    menu={{
                      items: [
                        ...(theme.locked ? [] : [{ key: "code", icon: <Code2 size={14} />, label: <Link href={`/theme-editor/${theme.id}/code`}>Edit code</Link> }]),
                        { key: "delete", icon: <Trash2 size={14} />, danger: true, label: "Delete", onClick: () => remove(theme) },
                      ],
                    }}
                  >
                    <Button size="small" type="text" icon={<MoreHorizontal size={16} aria-hidden="true" />} aria-label={`More actions for ${theme.name}`} />
                  </Dropdown>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button size="small" type="primary" loading={busy === `publish-${theme.id}`} onClick={() => publish(theme)}>
                    Publish
                  </Button>
                  <Link href={`/theme-editor/${theme.id}`}>
                    <Button size="small">Customize</Button>
                  </Link>
                  <a href={previewUrl(store, theme.id)} target="_blank" rel="noopener noreferrer">
                    <Button size="small" icon={<Eye size={14} aria-hidden="true" />}>
                      Preview
                    </Button>
                  </a>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-xs font-semibold text-ink-muted uppercase tracking-[0.08em] mb-3">Theme library</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Object.entries(available).map(([handle, meta]) => (
            <Card key={handle} size="small" styles={{ body: { padding: 14 } }}>
              <ThemeSwatch handle={handle} meta={meta} />
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <h3 className="text-sm font-semibold m-0">{meta.name}</h3>
                <span className="text-xs text-ink-muted">v{meta.version}</span>
                {meta.bestFor && <span className="ml-auto text-[11px] font-medium text-ink-muted bg-app-bg border border-app-border rounded-full px-2 py-0.5">{meta.bestFor}</span>}
              </div>
              <p className="text-xs text-ink-muted mt-1 mb-3">{meta.description}</p>
              <Button size="small" icon={<LayoutTemplate size={14} aria-hidden="true" />} loading={busy === `install-${handle}`} onClick={() => install(handle)}>
                Add to store
              </Button>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, Skeleton, Dropdown, App, Tooltip } from "antd";
import { Palette, Code2, Eye, Sparkles, MoreHorizontal, Trash2, Lock, Copy } from "lucide-react";
import { PageHeader, StatusBadge, useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

const STOREFRONT_URL = process.env.NEXT_PUBLIC_STOREFRONT_URL || "http://localhost:3002";
const MARKET_THEMES = `${process.env.NEXT_PUBLIC_MARKET_ORIGIN || "https://market.oyklane.com"}/themes`;

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
  const [added, setAdded] = useState(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("added");
    if (id) {
      setAdded(id);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

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
  const duplicate = (theme) =>
    run(`dup-${theme.id}`, () => apiFetch(`/api/themes/${theme.id}/duplicate`, { method: "POST" }), `Copy of ${theme.name} made — change it, preview it, then publish when ready. Your live store doesn't change until then.`);
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
          <a href={MARKET_THEMES} target="_blank" rel="noopener noreferrer">
            <Button type="primary" icon={<Sparkles size={15} aria-hidden="true" />}>View more themes</Button>
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

      {added && themes.some((t) => t.id === added) && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#A7F3D0] bg-[#ECFDF5] px-4 py-3">
          <p className="text-sm text-ink m-0">
            <strong className="font-semibold">{themes.find((t) => t.id === added).name} is added.</strong> Customise it and publish when you're ready — your live store doesn't change until then.
          </p>
          <Link href={`/theme-editor/${added}`}>
            <Button type="primary" icon={<Palette size={15} aria-hidden="true" />}>Customize</Button>
          </Link>
        </div>
      )}

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
                <Tooltip title="Make a copy to change safely — your live store stays as it is until you publish the copy">
                  <Button icon={<Copy size={15} aria-hidden="true" />} loading={busy === `dup-${live.id}`} onClick={() => duplicate(live)}>
                    Duplicate
                  </Button>
                </Tooltip>
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
                        { key: "duplicate", icon: <Copy size={14} />, label: "Duplicate", onClick: () => duplicate(theme) },
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

      {others.length === 0 && (
        <Card styles={{ body: { padding: 20 } }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 text-sm text-ink-muted">Find more free and paid themes on the Oyklane Store. Pick one, click Add to my store, and it lands here ready to customise.</p>
            <a href={MARKET_THEMES} target="_blank" rel="noopener noreferrer">
              <Button icon={<Sparkles size={15} aria-hidden="true" />}>Browse themes</Button>
            </a>
          </div>
        </Card>
      )}
    </div>
  );
}

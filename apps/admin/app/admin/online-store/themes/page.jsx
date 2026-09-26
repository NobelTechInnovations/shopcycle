"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, Skeleton, Dropdown, App } from "antd";
import { Palette, Code2, Eye, Sparkles, MoreHorizontal, Trash2, LayoutTemplate, Lock } from "lucide-react";
import { PageHeader, StatusBadge, useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

const STOREFRONT_URL = process.env.NEXT_PUBLIC_STOREFRONT_URL || "http://localhost:3002";

function previewUrl(storeHandle, themeId) {
  return `${STOREFRONT_URL}/store/${storeHandle}?themeId=${themeId}`;
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

function ThemeSwatch({ handle }) {
  const styles =
    handle === "modern"
      ? "bg-[radial-gradient(circle_at_70%_40%,#FE8138_0,transparent_45%),linear-gradient(135deg,#FFF8EE,#F4E6D2)]"
      : "bg-[radial-gradient(circle_at_75%_45%,#D2452F33_0,transparent_40%),linear-gradient(135deg,#FFFFFF,#F6F3EE)]";
  return (
    <div className={`aspect-[16/10] rounded-[10px] border border-app-border ${styles} flex items-end p-3`}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/60">{handle}</span>
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
            <LivePreview src={previewUrl(store.handle, live.id)} title={`${live.name} preview`} />
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
                <a href={previewUrl(store.handle, live.id)} target="_blank" rel="noopener noreferrer">
                  <Button icon={<Eye size={15} aria-hidden="true" />}>View store</Button>
                </a>
                <Link href={`/theme-editor/${live.id}/code`}>
                  <Button icon={<Code2 size={15} aria-hidden="true" />}>Edit code</Button>
                </Link>
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
                <LivePreview src={previewUrl(store.handle, theme.id)} title={`${theme.name} preview`} />
                <div className="flex items-start justify-between gap-2 mt-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold m-0 truncate">{theme.name}</h3>
                    <p className="text-xs text-ink-muted m-0">
                      v{theme.version} · added {new Date(theme.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </p>
                  </div>
                  <Dropdown
                    trigger={["click"]}
                    menu={{
                      items: [
                        { key: "code", icon: <Code2 size={14} />, label: <Link href={`/theme-editor/${theme.id}/code`}>Edit code</Link> },
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
                  <a href={previewUrl(store.handle, theme.id)} target="_blank" rel="noopener noreferrer">
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
              <ThemeSwatch handle={handle} />
              <div className="flex items-center gap-2 mt-3">
                <h3 className="text-sm font-semibold m-0">{meta.name}</h3>
                <span className="text-xs text-ink-muted">v{meta.version}</span>
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

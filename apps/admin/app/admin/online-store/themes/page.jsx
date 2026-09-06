"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, Spin } from "antd";
import { Palette, Code2, Eye, Check } from "lucide-react";
import { PageHeader, StatusBadge } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

function ThemePreviewBlock({ handle }) {
  // Placeholder visual until real theme screenshots exist (Phase 2+).
  const gradient =
    handle === "modern" ? "from-neutral-900 to-neutral-700" : "from-emerald-700 to-emerald-500";
  return (
    <div className={`h-32 rounded-md bg-gradient-to-br ${gradient} flex items-center justify-center`}>
      <Palette className="text-white/70" size={28} aria-hidden="true" />
    </div>
  );
}

const STOREFRONT_URL = process.env.NEXT_PUBLIC_STOREFRONT_URL || "http://localhost:3002";

function previewUrl(storeHandle, themeId) {
  return `${STOREFRONT_URL}/store/${storeHandle}?themeId=${themeId}`;
}

export default function ThemesPage() {
  const [themes, setThemes] = useState([]);
  const [available, setAvailable] = useState({});
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyHandle, setBusyHandle] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [themesData, storeData] = await Promise.all([apiFetch("/api/themes"), apiFetch("/api/store")]);
      setThemes(themesData.themes);
      setAvailable(themesData.available);
      setStore(storeData.store);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleInstall(handle) {
    setBusyHandle(handle);
    try {
      await apiFetch("/api/themes/install", { method: "POST", body: { handle } });
      await load();
    } finally {
      setBusyHandle(null);
    }
  }

  async function handleActivate(id) {
    setBusyHandle(id);
    try {
      await apiFetch(`/api/themes/${id}/activate`, { method: "POST" });
      await load();
    } finally {
      setBusyHandle(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spin />
      </div>
    );
  }

  const activeTheme = themes.find((t) => t.isActive);
  const inactiveThemes = themes.filter((t) => !t.isActive);
  const installedHandles = new Set(themes.map((t) => t.handle));
  const notInstalled = Object.entries(available).filter(([handle]) => !installedHandles.has(handle));

  return (
    <div>
      <PageHeader title="Themes" />

      {activeTheme && (
        <Card className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4">
            <ThemePreviewBlock handle={activeTheme.handle} />
            <div className="flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold m-0">{activeTheme.name}</h3>
                  <StatusBadge status="live" />
                </div>
                <p className="text-sm text-ink-muted mt-1">{activeTheme.description}</p>
              </div>
              <div className="flex gap-2 mt-4">
                <Link href={`/theme-editor/${activeTheme.id}`}>
                  <Button icon={<Palette size={14} aria-hidden="true" />}>Customize</Button>
                </Link>
                <Link href={`/theme-editor/${activeTheme.id}/code`}>
                  <Button icon={<Code2 size={14} aria-hidden="true" />}>Code</Button>
                </Link>
                <a href={previewUrl(store.handle, activeTheme.id)} target="_blank" rel="noopener noreferrer">
                  <Button icon={<Eye size={14} aria-hidden="true" />}>Preview</Button>
                </a>
              </div>
            </div>
          </div>
        </Card>
      )}

      {inactiveThemes.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide mb-3">
            Installed themes
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {inactiveThemes.map((theme) => (
              <Card key={theme.id} size="small">
                <ThemePreviewBlock handle={theme.handle} />
                <h3 className="text-sm font-semibold mt-3 mb-1">{theme.name}</h3>
                <p className="text-xs text-ink-muted mb-3">{theme.description}</p>
                <div className="flex gap-2">
                  <Button
                    size="small"
                    type="primary"
                    icon={<Check size={14} aria-hidden="true" />}
                    loading={busyHandle === theme.id}
                    onClick={() => handleActivate(theme.id)}
                  >
                    Activate
                  </Button>
                  <Link href={`/theme-editor/${theme.id}`}>
                    <Button size="small">Customize</Button>
                  </Link>
                  <a href={previewUrl(store.handle, theme.id)} target="_blank" rel="noopener noreferrer">
                    <Button size="small" icon={<Eye size={14} aria-hidden="true" />} aria-label={`Preview ${theme.name}`} />
                  </a>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide mb-3">Theme library</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {notInstalled.map(([handle, meta]) => (
          <Card key={handle} size="small">
            <ThemePreviewBlock handle={handle} />
            <h3 className="text-sm font-semibold mt-3 mb-1">{meta.name}</h3>
            <p className="text-xs text-ink-muted mb-3">{meta.description}</p>
            <Button
              size="small"
              loading={busyHandle === handle}
              onClick={() => handleInstall(handle)}
            >
              Add
            </Button>
          </Card>
        ))}
        {notInstalled.length === 0 && (
          <p className="text-sm text-ink-muted">Both built-in themes are installed on this store.</p>
        )}
      </div>
    </div>
  );
}

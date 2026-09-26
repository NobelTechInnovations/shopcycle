"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button, Select, Segmented, Spin, App } from "antd";
import { ArrowLeft, Undo2, Redo2, Monitor, Smartphone, Settings2, PanelTop, Lock } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useEditorStore } from "./store";
import { buildSectionCatalog, defaultSettingsFor, newSectionKey, hydrateTemplateDefaults } from "./schema-utils";
import { SectionList } from "./SectionList";
import { PreviewFrame } from "./PreviewFrame";
import { SettingsPanel } from "./SettingsPanel";
import { AddSectionModal } from "./AddSectionModal";
import { ThemeSettingsDrawer } from "./ThemeSettingsDrawer";
import { GlobalSectionsDrawer } from "./GlobalSectionsDrawer";

// Only the home page is designed in a theme. The rest are Oyklane's own
// pages (same layout on every store, styled by Theme settings) — listed
// here as previews so a colour or font change can be checked on them.
const TEMPLATE_OPTIONS = [
  { value: "index", label: "Home page" },
  { value: "product", label: "Product page · preview" },
  { value: "collection", label: "Collection page · preview" },
  { value: "cart", label: "Cart · preview" },
];

function FixedPageNote({ onOpenSettings }) {
  return (
    <div className="p-4 flex flex-col gap-3">
      <span className="w-9 h-9 rounded-md bg-app-bg text-ink-muted flex items-center justify-center">
        <Lock size={16} aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold text-ink m-0">Built-in page</p>
      <p className="text-[13px] text-ink-muted m-0">
        This page uses Oyklane's standard layout on every theme, so it stays fast and familiar for shoppers. It follows your theme's fonts and colours.
      </p>
      <Button size="small" icon={<Settings2 size={14} aria-hidden="true" />} onClick={onOpenSettings}>
        Change fonts &amp; colours
      </Button>
    </div>
  );
}

function getTemplateJson(files, name) {
  const file = files.find((f) => f.path === `templates/${name}.json`);
  return file ? JSON.parse(file.content) : { sections: {}, order: [] };
}

function getSettingsSchemaGroups(files) {
  const file = files.find((f) => f.path === "config/settings_schema.json");
  if (!file) return [];
  try {
    return JSON.parse(file.content);
  } catch {
    return [];
  }
}

export function EditorView({ theme }) {
  const { message } = App.useApp();
  const [templateName, setTemplateName] = useState("index");
  const [device, setDevice] = useState("desktop");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [settingsDrawerOpen, setSettingsDrawerOpen] = useState(false);
  const [globalSectionsOpen, setGlobalSectionsOpen] = useState(false);
  const [products, setProducts] = useState([]);
  const [collections, setCollections] = useState([]);
  const [menus, setMenus] = useState([]);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  // Theme files are fixed for this editor session — the code editor
  // (Phase 4) is the only place file *content* itself changes.
  const filesRef = useRef(theme.files);
  const catalog = useMemo(() => buildSectionCatalog(filesRef.current), []);
  const settingsSchemaGroups = useMemo(() => getSettingsSchemaGroups(filesRef.current), []);

  const template = useEditorStore((s) => s.template);
  const settingsData = useEditorStore((s) => s.settingsData);
  const dirty = useEditorStore((s) => s.dirty);
  const history = useEditorStore((s) => s.history);
  const future = useEditorStore((s) => s.future);
  const init = useEditorStore((s) => s.init);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const addSection = useEditorStore((s) => s.addSection);
  const markSaved = useEditorStore((s) => s.markSaved);

  const editable = templateName === "index";

  const save = useCallback(async () => {
    if (!template) return;
    setSaving(true);
    try {
      await Promise.all([
        // Built-in pages have no theme template to save — only settings.
        templateName === "index" &&
          apiFetch(`/api/themes/${theme.id}/files`, {
            method: "PATCH",
            body: { path: `templates/${templateName}.json`, content: JSON.stringify(template) },
          }),
        apiFetch(`/api/themes/${theme.id}/settings`, { method: "PATCH", body: { settingsData } }),
      ]);
      markSaved();
    } catch (err) {
      message.error(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }, [template, settingsData, templateName, theme.id, markSaved, message]);

  useEffect(() => {
    apiFetch("/api/products?pageSize=100").then((d) => setProducts(d.products.filter((p) => p.status === "active")));
    apiFetch("/api/collections?pageSize=100").then((d) =>
      setCollections(d.collections.filter((c) => c.status === "active"))
    );
    apiFetch("/api/menus").then((d) => setMenus(d.menus));
  }, []);

  // Initial load and every template switch.
  useEffect(() => {
    setReady(false);
    const raw = getTemplateJson(filesRef.current, templateName);
    init(hydrateTemplateDefaults(catalog, raw), theme.settingsData);
    setReady(true);
    // catalog/theme.settingsData/init are stable for the component's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateName]);

  // Debounced autosave: fires ~1.2s after the last change so a burst of
  // edits (dragging a slider, typing a heading) becomes one write.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(save, 1200);
    return () => clearTimeout(t);
  }, [dirty, save]);

  async function handleTemplateChange(next) {
    if (dirty) await save(); // never lose an edit to a template switch
    setTemplateName(next);
  }

  function handleAddSection(type) {
    addSection(newSectionKey(type), type, defaultSettingsFor(catalog, type));
  }

  const previewSlug =
    templateName === "product" ? products[0]?.slug : templateName === "collection" ? collections[0]?.slug : undefined;

  if (!ready || !template) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Spin />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-app-bg">
      <div className="flex items-center justify-between px-4 py-2 border-b border-app-border bg-app-surface shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/admin/online-store/themes" className="text-ink-muted hover:text-ink" aria-label="Back to themes">
            <ArrowLeft size={16} aria-hidden="true" />
          </Link>
          <span className="text-sm font-semibold">{theme.name}</span>
          <Select
            size="small"
            className="w-56"
            value={templateName}
            onChange={handleTemplateChange}
            options={TEMPLATE_OPTIONS}
            aria-label="Template being edited"
          />
        </div>

        <div className="flex items-center gap-2">
          <Segmented
            size="small"
            value={device}
            onChange={setDevice}
            options={[
              {
                value: "desktop",
                label: (
                  <span className="flex items-center gap-1 px-1">
                    <Monitor size={13} aria-hidden="true" /> Desktop
                  </span>
                ),
              },
              {
                value: "mobile",
                label: (
                  <span className="flex items-center gap-1 px-1">
                    <Smartphone size={13} aria-hidden="true" /> Mobile
                  </span>
                ),
              },
            ]}
          />
          <Button size="small" icon={<Undo2 size={14} aria-hidden="true" />} aria-label="Undo" disabled={history.length === 0} onClick={undo} />
          <Button size="small" icon={<Redo2 size={14} aria-hidden="true" />} aria-label="Redo" disabled={future.length === 0} onClick={redo} />
          <Button size="small" icon={<PanelTop size={14} aria-hidden="true" />} onClick={() => setGlobalSectionsOpen(true)}>
            Global sections
          </Button>
          <Button size="small" icon={<Settings2 size={14} aria-hidden="true" />} onClick={() => setSettingsDrawerOpen(true)}>
            Theme settings
          </Button>
          <span className="text-xs text-ink-muted w-16 text-center" aria-live="polite">
            {saving ? "Saving…" : dirty ? "Unsaved" : "Saved"}
          </span>
          <Button size="small" type="primary" loading={saving} onClick={save}>
            Save
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-64 shrink-0 border-r border-app-border bg-app-surface">
          {editable ? (
            <SectionList catalog={catalog} onAddSection={() => setAddModalOpen(true)} />
          ) : (
            <FixedPageNote onOpenSettings={() => setSettingsDrawerOpen(true)} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <PreviewFrame themeId={theme.id} templateName={templateName} previewSlug={previewSlug} device={device} />
        </div>
        <div className="w-80 shrink-0 border-l border-app-border bg-app-surface">
          {editable ? (
            <SettingsPanel catalog={catalog} products={products} collections={collections} menus={menus} />
          ) : (
            <p className="text-[13px] text-ink-muted p-4 m-0">Pick “Home page” above to edit sections.</p>
          )}
        </div>
      </div>

      <AddSectionModal open={addModalOpen} onClose={() => setAddModalOpen(false)} catalog={catalog} onAdd={handleAddSection} />
      <ThemeSettingsDrawer
        open={settingsDrawerOpen}
        onClose={() => setSettingsDrawerOpen(false)}
        schemaGroups={settingsSchemaGroups}
      />
      <GlobalSectionsDrawer
        open={globalSectionsOpen}
        onClose={() => setGlobalSectionsOpen(false)}
        catalog={catalog}
        products={products}
        collections={collections}
        menus={menus}
      />
    </div>
  );
}

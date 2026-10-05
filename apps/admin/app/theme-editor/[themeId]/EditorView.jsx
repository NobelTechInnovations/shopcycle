"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button, Select, Segmented, Spin, App, Modal } from "antd";
import { useRouter } from "next/navigation";
import { ArrowLeft, Undo2, Redo2, Monitor, Smartphone, Settings2, PanelTop, Lock, Users, Info } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useEditorStore } from "./store";
import { buildSectionCatalog, defaultSettingsFor, newSectionKey, hydrateTemplateDefaults, materializeDefaultBlocks } from "./schema-utils";
import { SectionList } from "./SectionList";
import { PreviewFrame } from "./PreviewFrame";
import { SettingsPanel } from "./SettingsPanel";
import { AddSectionModal } from "./AddSectionModal";
import { ThemeSettingsDrawer } from "./ThemeSettingsDrawer";
import { GlobalSectionsDrawer } from "./GlobalSectionsDrawer";
import { templateOptions, templateLabel, pageTemplate, effectiveTemplate, layoutName, CreateTemplateModal, AssignTemplateModal, TemplateActions, NewTemplateButton } from "./TemplatePicker";

// The home page is designed in the theme. Product, collection and content
// pages are Oyklane's own, but their sections can be arranged here — the
// default layout and any extra templates (product.rental). The cart is
// fixed — listed as a preview so a colour or font change can be checked.
const EDITABLE_BASES = new Set(["index", "product", "collection", "page"]);
const MAIN_SECTION = { product: "sys-product", collection: "sys-collection", page: "sys-page" };
const baseOf = (name) => String(name).split(".")[0];

const PAGE_HINTS = {
  product: "Oyklane's product page on every store. Click “Product” to reorder, hide or resize its parts; add your theme's sections around it.",
  collection: "The collection's products and filters stay; add your theme's sections above or below them.",
  page: "The page's own text stays; add your theme's sections around it — a banner, images, a video.",
};

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

function getTemplateJson(files, name, platform) {
  const base = baseOf(name);
  const main = MAIN_SECTION[base];
  // A saved layout counts only while its main section is there.
  const usable = (json) => !main || Object.values(json?.sections || {}).some((sec) => sec.type === main);
  const fromFile = (path) => {
    const file = files.find((f) => f.path === path);
    if (!file) return null;
    try {
      const json = JSON.parse(file.content);
      return usable(json) ? json : null;
    } catch {
      return null;
    }
  };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  // An extra template: the store's copy, else the one an app brings, else
  // (just created and not saved yet) the default layout.
  if (name !== base) {
    const own = fromFile(`templates/${name}.json`);
    if (own) return own;
    if (platform?.templates?.[name]) return clone(platform.templates[name]);
  }
  return fromFile(`templates/${base}.json`) || (platform?.templates?.[base] ? clone(platform.templates[base]) : { sections: {}, order: [] });
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

export function EditorView({ theme, platform, templates: initialTemplates, templateUsage = {} }) {
  const { message } = App.useApp();
  const [templateName, setTemplateName] = useState(() => {
    // ?template=product.rental opens that template (links from the admin).
    if (typeof window === "undefined") return "index";
    const asked = new URLSearchParams(window.location.search).get("template");
    return asked && /^(index|product|collection|page|cart)(\.[a-z0-9-]+)?$/.test(asked) ? asked : "index";
  });
  const [templates, setTemplates] = useState(initialTemplates || { product: [], page: [], collection: [] });
  const [createOpen, setCreateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [pages, setPages] = useState([]);
  const [device, setDevice] = useState("desktop");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [settingsDrawerOpen, setSettingsDrawerOpen] = useState(false);
  const [globalSectionsOpen, setGlobalSectionsOpen] = useState(false);
  const [products, setProducts] = useState([]);
  const [collections, setCollections] = useState([]);
  const [menus, setMenus] = useState([]);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  // Opened from "Your pages": that page's slug (the template it uses is open).
  const [pageView, setPageView] = useState(null);
  // An action (open another page, leave) waiting on "save or discard?".
  const [pending, setPending] = useState(null);
  const router = useRouter();
  const { modal } = App.useApp();
  // The theme settings as last saved — what Discard goes back to, and what
  // another page opens with.
  const savedSettings = useRef(theme.settingsData || {});

  // Theme files are fixed for this editor session — the code editor
  // (Phase 4) is the only place file *content* itself changes.
  const filesRef = useRef(theme.files);
  // The theme's sections plus the platform's arrangeable ones (product
  // page, reviews, related products).
  const catalog = useMemo(() => buildSectionCatalog([...filesRef.current, ...(platform?.sections || [])]), [platform]);
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

  const base = baseOf(templateName);
  const editable = EDITABLE_BASES.has(base);
  const altLabel = templateLabel(templates, templateName);

  const save = useCallback(async () => {
    if (!template) return;
    setSaving(true);
    try {
      const path = `templates/${templateName}.json`;
      const content = JSON.stringify(template);
      await Promise.all([
        // Fixed pages have no layout to save — only settings.
        editable && apiFetch(`/api/themes/${theme.id}/files`, { method: "PATCH", body: { path, content } }),
        apiFetch(`/api/themes/${theme.id}/settings`, { method: "PATCH", body: { settingsData } }),
      ]);
      if (editable) {
        // Keep the session's copy current, so switching pages and back shows this.
        const files = filesRef.current.filter((f) => f.path !== path);
        filesRef.current = [...files, { path, content }];
      }
      savedSettings.current = JSON.parse(JSON.stringify(settingsData));
      markSaved();
      message.success("Saved — your store shows the changes now");
      return true;
    } catch (err) {
      message.error(`Save failed: ${err.message}`);
      return false;
    } finally {
      setSaving(false);
    }
  }, [template, settingsData, templateName, editable, theme.id, markSaved, message]);
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    // Pickers still work (empty) if one of these fails.
    apiFetch("/api/products?pageSize=100").then((d) => setProducts(d.products.filter((p) => p.status === "active"))).catch(() => {});
    apiFetch("/api/collections?pageSize=100")
      .then((d) => setCollections(d.collections.filter((c) => c.status === "active")))
      .catch(() => {});
    apiFetch("/api/menus").then((d) => setMenus(d.menus)).catch(() => {});
    apiFetch("/api/pages?pageSize=100").then((d) => setPages((d.pages || []).filter((p) => p.status === "active"))).catch(() => {});
  }, []);

  // Initial load and every template switch.
  useEffect(() => {
    setReady(false);
    const raw = getTemplateJson(filesRef.current, templateName, platform);
    init(hydrateTemplateDefaults(catalog, raw), savedSettings.current);
    setReady(true);
    // catalog/init are stable for the component's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateName]);

  // Nothing is saved until the seller presses Save — edits stay a draft
  // they can look at in the preview and throw away with Discard.
  function discard() {
    const keep = useEditorStore.getState().selectedSectionKey;
    const raw = getTemplateJson(filesRef.current, templateName, platform);
    init(hydrateTemplateDefaults(catalog, raw), savedSettings.current);
    if (keep && raw.sections?.[keep]) useEditorStore.getState().selectSection(keep);
  }

  function confirmDiscard() {
    modal.confirm({
      title: "Discard your changes?",
      content: "Everything since you last saved goes back to how it was.",
      okText: "Discard changes",
      okButtonProps: { danger: true },
      onOk: discard,
    });
  }

  // Runs `action` now, or — with unsaved changes — after "save or discard?".
  function guard(action) {
    if (!useEditorStore.getState().dirty) return action();
    setPending({ action });
  }

  async function resolvePending(choice) {
    const action = pending?.action;
    if (choice === "save" && !(await save())) return;
    if (choice === "discard") discard();
    setPending(null);
    action?.();
  }

  useEffect(() => {
    // Closing the tab or reloading with unsaved changes: the browser asks.
    const onBeforeUnload = (e) => {
      if (!useEditorStore.getState().dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    // ⌘S / Ctrl+S saves.
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (useEditorStore.getState().dirty) saveRef.current();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  function handleTemplateChange(next) {
    if (next.startsWith("page@")) {
      // One of the store's pages: open the template it uses, showing it.
      const slug = next.slice(5);
      const target = pageTemplate(templates, pages.find((p) => p.slug === slug));
      const open = () => {
        setPreviewPick((cur) => ({ ...cur, [target]: slug }));
        setPageView(slug);
        setTemplateName(target);
      };
      return target === templateName ? open() : guard(open);
    }
    guard(() => {
      setPageView(null);
      setTemplateName(next);
    });
  }

  // New sections come with their default blocks, right after the selected
  // section (or at the end).
  function handleAddSection(type) {
    const { blocks, block_order } = materializeDefaultBlocks(catalog[type]);
    const selected = useEditorStore.getState().selectedSectionKey;
    const at = selected ? template.order.indexOf(selected) + 1 : null;
    addSection(newSectionKey(type), type, defaultSettingsFor(catalog, type), blocks, block_order, at);
  }

  // Keeps the editor's lists in step after items move between layouts.
  function applyAssignment({ kind, name, ids }) {
    const suffix = name.split(".")[1] || null;
    const update = (list) =>
      list.map((x) => (ids.includes(x.id) ? { ...x, templateSuffix: suffix } : suffix && x.templateSuffix === suffix ? { ...x, templateSuffix: null } : x));
    if (kind === "page") setPages(update);
    if (kind === "product") setProducts(update);
    if (kind === "collection") setCollections(update);
  }

  function handleCreated(template, assigned = []) {
    setTemplates((cur) => ({ ...cur, [template.kind]: [...(cur[template.kind] || []).filter((t) => t.name !== template.name), { suffix: template.suffix, name: template.name, label: template.label, source: "theme" }] }));
    filesRef.current = [...filesRef.current.filter((f) => f.path !== `templates/${template.name}.json`), { path: `templates/${template.name}.json`, content: JSON.stringify(template.content) }];
    if (assigned.length) applyAssignment({ kind: template.kind, name: template.name, ids: assigned });
    setCreateOpen(false);
    handleTemplateChange(template.name);
  }

  function handleDeleted(name) {
    const kind = baseOf(name);
    const fromApp = (platform?.appTemplates || []).some((t) => `${t.kind}.${t.suffix}` === name);
    // An app's template stays (back to the app's own layout); the store's own goes.
    setTemplates((cur) => ({ ...cur, [kind]: (cur[kind] || []).flatMap((t) => (t.name !== name ? [t] : fromApp ? [{ ...t, source: "app" }] : [])) }));
    filesRef.current = filesRef.current.filter((f) => f.path !== `templates/${name}.json`);
    useEditorStore.getState().markSaved();
    setTemplateName(kind);
  }

  const [previewPick, setPreviewPick] = useState({});
  const previewOptions = base === "product" ? products : base === "collection" ? collections : base === "page" ? pages : [];
  // A layout previews with something that really uses it, when there is
  // one — the default too (a page set to another layout doesn't show this).
  const usingIt = MAIN_SECTION[base] ? previewOptions.filter((x) => effectiveTemplate(templates, base, x) === templateName) : [];
  const previewSlug =
    previewOptions.length &&
    (previewOptions.find((x) => x.slug === previewPick[templateName])?.slug || usingIt[0]?.slug || previewOptions[0].slug);
  const previewItem = MAIN_SECTION[base] ? previewOptions.find((x) => x.slug === previewSlug) : null;
  const previewLayout = previewItem ? effectiveTemplate(templates, base, previewItem) : null;
  // Previewing something that uses another layout: what's edited here
  // won't show on it — say so, and offer the two ways out.
  const mismatch = Boolean(previewItem && previewLayout !== templateName);

  async function useThisLayoutFor(item) {
    try {
      const ids = [...usingIt.map((x) => x.id), item.id];
      await apiFetch("/api/themes/templates/assign", { method: "POST", body: { kind: base, name: templateName, ids: templateName === base ? [item.id] : ids } });
      applyAssignment({ kind: base, name: templateName, ids: templateName === base ? [item.id] : ids });
      message.success(`“${item.title}” now uses the “${layoutName(templates, templateName)}” layout`);
    } catch (err) {
      message.error(err.message);
    }
  }

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
          <Link
            href="/admin/online-store/themes"
            className="text-ink-muted hover:text-ink"
            aria-label="Back to themes"
            onClick={(e) => {
              if (!useEditorStore.getState().dirty) return;
              e.preventDefault();
              guard(() => router.push("/admin/online-store/themes"));
            }}
          >
            <ArrowLeft size={16} aria-hidden="true" />
          </Link>
          <span className="text-sm font-semibold">{theme.name}</span>
          <span className="text-xs text-ink-muted hidden md:inline">Page</span>
          <Select
            size="small"
            className="w-60"
            value={pageView && previewSlug === pageView ? `page@${pageView}` : templateName}
            onChange={handleTemplateChange}
            options={templateOptions(templates, pages)}
            aria-label="Template being edited"
            popupMatchSelectWidth={false}
          />
          {altLabel && templates[base]?.find((t) => t.name === templateName)?.source !== "app" && (
            <TemplateActions themeId={theme.id} name={templateName} label={altLabel} usage={templateUsage} onDeleted={handleDeleted} />
          )}
          {MAIN_SECTION[base] && (
            <Button size="small" icon={<Users size={13} aria-hidden="true" />} onClick={() => setAssignOpen(true)} title={`Which ${base}s use this layout`}>
              Used by {usingIt.length}
            </Button>
          )}
          <NewTemplateButton onClick={() => setCreateOpen(true)} />
          {previewOptions.length > 1 && (
            <Select
              size="small"
              className="w-48 hidden lg:block"
              value={previewSlug}
              showSearch
              optionFilterProp="label"
              onChange={(v) => setPreviewPick((cur) => ({ ...cur, [templateName]: v }))}
              options={
                MAIN_SECTION[base]
                  ? [
                      { label: "Use this layout", options: usingIt.map((x) => ({ value: x.slug, label: x.title })) },
                      {
                        label: "Use another layout",
                        options: previewOptions
                          .filter((x) => !usingIt.includes(x))
                          .map((x) => ({ value: x.slug, label: `${x.title} · ${layoutName(templates, effectiveTemplate(templates, base, x))}` })),
                      },
                    ].filter((g) => g.options.length)
                  : previewOptions.map((x) => ({ value: x.slug, label: x.title }))
              }
              aria-label="Preview with"
              prefix={<span className="text-ink-subtle text-xs">Preview:</span>}
            />
          )}
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
            Header &amp; footer
          </Button>
          <Button size="small" icon={<Settings2 size={14} aria-hidden="true" />} onClick={() => setSettingsDrawerOpen(true)}>
            Colours &amp; fonts
          </Button>
          <span className="text-xs text-ink-muted whitespace-nowrap flex items-center gap-1.5" aria-live="polite">
            {dirty && !saving && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden="true" />}
            {saving ? "Saving…" : dirty ? "Unsaved changes" : "All saved"}
          </span>
          {dirty && (
            <Button size="small" onClick={confirmDiscard} disabled={saving}>
              Discard
            </Button>
          )}
          <Button size="small" type="primary" loading={saving} disabled={!dirty} onClick={save}>
            Save
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-64 shrink-0 border-r border-app-border bg-app-surface">
          {editable ? (
            <SectionList
              catalog={catalog}
              onAddSection={() => setAddModalOpen(true)}
              onOpenGlobal={() => setGlobalSectionsOpen(true)}
              pageLabel={
                base === "index"
                  ? "Home page"
                  : `${base === "product" ? "Product" : base === "collection" ? "Collection" : "Page"} · ${altLabel || "Default"}`
              }
              hint={
                PAGE_HINTS[base]
                  ? `${PAGE_HINTS[base]} Shows on the ${usingIt.length} ${base === "collection" ? "collection" : base}${usingIt.length === 1 ? "" : "s"} using this layout (“Used by” at the top).`
                  : undefined
              }
            />
          ) : (
            <FixedPageNote onOpenSettings={() => setSettingsDrawerOpen(true)} />
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          {mismatch && (
            <div className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 bg-amber-50 border-b border-amber-200 text-[13px] text-ink" role="status">
              <Info size={15} className="text-amber-600 shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                “{previewItem.title}” uses the <b>{layoutName(templates, previewLayout)}</b> layout, so what you change here won&apos;t show on it.
              </span>
              <span className="flex gap-2 ml-auto">
                <Button size="small" onClick={() => handleTemplateChange(base === "page" ? `page@${previewItem.slug}` : previewLayout)}>
                  Edit “{layoutName(templates, previewLayout)}”
                </Button>
                <Button size="small" type="primary" onClick={() => useThisLayoutFor(previewItem)}>
                  Use this layout for it
                </Button>
              </span>
            </div>
          )}
          <div className="flex-1 min-h-0">
          <PreviewFrame
            themeId={theme.id}
            templateName={templateName}
            previewSlug={previewSlug}
            device={device}
            selectable={editable}
            labels={Object.fromEntries(template.order.map((k) => [k, catalog[template.sections[k]?.type]?.name || template.sections[k]?.type]))}
          />
          </div>
        </div>
        <div className="w-80 shrink-0 border-l border-app-border bg-app-surface">
          {editable ? (
            <SettingsPanel
              catalog={catalog}
              products={products}
              collections={collections}
              menus={menus}
              onOpenSettings={() => setSettingsDrawerOpen(true)}
              onOpenGlobal={() => setGlobalSectionsOpen(true)}
            />
          ) : (
            <p className="text-[13px] text-ink-muted p-4 m-0">Pick the home page, or a product, collection or page template above to edit sections.</p>
          )}
        </div>
      </div>

      <AddSectionModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        catalog={catalog}
        onAdd={handleAddSection}
        templateName={base}
        presentTypes={template.order.map((k) => template.sections[k]?.type)}
      />
      <CreateTemplateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        themeId={theme.id}
        templates={templates}
        defaultKind={MAIN_SECTION[base] ? base : "product"}
        onCreated={handleCreated}
        items={{ product: products, page: pages, collection: collections }}
      />
      {MAIN_SECTION[base] && (
        <AssignTemplateModal
          open={assignOpen}
          onClose={() => setAssignOpen(false)}
          kind={base}
          name={templateName}
          templates={templates}
          items={previewOptions}
          onAssigned={(r) => {
            applyAssignment(r);
            setAssignOpen(false);
          }}
        />
      )}
      <ThemeSettingsDrawer
        open={settingsDrawerOpen}
        onClose={() => setSettingsDrawerOpen(false)}
        schemaGroups={settingsSchemaGroups}
      />
      <Modal
        open={Boolean(pending)}
        title="Save your changes?"
        onCancel={() => setPending(null)}
        footer={[
          <Button key="discard" danger onClick={() => resolvePending("discard")} disabled={saving}>
            Discard
          </Button>,
          <Button key="stay" onClick={() => setPending(null)}>
            Keep editing
          </Button>,
          <Button key="save" type="primary" loading={saving} onClick={() => resolvePending("save")}>
            Save
          </Button>,
        ]}
      >
        <p className="text-[13.5px] text-ink-muted m-0">You changed this page and haven&apos;t saved yet. Save the changes so they show on your store, or discard them.</p>
      </Modal>
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

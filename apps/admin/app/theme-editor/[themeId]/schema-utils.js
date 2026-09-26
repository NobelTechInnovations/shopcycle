"use client";

import { extractSchema, buildDefaultSettings, resolveBlocks, mergeSettings } from "@shopcycle/theme-schema";

/** Every `sections/*.liquid` file in the theme, with its parsed schema —
 * this is what powers both "Add section" (list of buildable types) and the
 * settings panel (which fields to render for the selected section). */
export function buildSectionCatalog(files) {
  const catalog = {};
  for (const file of files) {
    const match = file.path.match(/^sections\/(.+)\.liquid$/);
    if (!match) continue;
    const type = match[1];
    const schema = extractSchema(file.content);
    if (schema) catalog[type] = schema;
  }
  return catalog;
}

export function defaultSettingsFor(catalog, type) {
  return buildDefaultSettings(catalog[type]);
}

export function defaultBlockSettings(catalog, sectionType, blockType) {
  const schema = catalog[sectionType];
  const blockSchema = (schema?.blocks || []).find((b) => b.type === blockType);
  return buildDefaultSettings(blockSchema);
}

/** Resolves a section entry's blocks into an ordered array with schema
 * defaults applied — used by the settings panel to list blocks the same
 * way the renderer sees them. */
export function resolveSectionBlocks(catalog, sectionEntry) {
  return resolveBlocks(catalog[sectionEntry.type], sectionEntry);
}

/** A master theme's template JSON only stores explicit overrides
 * (`settings: {}` for an untouched section) — the renderer fills in schema
 * defaults at render time. The editor needs those same resolved values
 * up front, or every unedited field looks blank even though the preview
 * clearly shows a heading, a button label, etc. This runs once when a
 * template loads into the editor so the settings panel and the renderer
 * always agree on "what's the current value of this field." */
export function hydrateTemplateDefaults(catalog, template) {
  const sections = {};
  for (const [key, entry] of Object.entries(template.sections || {})) {
    const schema = catalog[entry.type];
    const settings = mergeSettings(schema, entry.settings || {});

    if (!entry.blocks && schema?.default_blocks) {
      sections[key] = { ...entry, settings, ...materializeDefaultBlocks(schema) };
      continue;
    }
    const blockOrder = entry.block_order || [];
    const blocksIn = entry.blocks || {};
    const blocks = {};
    for (const blockId of blockOrder) {
      const raw = blocksIn[blockId];
      if (!raw) continue;
      const blockSchema = (schema?.blocks || []).find((b) => b.type === raw.type);
      blocks[blockId] = { type: raw.type, settings: mergeSettings(blockSchema, raw.settings || {}) };
    }

    sections[key] = { ...entry, settings, blocks, block_order: blockOrder };
  }
  return { sections, order: template.order || [] };
}

/** Same idea as hydrateTemplateDefaults but for one global section
 * (header/footer/announcement-bar) — resolves its settings + blocks
 * against schema defaults so the drawer shows real current values (e.g.
 * header's "Menu handle" default of "main-menu") instead of blank fields,
 * consistent with what the renderer actually shows. */
export function hydrateGlobalSectionDefaults(catalog, sectionType, entry) {
  const schema = catalog[sectionType];
  const settings = mergeSettings(schema, entry?.settings ?? entry ?? {});
  if (!entry?.blocks && schema?.default_blocks) return { settings, ...materializeDefaultBlocks(schema) };

  const blockOrder = entry?.block_order || [];
  const blocksIn = entry?.blocks || {};
  const blocks = {};
  for (const blockId of blockOrder) {
    const raw = blocksIn[blockId];
    if (!raw) continue;
    const blockSchema = (schema?.blocks || []).find((b) => b.type === raw.type);
    blocks[blockId] = { type: raw.type, settings: mergeSettings(blockSchema, raw.settings || {}) };
  }

  return { settings, blocks, block_order: blockOrder };
}

/** A section that has never been edited shows its schema's
 * `default_blocks` on the storefront. The editor turns those into real
 * blocks (with ids) so they appear in the panel and can be edited —
 * otherwise adding one block would silently replace all the defaults. */
export function materializeDefaultBlocks(schema) {
  const blocks = {};
  const block_order = [];
  for (const b of schema?.default_blocks || []) {
    const id = newBlockId();
    const blockSchema = (schema.blocks || []).find((x) => x.type === b.type);
    blocks[id] = { type: b.type, settings: mergeSettings(blockSchema, b.settings || {}) };
    block_order.push(id);
  }
  return { blocks, block_order };
}

// Sections the layout renders on every page — edited under "Header &
// footer", never added to a page's section list.
export const GLOBAL_SECTION_TYPES = ["announcement-bar", "header", "footer"];

export function newSectionKey(type) {
  return `${type}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newBlockId() {
  return Math.random().toString(36).slice(2, 10);
}

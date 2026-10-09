const { cleanSettingValues, cleanRichText, cleanCustomHtml } = require("./rich-text");

const SCHEMA_RE = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/;

/** Pulls the `{% schema %}...{% endschema %}` JSON block out of a section's
 * Liquid source. Returns null if absent or malformed — a broken schema
 * should degrade the editor/renderer gracefully, never crash a page for
 * every merchant because one section's JSON has a trailing comma. */
function extractSchema(liquidSource) {
  const match = liquidSource.match(SCHEMA_RE);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/** Removes the schema block so the remainder is valid Liquid — LiquidJS has
 * no idea what `{% schema %}` means and would otherwise throw. */
function stripSchema(liquidSource) {
  return liquidSource.replace(SCHEMA_RE, "");
}

function defaultForSetting(setting) {
  if (setting.default !== undefined) return setting.default;
  switch (setting.type) {
    case "checkbox":
      return false;
    case "range":
      return setting.min ?? 0;
    case "number":
      return 0;
    case "collection_list":
    case "product_list":
      return [];
    default:
      return "";
  }
}

/** { id: default, ... } for every setting in a section/block schema. */
function buildDefaultSettings(schema) {
  const settings = {};
  for (const s of schema?.settings || []) {
    if (s.id) settings[s.id] = defaultForSetting(s);
  }
  return settings;
}

/** Provided values win; anything unset falls back to the schema default —
 * this is what lets a template JSON omit fields entirely and still render
 * sane output, and what lets the Phase 3 editor show every field even
 * before the merchant has touched it. */
function mergeSettings(schema, settings = {}) {
  // Text from the editor's text editor and Custom HTML, made safe to print.
  return cleanSettingValues(schema, { ...buildDefaultSettings(schema), ...settings });
}

function findBlockSchema(schema, blockType) {
  return (schema?.blocks || []).find((b) => b.type === blockType) || null;
}

function mergeBlockSettings(schema, block) {
  const blockSchema = findBlockSchema(schema, block.type);
  return {
    id: block.id,
    type: block.type,
    settings: cleanSettingValues(blockSchema, { ...buildDefaultSettings(blockSchema), ...(block.settings || {}) }),
  };
}

/** Resolve a section's `blocks: {id: {...}}` + `block_order: [id, ...]`
 * (Shopify's JSON-template shape) into an ordered array with defaults
 * applied — this is the array Liquid's `{% for block in section.blocks %}`
 * actually iterates over. */
/** A section's blocks in order. A section that has never been edited (no
 * `blocks` key at all) shows its schema's `default_blocks`, so a theme can
 * ship with sensible content; once it has blocks, the merchant's choice
 * wins. */
function resolveBlocks(schema, sectionEntry) {
  // An empty list counts as "never set up" too: an earlier editor saved
  // untouched sections as `blocks: {}`, which wiped their defaults. To show
  // nothing, a merchant hides the section instead.
  if ((!sectionEntry.blocks || !(sectionEntry.block_order || []).length) && Array.isArray(schema?.default_blocks)) {
    return schema.default_blocks.map((b, i) => mergeBlockSettings(schema, { id: `default-${i + 1}`, ...b }));
  }
  const order = sectionEntry.block_order || [];
  const blocks = sectionEntry.blocks || {};
  // A block hidden in the editor (`disabled`) keeps its settings but isn't shown.
  return order.filter((id) => blocks[id] && !blocks[id].disabled).map((id) => mergeBlockSettings(schema, { id, ...blocks[id] }));
}

/**
 * The settings saved for a global section (header, footer, announcement
 * bar) in settings_data.json's `sections[type]`. Two shapes exist: a
 * theme package ships them nested — `{ settings: {...}, blocks, block_order }`
 * — while the theme editor saves each edit flat on the entry —
 * `{ logo_width: 120, blocks, ... }`. Both are read; a flat (edited) value
 * wins over the shipped one.
 */
function globalSectionSettings(entry) {
  if (!entry || typeof entry !== "object") return {};
  const { settings, blocks, block_order: order, ...flat } = entry;
  return { ...(settings && typeof settings === "object" ? settings : {}), ...flat };
}

module.exports = {
  cleanRichText,
  cleanCustomHtml,
  globalSectionSettings,
  extractSchema,
  stripSchema,
  defaultForSetting,
  buildDefaultSettings,
  mergeSettings,
  findBlockSchema,
  mergeBlockSettings,
  resolveBlocks,
};

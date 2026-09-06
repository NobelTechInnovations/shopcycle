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
  return { ...buildDefaultSettings(schema), ...settings };
}

function findBlockSchema(schema, blockType) {
  return (schema?.blocks || []).find((b) => b.type === blockType) || null;
}

function mergeBlockSettings(schema, block) {
  const blockSchema = findBlockSchema(schema, block.type);
  return {
    id: block.id,
    type: block.type,
    settings: { ...buildDefaultSettings(blockSchema), ...(block.settings || {}) },
  };
}

/** Resolve a section's `blocks: {id: {...}}` + `block_order: [id, ...]`
 * (Shopify's JSON-template shape) into an ordered array with defaults
 * applied — this is the array Liquid's `{% for block in section.blocks %}`
 * actually iterates over. */
function resolveBlocks(schema, sectionEntry) {
  const order = sectionEntry.block_order || [];
  const blocks = sectionEntry.blocks || {};
  return order.filter((id) => blocks[id]).map((id) => mergeBlockSettings(schema, { id, ...blocks[id] }));
}

module.exports = {
  extractSchema,
  stripSchema,
  defaultForSetting,
  buildDefaultSettings,
  mergeSettings,
  findBlockSchema,
  mergeBlockSettings,
  resolveBlocks,
};

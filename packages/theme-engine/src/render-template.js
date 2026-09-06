const { createLiquidEngine } = require("./liquid-engine");
const { extractSchema, stripSchema, mergeSettings, resolveBlocks } = require("@shopcycle/theme-schema");

function filesArrayToMap(files) {
  return Object.fromEntries(files.map((f) => [f.path, f.content]));
}

/**
 * Renders one storefront page: template JSON -> ordered sections -> layout.
 *
 * `templateOverride` lets the Phase 3 visual editor render an *unsaved*
 * draft (sections/order the merchant is currently dragging around) without
 * ever writing it to the database — this is the entire mechanism behind
 * the editor's live iframe preview.
 */
async function renderTemplate({
  filesByPath,
  templateName,
  templateOverride,
  settingsData,
  globalContext,
  meta,
}) {
  const engine = createLiquidEngine(filesByPath, meta, settingsData);

  const raw = templateOverride ?? filesByPath[`templates/${templateName}.json`];
  if (!raw) {
    const err = new Error(`Template not found: ${templateName}`);
    err.code = "TEMPLATE_NOT_FOUND";
    throw err;
  }
  const template = typeof raw === "string" ? JSON.parse(raw) : raw;

  const baseContext = { ...globalContext, settings: settingsData || {} };

  const order = template.order || [];
  const renderedSections = [];
  for (const key of order) {
    const entry = template.sections?.[key];
    if (!entry || entry.disabled) continue;

    const sectionSrc = filesByPath[`sections/${entry.type}.liquid`];
    if (!sectionSrc) {
      renderedSections.push(`<!-- section type not found: ${entry.type} -->`);
      continue;
    }

    const schema = extractSchema(sectionSrc);
    const settings = mergeSettings(schema, entry.settings || {});
    const blocks = resolveBlocks(schema, entry);

    // `globals` (not just the env object) must carry baseContext too —
    // LiquidJS's `{% render %}` tag spawns an isolated child scope that
    // only inherits `globals`, never the caller's plain env (verified
    // against liquidjs@10's actual Context.spawn() behavior). Without
    // this, every snippet rendered via `{% render %}` would lose access
    // to `routes`/`shop`/`cart`/`settings`.
    const sectionContext = { ...baseContext, section: { id: key, type: entry.type, settings, blocks } };
    const html = await engine.parseAndRender(stripSchema(sectionSrc), sectionContext, {
      globals: sectionContext,
    });

    renderedSections.push(
      `<div data-section-id="${key}" data-section-type="${entry.type}">${html}</div>`
    );
  }

  const contentForLayout = renderedSections.join("\n");

  const layoutSrc = filesByPath["layout/theme.liquid"];
  if (!layoutSrc) return contentForLayout;

  const layoutContext = { ...baseContext, content_for_layout: contentForLayout };
  return engine.parseAndRender(stripSchema(layoutSrc), layoutContext, { globals: layoutContext });
}

/** Serves a raw theme asset (CSS/JS) with the right content type. Assets
 * live as ThemeFile rows, not real files, so this is a lookup, not a disk
 * read. */
function getAssetContent(filesByPath, assetPath) {
  const content = filesByPath[`assets/${assetPath}`];
  if (content === undefined) return null;
  const ext = assetPath.split(".").pop();
  const contentType =
    { css: "text/css", js: "application/javascript", json: "application/json" }[ext] ||
    "text/plain";
  return { content, contentType };
}

module.exports = { renderTemplate, filesArrayToMap, getAssetContent };

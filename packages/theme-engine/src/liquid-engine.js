const { Liquid, Tag } = require("liquidjs");
const { stripSchema, extractSchema, mergeSettings, resolveBlocks } = require("@shopcycle/theme-schema");

/**
 * Builds a LiquidJS engine for one render call.
 *
 * `filesByPath` — { "sections/hero.liquid": "...", "snippets/price.liquid": "...", ... }
 * is handed to LiquidJS as its `templates` option, which is documented to
 * resolve `{% render %}` / `{% include %}` / `{% layout %}` lookups against
 * an in-memory map instead of the filesystem. LiquidJS's built-in `render`
 * tag is already Shopify-compatible (isolated scope, named args only), so
 * every `{% render 'snippets/x', foo: bar %}` in the theme packages works
 * with zero custom code — verified against the actual liquidjs@10 source,
 * not assumed. The one thing LiquidJS has no opinion on is Shopify's
 * `{% section 'name' %}` tag (used by layout.liquid for header/footer/
 * announcement-bar), so that's the only custom tag registered here.
 *
 * A fresh engine is created per render call rather than reused/cached —
 * LiquidJS construction is cheap (no grammar compilation step), and doing
 * it this way lets `filesByPath`/`meta` be captured directly in closures
 * instead of threaded through Liquid's tag-registration API.
 */
function createLiquidEngine(filesByPath, meta, settingsData) {
  const engine = new Liquid({
    extname: ".liquid",
    templates: filesByPath,
    strictVariables: false,
    strictFilters: false,
    // Merchant-authored theme code is untrusted input (see README security
    // note) — cap how much work one render can do rather than letting a
    // bad `{% for %}` loop hang the process.
    renderLimit: 4000,
    memoryLimit: 20_000_000,
  });

  class SectionTag extends Tag {
    constructor(tagToken, remainTokens, liquid) {
      super(tagToken, remainTokens, liquid);
      const match = tagToken.args.match(/^\s*(['"])(.*?)\1\s*$/);
      if (!match) throw new Error(`Invalid {% section %} argument: ${tagToken.args}`);
      this.sectionType = match[2];
    }

    *render(ctx, emitter) {
      const src = filesByPath[`sections/${this.sectionType}.liquid`];
      if (!src) {
        emitter.write(`<!-- section not found: ${this.sectionType} -->`);
        return;
      }
      // Standalone sections (header/footer/announcement-bar, invoked via
      // `{% section %}` from layout/theme.liquid rather than listed in a
      // template's JSON) have no per-template `entry.settings` to merge —
      // but they still declare a schema with real defaults (e.g. header's
      // `menu` defaulting to "main-menu"). Skipping mergeSettings here (as
      // this used to) silently dropped every one of those defaults, which
      // is why the nav/footer links and announcement text always rendered
      // empty. `settingsData.sections[type]` is where the theme editor's
      // "Global sections" drawer persists merchant overrides (settings AND
      // blocks, e.g. footer's social-icon list) — same {settings, blocks,
      // block_order} shape a template-section entry has, so resolveBlocks
      // works unchanged here too.
      const schema = extractSchema(src);
      const overrides = (settingsData && settingsData.sections && settingsData.sections[this.sectionType]) || {};
      const settings = mergeSettings(schema, overrides);
      const blocks = resolveBlocks(schema, overrides);
      const sectionContext = {
        ...ctx.environments,
        section: { id: this.sectionType, settings, blocks },
      };
      // Same globals-vs-environments distinction as render-template.js —
      // required for e.g. header.liquid's `{% render 'snippets/cart-icon' %}`
      // to see `routes`.
      const html = yield this.liquid.parseAndRender(stripSchema(src), sectionContext, {
        globals: sectionContext,
      });
      emitter.write(
        `<div data-section-id="${this.sectionType}" data-section-type="${this.sectionType}">${html}</div>`
      );
    }
  }
  engine.registerTag("section", SectionTag);

  engine.registerFilter("money", (value) => {
    const amount = Number(value) || 0;
    try {
      return new Intl.NumberFormat("en-IN", { style: "currency", currency: meta.currency || "INR" }).format(
        amount
      );
    } catch {
      return `${meta.currency || ""} ${amount.toFixed(2)}`;
    }
  });

  // Assets are ThemeFile rows, not real files on disk — point at the API's
  // asset-serving endpoint for this exact theme (never the store's *active*
  // theme, so a Phase 3 preview of a draft theme gets that theme's CSS/JS,
  // not whatever's currently live).
  engine.registerFilter(
    "asset_url",
    (path) => `${meta.apiUrl || ""}/api/storefront/${meta.handle}/assets/${meta.themeId}/${encodeURIComponent(path)}`
  );

  // Product images are already full URLs from an external host in this
  // phase — pass through untouched. Real resizing/CDN params are a seam
  // for later, not a Phase 2 requirement.
  engine.registerFilter("image_url", (value) => value || "");

  return engine;
}

module.exports = { createLiquidEngine };

const { Liquid } = require("liquidjs");
const { stripSchema, extractSchema } = require("@shopcycle/theme-schema");

// A throwaway engine just for syntax-checking — no templates map needed
// since parse() never resolves {% render %}/{% include %} targets, it only
// needs to recognize tag names. Must register the same custom `section`
// tag the real renderer uses, or any layout file using it would falsely
// fail validation.
const { Tag } = require("liquidjs");
function buildValidationEngine() {
  const engine = new Liquid({ strictVariables: false });
  class SectionTag extends Tag {
    constructor(tagToken, remainTokens, liquid) {
      super(tagToken, remainTokens, liquid);
    }
    *render() {}
  }
  engine.registerTag("section", SectionTag);
  return engine;
}

/**
 * Rejects content that would break the whole render pipeline for every
 * visitor if saved — a malformed `templates/index.json` or a `.liquid`
 * file with mismatched `{% if %}`/`{% endif %}` tags. Liquid parse errors
 * inside a *value* (e.g. a typo'd filter name) aren't caught here since
 * LiquidJS only validates filter existence at render time when
 * `strictFilters` is on — this is a syntax check, not a full lint.
 */
function validateThemeFileContent(path, content) {
  const ext = path.split(".").pop();

  if (ext === "json") {
    try {
      JSON.parse(content);
      return { valid: true };
    } catch (err) {
      return { valid: false, error: `Invalid JSON: ${err.message}` };
    }
  }

  if (ext === "liquid") {
    // Section/snippet schema blocks must themselves be valid JSON, and the
    // remaining Liquid must parse.
    const schemaMatch = content.match(/\{%-?\s*schema\s*-?%\}/);
    if (schemaMatch) {
      const schema = extractSchema(content);
      if (schema === null && /\{%-?\s*schema\s*-?%\}[\s\S]*?\{%-?\s*endschema\s*-?%\}/.test(content)) {
        return { valid: false, error: "Invalid JSON inside {% schema %} block" };
      }
    }
    try {
      buildValidationEngine().parse(stripSchema(content));
      return { valid: true };
    } catch (err) {
      return { valid: false, error: `Liquid syntax error: ${err.message}` };
    }
  }

  // CSS/JS/text — no parser wired up; a broken one only affects the
  // storefront's styling/behavior, not the render pipeline itself, so it's
  // not blocked at save time (matches how "commit invalid CSS" behaves in
  // literally every other CMS/editor too).
  return { valid: true };
}

module.exports = { validateThemeFileContent };

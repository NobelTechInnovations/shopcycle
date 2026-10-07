/**
 * What a section's text settings may contain when a page is rendered.
 *
 * `textarea` / `richtext` come from the theme editor's text editor: words
 * in bold, italic, underlined, highlighted or in the accent colour, links
 * and line breaks — inline only, because themes print these inside their
 * own <p> and <h2>. Everything else is dropped (the words stay).
 *
 * `html` is the Custom HTML section's code: HTML and CSS, with scripts and
 * inline event handlers taken out (scripts go in Apps ▸ Custom Scripts).
 */

const INLINE = new Set(["strong", "b", "em", "i", "u", "s", "mark", "span", "a", "small", "sup", "sub"]);
// Block tags pasted in (or typed by an older editor) become line breaks.
const BREAKS = new Set(["p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "tr"]);
const DROPPED_WITH_CONTENT = /<(script|style|iframe|object|embed|template|noscript|textarea|select|title|svg|math)\b[\s\S]*?<\/\1\s*>/gi;
const CLASSES = { mark: ["oy-hl"], span: ["oy-accent", "oy-hl"] };
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^<>]*)>/g;
const ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

const escText = (s) => s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16) || 32))
    .replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(Number(d) || 32))
    .replace(/&(colon|tab|newline|amp|quot|apos|lt|gt);/gi, (_, n) => ({ colon: ":", tab: "\t", newline: "\n", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" })[n.toLowerCase()]);
}

/** Web, email and phone links, and links within the store. */
function safeUrl(value) {
  if (!value) return null;
  const url = decodeEntities(value).replace(/[\u0000- \u007f-\u009f]/g, "");
  return /^(https?:|mailto:|tel:)/i.test(url) || /^[/#?]/.test(url) ? url : null;
}

function attributes(name, raw) {
  const attrs = {};
  let a;
  ATTR.lastIndex = 0;
  while ((a = ATTR.exec(raw))) attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? "";
  let out = "";
  if (name === "a") {
    const href = safeUrl(attrs.href);
    if (href) out += ` href="${escAttr(href)}"`;
    if (attrs.target === "_blank") out += ' target="_blank" rel="noopener"';
  }
  if (CLASSES[name] && attrs.class) {
    const kept = attrs.class.split(/\s+/).filter((c) => CLASSES[name].includes(c));
    if (kept.length) out += ` class="${kept.join(" ")}"`;
  }
  return out;
}

function cleanRichText(value) {
  if (typeof value !== "string" || !value.includes("<")) return value;
  const html = value.replace(/<!--[\s\S]*?-->/g, "").replace(DROPPED_WITH_CONTENT, "");
  const open = [];
  let out = "";
  let last = 0;
  let m;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(html))) {
    out += escText(html.slice(last, m.index));
    last = TAG.lastIndex;
    const closing = m[1] === "/";
    const name = m[2].toLowerCase();
    if (name === "br") {
      out += "<br>";
    } else if (BREAKS.has(name)) {
      if (closing) out += "<br>";
    } else if (INLINE.has(name)) {
      if (!closing) {
        out += `<${name}${attributes(name, m[3])}>`;
        open.push(name);
      } else {
        const at = open.lastIndexOf(name);
        if (at !== -1) while (open.length > at) out += `</${open.pop()}>`;
      }
    }
  }
  out += escText(html.slice(last));
  while (open.length) out += `</${open.pop()}>`;
  return out.replace(/(\s*<br>)+\s*$/, "");
}

function cleanCustomHtml(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<\/?script\b[^>]*>/gi, "")
    .replace(/\s(on[a-z]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\b(href|src|action|formaction|xlink:href)\s*=\s*(["']?)\s*(?:javascript|vbscript):/gi, "$1=$2#");
}

/** A section's or block's settings, cleaned by type. */
function cleanSettingValues(schema, settings) {
  for (const s of schema?.settings || []) {
    if (!s.id || typeof settings[s.id] !== "string") continue;
    if (s.type === "textarea" || s.type === "richtext") settings[s.id] = cleanRichText(settings[s.id]);
    else if (s.type === "html") settings[s.id] = cleanCustomHtml(settings[s.id]);
  }
  return settings;
}

module.exports = { cleanRichText, cleanCustomHtml, cleanSettingValues, safeUrl };

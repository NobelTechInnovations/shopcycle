const crypto = require("crypto");
const path = require("path");
const { filesArrayToMap } = require("@shopcycle/theme-engine");
const { env } = require("../../config/env");
const { THEMES_ROOT } = require("../../config/paths");
const { loadThemePackage } = require("../themes/file-loader");

/**
 * Oyklane's own storefront pages. Every page except the home page —
 * product, collection, search, cart, checkout, account, order status,
 * blog, content pages, 404 — has one fixed design shared by all stores,
 * kept in themes/_platform. A theme can't change their layout; it only
 * decides their fonts, colours, corner radius and page width, through the
 * tokens built here from the theme's settings. Themes design the home
 * page (and the header/footer around every page).
 */

const PLATFORM_DIR = path.join(THEMES_ROOT, "_platform");

const SYSTEM_TEMPLATES = new Set([
  "product",
  "collection",
  "search",
  "cart",
  "checkout",
  "page",
  "404",
  "order-confirmation",
  "order-status",
  "order-lookup",
  "account-login",
  "account",
  "blog",
  "article",
]);

/** Templates rendered in the platform's own page shell instead of the
 * theme's layout: checkout is distraction-free (no store navigation). */
const OWN_LAYOUT = { checkout: "layout/sys-checkout.liquid" };

let cache = null;
async function load() {
  // Re-read in development so edits to the platform pages show up on
  // refresh; cached for the life of the process everywhere else.
  if (cache && env.NODE_ENV !== "development") return cache;
  const files = await loadThemePackage(PLATFORM_DIR);
  const byPath = filesArrayToMap(files);
  const assets = {
    "system.css": byPath["assets/system.css"] || "",
    "system.js": byPath["assets/system.js"] || "",
    "cart-drawer.css": byPath["assets/cart-drawer.css"] || "",
    "cart-drawer.js": byPath["assets/cart-drawer.js"] || "",
    "login-popup.css": byPath["assets/login-popup.css"] || "",
    "login-popup.js": byPath["assets/login-popup.js"] || "",
  };
  const version = crypto.createHash("sha256").update(Object.values(assets).join("\n")).digest("hex").slice(0, 12);
  // Only templates/sections/snippets/layouts join a render; assets are
  // served by assetHandler below.
  const renderFiles = Object.fromEntries(Object.entries(byPath).filter(([p]) => !p.startsWith("assets/")));
  cache = { renderFiles, assets, version };
  return cache;
}

function isSystemTemplate(name) {
  return SYSTEM_TEMPLATES.has(name);
}

/**
 * Platform pages a seller may arrange in the theme editor: reorder, hide
 * and adjust the platform's own blocks and sections, and add the theme's
 * sections around them — while the design stays Oyklane's. Cart and
 * checkout are never arrangeable. `main` must stay on the page; `sections`
 * are the platform sections allowed on it.
 */
const ARRANGEABLE = {
  product: { main: "sys-product", sections: ["sys-product", "sys-related", "sys-reviews"] },
  // Content pages and collections: the page's own content (main) with any
  // of the theme's sections around it — a custom "About us" or "Bridal
  // collection" layout.
  page: { main: "sys-page", sections: ["sys-page"] },
  collection: { main: "sys-collection", sections: ["sys-collection"] },
};

function isArrangeable(name) {
  return Boolean(ARRANGEABLE[name]);
}

/** "product.rental" → { base: "product", suffix: "rental" }. */
function templateParts(name) {
  const [base, suffix = null] = String(name || "").split(".");
  return { base, suffix };
}

/**
 * Extra templates an installed app brings (templates/<kind>.<suffix>.json
 * in themes/_platform), offered beside the store's own. A store's theme
 * file of the same name wins — that's the seller's edited copy.
 */
const APP_TEMPLATES = {
  rentals: [{ kind: "product", suffix: "rental", label: "Rental product" }],
};

function appTemplates(installed = {}) {
  return Object.entries(APP_TEMPLATES)
    .filter(([key]) => installed[key])
    .flatMap(([, list]) => list);
}

/**
 * A store's saved (or the editor's unsaved) layout for an arrangeable
 * page, made safe: parsed, other platform sections dropped, and only kept
 * if the main section is still on the page. Null means "use the default".
 */
function sanitizeArrangement(name, raw) {
  const rule = ARRANGEABLE[name];
  if (!rule || !raw) return null;
  let json;
  try {
    json = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (!json || typeof json !== "object" || !json.sections || !Array.isArray(json.order)) return null;
  const sections = {};
  const order = [];
  for (const key of json.order) {
    const entry = json.sections[key];
    if (!entry || typeof entry.type !== "string") continue;
    if (entry.type.startsWith("sys-") && !rule.sections.includes(entry.type)) continue;
    if (entry.type === rule.main && order.some((k) => sections[k].type === rule.main)) continue; // one main section
    sections[key] = entry.type === rule.main ? { ...entry, disabled: false } : entry;
    order.push(key);
  }
  if (!order.some((k) => sections[k].type === rule.main)) return null;
  return JSON.stringify({ sections, order });
}

/** App sections (sections/app-<app key>.liquid): a theme section each
 * installed app adds — Instagram feed, Google reviews — that a seller can
 * place on any page. Keyed by the app that brings it. */
const APP_SECTIONS = {
  "instagram-feed": "sections/app-instagram-feed.liquid",
  "google-reviews": "sections/app-google-reviews.liquid",
};

/** The app section files, for renders of theme pages (platform pages get
 * every platform file anyway). */
async function appSectionFiles() {
  const { renderFiles } = await load();
  return Object.fromEntries(Object.values(APP_SECTIONS).filter((p) => renderFiles[p]).map((p) => [p, renderFiles[p]]));
}

/** The platform's own section files and default layouts for arrangeable
 * pages — the theme editor builds its section list from these — plus the
 * sections of the store's installed apps. */
async function editorPackage({ installed = {} } = {}) {
  const { renderFiles } = await load();
  const appPaths = Object.entries(APP_SECTIONS)
    .filter(([key]) => installed[key])
    .map(([, p]) => p);
  const sections = Object.entries(renderFiles)
    .filter(([p]) => (/^sections\/sys-/.test(p) && Object.values(ARRANGEABLE).some((r) => r.sections.includes(p.slice(9, -7)))) || appPaths.includes(p))
    .map(([path, content]) => ({ path, content }));
  const templates = {};
  for (const name of Object.keys(ARRANGEABLE)) templates[name] = JSON.parse(renderFiles[`templates/${name}.json`] || '{"sections":{},"order":[]}');
  const extra = appTemplates(installed);
  for (const t of extra) {
    const file = renderFiles[`templates/${t.kind}.${t.suffix}.json`];
    if (file) templates[`${t.kind}.${t.suffix}`] = JSON.parse(file);
  }
  return { sections, templates, appTemplates: extra };
}

// ── Tokens ─────────────────────────────────────────────────────────

function parseHex(value, fallback) {
  const m = String(value || "")
    .trim()
    .match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return fallback ? parseHex(fallback) : [17, 17, 17];
  const hex = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

const toHex = (rgb) => `#${rgb.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0")).join("")}`;
const mix = (a, b, t) => a.map((c, i) => c + (b[i] - c) * t);

function luminance([r, g, b]) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Black or white — whichever reads better on `bg`. */
const onColor = (bg) => (contrast(bg, [255, 255, 255]) >= contrast(bg, [17, 17, 20]) ? "#ffffff" : "#111114");

/** `color` darkened/lightened toward `text` until it's readable as text on `bg`. */
function readableOn(color, bg, text) {
  let c = color;
  for (let i = 0; i < 8 && contrast(c, bg) < 4.5; i += 1) c = mix(c, text, 0.2);
  return c;
}

const FONT_NAME = /^[A-Za-z0-9 ]{2,40}$/;
const SANS = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
const SERIF_FONTS = /serif|playfair|garamond|lora|baskerville|fraunces|merriweather|cormorant|marcellus|bodoni|italiana|dm serif/i;
function fontStack(name) {
  const clean = FONT_NAME.test(String(name || "")) ? String(name) : null;
  const fallback = clean && SERIF_FONTS.test(clean) && !/sans/i.test(clean) ? `Georgia, "Times New Roman", serif` : SANS;
  return clean ? `"${clean}", ${fallback}` : fallback;
}

/**
 * The design tokens for one store, from its theme's settings. Reads the
 * standard setting ids every Oyklane theme uses (color_primary,
 * color_accent, color_background, color_text, heading_font, body_font,
 * button_radius, container_width, card_radius) with safe defaults, so any
 * theme — including older store copies — styles the platform pages.
 */
function tokens(settings = {}) {
  const bg = parseHex(settings.color_background, "#ffffff");
  const text = parseHex(settings.color_text, "#1a1a1a");
  const primary = parseHex(settings.color_primary || settings.color_button, "#111111");
  const accent = parseHex(settings.color_accent, "#e5484d");
  const dark = luminance(bg) < 0.4;
  const buttonRadius = Math.max(0, Math.min(999, Number(settings.button_radius ?? 10)));
  const cardRadius = Math.max(0, Math.min(32, Number(settings.card_radius ?? Math.min(buttonRadius, 14))));
  const container = Math.max(960, Math.min(1680, Number(settings.container_width ?? 1280)));

  return {
    "--oy-bg": toHex(bg),
    "--oy-text": toHex(text),
    "--oy-muted": toHex(mix(text, bg, 0.42)),
    "--oy-line": toHex(mix(text, bg, dark ? 0.82 : 0.88)),
    "--oy-line-strong": toHex(mix(text, bg, dark ? 0.7 : 0.76)),
    "--oy-surface": toHex(mix(text, bg, dark ? 0.9 : 0.96)),
    "--oy-primary": toHex(primary),
    "--oy-on-primary": onColor(primary),
    "--oy-primary-ring": `rgba(${primary.join(",")}, 0.18)`,
    "--oy-accent": toHex(accent),
    "--oy-on-accent": onColor(accent),
    "--oy-accent-text": toHex(readableOn(accent, bg, text)),
    "--oy-font-heading": fontStack(settings.heading_font),
    "--oy-font-body": fontStack(settings.body_font),
    "--oy-radius-button": `${buttonRadius}px`,
    "--oy-radius": `${cardRadius}px`,
    "--oy-container": `${container}px`,
  };
}

function tokensCss(settings) {
  const t = tokens(settings);
  return `:root{${Object.entries(t)
    .map(([k, v]) => `${k}:${v}`)
    .join(";")}}`;
}

/** Google Fonts stylesheet for the theme's heading + body fonts. */
function fontsUrl(settings = {}) {
  const families = [...new Set([settings.heading_font, settings.body_font].filter((f) => FONT_NAME.test(String(f || ""))))];
  if (!families.length) return null;
  const q = families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700`).join("&");
  return `https://fonts.googleapis.com/css2?${q}&display=swap`;
}

/** `base` set: served through the store's own address (storefront pages —
 * shoppers never see the API's host). Unset: straight from the API (the
 * admin's theme editor preview). */
function assetUrl(name, version, base) {
  if (base != null) return `${base}/oy-assets/${name}?v=${version}`;
  return `${env.API_PUBLIC_URL.replace(/\/$/, "")}/api/storefront/platform-assets/${name}?v=${version}`;
}

/** What goes before </head> on a platform page: tokens, then the shared
 * stylesheet (after the theme's own CSS, so it wins). */
/** The theme's "Cart type" setting: "drawer" (the default) slides a cart
 * panel in on add-to-cart; "page" goes to the full cart page. Never on the
 * cart and checkout pages themselves. */
function cartDrawerOn(settings, templateName) {
  return (settings?.cart_type || "drawer") === "drawer" && templateName !== "cart" && templateName !== "checkout";
}

/** Menu dropdowns (snippets/menu-links: li.oy-has-sub > ul.oy-sub) for
 * every theme: a panel under the link on hover or keyboard focus, a side
 * panel for the third level, an indented list in the phone menu. The
 * selectors outrank the themes' own ".header__nav ul". */
const MENU_CSS = [
  ".header__nav li.oy-has-sub{position:relative}",
  ".header__nav li.oy-has-sub>a{display:inline-flex;align-items:center;gap:5px}",
  ".oy-caret{width:10px;height:10px;flex:none;opacity:.65;transition:transform .2s}",
  ".header__nav li.oy-has-sub:hover>a>.oy-caret,.header__nav li.oy-has-sub:focus-within>a>.oy-caret{transform:rotate(180deg)}",
  ".header__nav li.oy-has-sub>ul.oy-sub{position:absolute;top:calc(100% + 10px);left:-14px;z-index:80;display:flex;flex-direction:column;flex-wrap:nowrap;gap:0;min-width:220px;margin:0;padding:8px;list-style:none;text-align:left;background:var(--oy-bg);color:var(--oy-text);border:1px solid var(--oy-line);border-radius:min(var(--oy-radius),14px);box-shadow:0 22px 44px -18px rgba(0,0,0,.3);opacity:0;visibility:hidden;transform:translateY(6px);transition:opacity .18s ease,transform .18s ease,visibility .18s}",
  ".header__nav li.oy-has-sub>ul.oy-sub::before{content:\"\";position:absolute;left:0;right:0;top:-12px;height:12px}",
  ".header__nav li.oy-has-sub:hover>ul.oy-sub,.header__nav li.oy-has-sub:focus-within>ul.oy-sub{opacity:1;visibility:visible;transform:none}",
  ".header__nav ul.oy-sub li.oy-has-sub>ul.oy-sub{top:-9px;left:calc(100% + 8px)}",
  ".header__nav ul.oy-sub li.oy-has-sub>ul.oy-sub::before{top:0;bottom:0;left:-10px;width:10px;height:auto}",
  ".header__nav ul.oy-sub li{width:100%}",
  ".header__nav ul.oy-sub a{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:9px 10px;border-radius:8px;white-space:nowrap;font-size:14px;color:var(--oy-text)}",
  ".header__nav ul.oy-sub a::after{display:none}",
  ".header__nav ul.oy-sub a:hover,.header__nav ul.oy-sub a:focus-visible{background:var(--oy-surface)}",
  ".header__nav ul.oy-sub .oy-caret{transform:rotate(-90deg)!important}",
  ".drawer__links ul.oy-sub{list-style:none;margin:0;padding:0 0 8px 16px;display:flex;flex-direction:column}",
  ".drawer__links ul.oy-sub a{font-size:16px!important;padding:9px 0!important;border-bottom:0!important;font-family:inherit!important;font-weight:400!important;opacity:.85}",
  ".drawer__links .oy-caret{display:none}",
].join("");

async function headTags(settings, { system, drawer, login, assetBase }) {
  const { version } = await load();
  let tags = `<style id="oy-tokens">${tokensCss(settings)}${MENU_CSS}</style>`;
  if (system) tags += `<link rel="stylesheet" href="${assetUrl("system.css", version, assetBase)}">`;
  if (drawer) tags += `<link rel="stylesheet" href="${assetUrl("cart-drawer.css", version, assetBase)}">`;
  if (login) tags += `<link rel="stylesheet" href="${assetUrl("login-popup.css", version, assetBase)}">`;
  return tags;
}

/** `drawer` is the drawer's config (routes, currency) when it's on;
 * `login` the phone sign-in popup's (Phone Login app, signed out). */
async function bodyTags({ system, drawer, login, assetBase }) {
  const { version } = await load();
  let tags = "";
  if (system) tags += `<script src="${assetUrl("system.js", version, assetBase)}" defer></script>`;
  if (drawer) {
    // JSON inside <script>: "<" is escaped so a value can't close the tag.
    const json = JSON.stringify(drawer).replace(/</g, "\\u003c");
    tags += `<script type="application/json" id="oy-cart-config">${json}</script><script src="${assetUrl("cart-drawer.js", version, assetBase)}" defer></script>`;
  }
  if (login) {
    const json = JSON.stringify(login).replace(/</g, "\\u003c");
    tags += `<script type="application/json" id="oy-login-config">${json}</script><script src="${assetUrl("login-popup.js", version, assetBase)}" defer></script>`;
  }
  return tags;
}

async function asset(name) {
  const { assets, version } = await load();
  if (!(name in assets)) return null;
  return {
    content: assets[name],
    contentType: name.endsWith(".css") ? "text/css" : "application/javascript",
    version,
  };
}

module.exports = {
  APP_SECTIONS,
  appSectionFiles,
  ARRANGEABLE,
  isArrangeable,
  templateParts,
  APP_TEMPLATES,
  appTemplates,
  sanitizeArrangement,
  editorPackage,
  SYSTEM_TEMPLATES,
  OWN_LAYOUT,
  isSystemTemplate,
  load,
  tokens,
  tokensCss,
  fontsUrl,
  headTags,
  bodyTags,
  cartDrawerOn,
  asset,
  PLATFORM_DIR,
};

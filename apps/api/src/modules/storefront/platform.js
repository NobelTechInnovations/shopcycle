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
const SERIF_FONTS = /serif|playfair|garamond|lora|baskerville|fraunces|merriweather|cormorant|marcellus|dm serif/i;
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

async function headTags(settings, { system, drawer, assetBase }) {
  const { version } = await load();
  let tags = `<style id="oy-tokens">${tokensCss(settings)}</style>`;
  if (system) tags += `<link rel="stylesheet" href="${assetUrl("system.css", version, assetBase)}">`;
  if (drawer) tags += `<link rel="stylesheet" href="${assetUrl("cart-drawer.css", version, assetBase)}">`;
  return tags;
}

/** `drawer` is the drawer's config (routes, currency) when it's on. */
async function bodyTags({ system, drawer, assetBase }) {
  const { version } = await load();
  let tags = "";
  if (system) tags += `<script src="${assetUrl("system.js", version, assetBase)}" defer></script>`;
  if (drawer) {
    // JSON inside <script>: "<" is escaped so a value can't close the tag.
    const json = JSON.stringify(drawer).replace(/</g, "\\u003c");
    tags += `<script type="application/json" id="oy-cart-config">${json}</script><script src="${assetUrl("cart-drawer.js", version, assetBase)}" defer></script>`;
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

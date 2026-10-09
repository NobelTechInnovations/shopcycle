const crypto = require("crypto");
const path = require("path");
const { filesArrayToMap } = require("@shopcycle/theme-engine");
const { THEMES_ROOT } = require("../../config/paths");
const { loadThemePackage } = require("./file-loader");

/**
 * Each store has its own editable copy of its theme, made when the theme
 * was installed. Pages added to the platform later (account, sign-in,
 * order status) aren't in older copies — so any file a store's copy lacks
 * is taken from the master theme it came from. A merchant can still
 * override any of them by adding the file in the code editor.
 */
const masterCache = new Map();
async function masterFiles(handle) {
  if (!/^[a-z0-9-]+$/.test(handle || "")) return {};
  if (!masterCache.has(handle)) {
    masterCache.set(
      handle,
      loadThemePackage(path.join(THEMES_ROOT, handle))
        .then(filesArrayToMap)
        .catch(() => ({}))
    );
  }
  return masterCache.get(handle);
}

/**
 * Theme files the platform has improved since stores copied them. A store
 * whose copy is still exactly one of these earlier versions (the seller
 * never edited it) gets the master's current file; an edited copy is the
 * seller's and stays as it is. Hash: sha256 of the content with runs of
 * whitespace collapsed, first 16 hex characters — every committed version
 * of the file in any of the four themes.
 */
const PRISTINE_UPGRADES = {
  // Sub-menus (dropdowns) — 1 Oct.
  "snippets/menu-links.liquid": ["29def272dcaf31df"],
  // Daily rent on cards (Rentals app) — 2 Oct.
  "snippets/product-card.liquid": ["3449020d8c0c6c67", "c1b47d0e8933b270"],
  // Logo size for computers and phones; long store names fit — 2 Oct.
  "sections/header.liquid": ["5b0fdfe67a2d2b73", "9bbe17a98be3d86f", "e9d39b78a56e39d4", "3b72efdf28946448", "33388154c36be4ac", "18745bd7f3870b7b"],
  // …and up to 8 footer blocks (more menu columns) — 7 Oct; Contact link — 8 Oct.
  "sections/footer.liquid": ["fa61352f91eee639", "6ba270beadc4a820", "709eb375dd176370", "61380d3ebac02711", "7e95ea83e95a1c4d", "d66f32ea0a96023f", "b154649da9b90eb5", "5fc7a05bf891b281", "3c1b0b34edd12400"],
  // Photo shape / fit / layout options — 2 Oct.
  "sections/featured-product.liquid": ["750beb5075152070", "d3d1fd33ac2c8cbc", "e01a3bad53448ce0", "49e4e48249fe1443", "bf43181daf87c87d"],
  "sections/editorial-banner.liquid": ["91dc519bcbcf3b0e", "0a38866cb702f994"],
  "sections/image-with-text.liquid": ["4657bf6395d81657", "d01d99aff0fc11bc"],
  // Renamed "Featured products" (the new "Product grid" is shop-grid) — 9 Oct.
  "sections/product-grid.liquid": ["97be823779561c6d"],
};
const contentHash = (text) => crypto.createHash("sha256").update(String(text).replace(/\s+/g, " ").trim()).digest("hex").slice(0, 16);

/** Paths in `files` (path → content) still at an earlier platform version. */
function stalePaths(files, master) {
  return Object.entries(PRISTINE_UPGRADES)
    .filter(([file, old]) => files[file] != null && master[file] != null && files[file] !== master[file] && old.includes(contentHash(files[file])))
    .map(([file]) => file);
}

/** For rendering: the store's files with untouched old copies swapped for
 * the master's (in memory). */
function upgradePristine(files, master) {
  for (const file of stalePaths(files, master)) files[file] = master[file];
  return files;
}

/**
 * For the editors: the same swap on a theme loaded for editing (in memory,
 * never written back — the store's row stays the old version, so a later
 * platform update still recognises it). The theme editor then shows the
 * new settings and the code editor the new code; a file the seller saves
 * from there is theirs from then on.
 */
async function withUpgrades(theme) {
  const master = await masterFiles(theme.handle);
  const stale = new Set(stalePaths(filesArrayToMap(theme.files), master));
  if (!stale.size) return theme;
  return { ...theme, files: theme.files.map((f) => (stale.has(f.path) ? { ...f, content: master[f.path] } : f)) };
}

module.exports = { masterFiles, PRISTINE_UPGRADES, contentHash, upgradePristine, withUpgrades };

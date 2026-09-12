const { HttpError } = require("@shopcycle/utils");
const {
  renderTemplate,
  filesArrayToMap,
  getAssetContent,
  buildRoutes,
  serializeProduct,
  serializeCollection,
} = require("@shopcycle/theme-engine");
const { env } = require("../../config/env");
const repository = require("./repository");
const cartService = require("../cart/service");
const checkoutService = require("../checkout/service");
const appsService = require("../apps/service");

async function loadStoreOrThrow(prisma, handle) {
  const store = await repository.getStoreByHandle(prisma, handle);
  if (!store) throw new HttpError(404, `Store not found: ${handle}`);
  if (store.status === "suspended") throw new HttpError(503, "This store is currently unavailable");
  return store;
}

/** Multi-tenant SaaS custom domains (Phase 7) — a store's own domain (set
 * in Settings > Domains) resolves to its handle here, which is what lets
 * apps/storefront/middleware.js transparently rewrite a request to
 * example.com/ into the same /store/:handle route every other request
 * already goes through, with zero special-casing anywhere else. */
async function resolveDomain(prisma, domain) {
  const store = await repository.getStoreByDomain(prisma, domain);
  if (!store) return null;
  return { handle: store.handle };
}

async function resolveTheme(prisma, store, themeId) {
  const theme = themeId
    ? await repository.getThemeById(prisma, store.id, themeId)
    : await repository.getActiveTheme(prisma, store.id);
  if (!theme) throw new HttpError(404, themeId ? "Theme not found" : "No active theme installed");
  return theme;
}

/** Merchants type simple relative paths ("/pages/about", "/collections/all")
 * in the Navigation admin — prefix with the store's root here so the link
 * lands under the multi-tenant /store/:handle namespace without the
 * merchant needing to know that namespace exists. Absolute URLs (external
 * links) pass through untouched. */
function buildLinklists(menus, routes) {
  // routes.root_url is "/" in rootless mode (a real, clickable "go home"
  // href) rather than "" — but concatenating a link under it needs the
  // bare prefix ("" here, not "/"), or every menu link would come out
  // "//about" instead of "/about".
  const linkRoot = routes.root_url === "/" ? "" : routes.root_url;
  const linklists = {};
  for (const menu of menus) {
    linklists[menu.handle] = {
      title: menu.title,
      links: menu.items.map((item) => ({
        title: item.label,
        url: /^https?:\/\//.test(item.url) ? item.url : `${linkRoot}${item.url.startsWith("/") ? "" : "/"}${item.url}`,
      })),
    };
  }
  return linklists;
}

/** Builds every piece of data a template render might reference, regardless
 * of which template is being rendered — cheap enough at this store's scale
 * (see the repository functions' doc note on eager-loading), and it keeps
 * this function the single place that knows the full storefront data shape. */
async function buildGlobalContext(prisma, redis, store, { slug, cartId, discountError, checkoutError, rootless } = {}) {
  const [products, collections, cart, menus, apps] = await Promise.all([
    repository.getAllActiveProducts(prisma, store.id),
    repository.getAllActiveCollections(prisma, store.id),
    cartService.getCart(prisma, redis, store.id, cartId, store.handle),
    repository.getMenus(prisma, store.id),
    appsService.getInstalledAppsContext(prisma, store.id),
  ]);

  const all_products = {};
  for (const p of products) all_products[p.slug] = serializeProduct(p, store.handle, { rootless });

  const collectionsMap = {};
  for (const c of collections) {
    collectionsMap[c.slug] = serializeCollection(
      { ...c, products: c.products.map((cp) => cp.product) },
      store.handle,
      { rootless }
    );
  }
  // `collections.all` is the conventional "every active product" pseudo-collection.
  collectionsMap.all = { id: "all", title: "All products", slug: "all", products: Object.values(all_products) };

  const routes = buildRoutes(store.handle, { rootless });

  return {
    shop: { name: store.name, handle: store.handle, currency: store.currency, locale: "en" },
    routes,
    all_products,
    collections: collectionsMap,
    cart,
    customer: null,
    linklists: buildLinklists(menus, routes),
    page_title: store.name,
    discount_error: discountError || null,
    checkout_error: checkoutError || null,
    payment_methods: checkoutService.availablePaymentMethods(),
    apps,
  };
}

async function renderPage(
  prisma,
  redis,
  {
    handle,
    templateName,
    slug,
    themeId,
    cartId,
    templateOverride,
    settingsOverride,
    filesOverride,
    discountError,
    checkoutError,
    orderId,
    searchQuery,
    rootless,
  }
) {
  const store = await loadStoreOrThrow(prisma, handle);
  const theme = await resolveTheme(prisma, store, themeId);
  // Code-editor live preview: unsaved file edits merge over the persisted
  // theme files. This is what makes editing a section's .liquid source
  // (not just template.json structure) show up in the preview instantly.
  const filesByPath = { ...filesArrayToMap(theme.files), ...(filesOverride || {}) };

  const globalContext = await buildGlobalContext(prisma, redis, store, {
    slug,
    cartId,
    discountError,
    checkoutError,
    rootless,
  });

  if (templateName === "product") {
    if (!slug) throw new HttpError(400, "Missing product slug");
    const product = globalContext.all_products[slug];
    if (!product) throw new HttpError(404, `Product not found: ${slug}`);
    globalContext.product = product;
  }
  if (templateName === "collection") {
    if (!slug) throw new HttpError(400, "Missing collection slug");
    const collection = globalContext.collections[slug];
    if (!collection) throw new HttpError(404, `Collection not found: ${slug}`);
    globalContext.collection = collection;
  }
  if (templateName === "page") {
    if (!slug) throw new HttpError(400, "Missing page slug");
    const page = await repository.getActivePageBySlug(prisma, store.id, slug);
    if (!page) throw new HttpError(404, `Page not found: ${slug}`);
    globalContext.page = page;
    globalContext.page_title = page.seoTitle || page.title;
  }
  if (templateName === "order-confirmation") {
    if (!orderId) throw new HttpError(400, "Missing order");
    globalContext.order = await checkoutService.getOrderForConfirmation(prisma, store.id, orderId);
    globalContext.page_title = "Order confirmed";
  }
  if (templateName === "search") {
    // No separate index to query — `all_products` is already every active
    // product for this render, so a case-insensitive title match is just a
    // filter over data already in memory, not a new query.
    const q = (searchQuery || "").trim();
    const matches = q
      ? Object.values(globalContext.all_products).filter((p) => p.title.toLowerCase().includes(q.toLowerCase()))
      : [];
    globalContext.search = { query: q, results: matches, result_count: matches.length };
    // Reuses templates/search.json -> sections/product-grid.liquid, which
    // reads `collection.products` when it has no collection setting of its
    // own — a synthetic "collection" is the whole mechanism, no changes
    // needed to that section for search to work.
    globalContext.collection = {
      id: "search",
      title: q ? `Search results for "${q}"` : "Search",
      slug: "search",
      products: matches,
    };
  }

  let html = await renderTemplate({
    filesByPath,
    templateName,
    templateOverride,
    settingsData: settingsOverride ?? theme.settingsData,
    globalContext,
    meta: { handle: store.handle, themeId: theme.id, currency: store.currency, apiUrl: env.API_PUBLIC_URL },
  });

  // CSS is fetched by the browser via a separate <link> GET to the asset
  // endpoint, which always serves the *saved* file — an unsaved CSS edit
  // has no other way to reach the preview, so inline it where it cascades
  // over the (stale) linked stylesheet. JS isn't given the same treatment:
  // unlike CSS, two versions of a script can't simply "layer" over each
  // other, so unsaved JS previews only after Save — a limitation, not a bug.
  if (filesOverride?.["assets/theme.css"]) {
    html = html.replace("</head>", `<style>${filesOverride["assets/theme.css"]}</style></head>`);
  }

  return { html, cartId: globalContext.cart.cartId };
}

async function getAsset(prisma, { handle, themeId, assetPath }) {
  const store = await loadStoreOrThrow(prisma, handle);
  const theme = await repository.getThemeById(prisma, store.id, themeId);
  if (!theme) throw new HttpError(404, "Theme not found");
  const filesByPath = filesArrayToMap(theme.files);
  const asset = getAssetContent(filesByPath, assetPath);
  if (!asset) throw new HttpError(404, `Asset not found: ${assetPath}`);
  return asset;
}

module.exports = { loadStoreOrThrow, resolveTheme, buildGlobalContext, renderPage, getAsset, resolveDomain };

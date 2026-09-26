const { HttpError } = require("@shopcycle/utils");
const {
  renderTemplate,
  filesArrayToMap,
  getAssetContent,
  buildRoutes,
  serializeProduct,
  serializeCollection,
} = require("@shopcycle/theme-engine");
const path = require("path");
const { env } = require("../../config/env");
const { THEMES_ROOT } = require("../../config/paths");
const { loadThemePackage } = require("../themes/file-loader");
const repository = require("./repository");
const cartService = require("../cart/service");
const checkoutService = require("../checkout/service");
const appsService = require("../apps/service");
const { computeAccessState, isStorefrontBlocked } = require("../billing/access");
const shopperService = require("../shopper/service");
const { FULL_INCLUDE } = require("../orders/operations");
const { publicOrder } = require("../orders/public");
const { ensureStatusToken } = require("../orders/notify");
const { esc } = require("../../emails/templates");
const { storeSettings } = require("../../lib/store-settings");
const { INDIAN_STATES } = require("../../lib/indian-states");
const blogService = require("../blog/service");
const platform = require("./platform");
const { buildSeo, seoTags } = require("./seo");

const CHECKOUT_COUNTRIES = [
  { code: "IN", name: "India" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "SG", name: "Singapore" },
  { code: "NP", name: "Nepal" },
  { code: "BD", name: "Bangladesh" },
  { code: "LK", name: "Sri Lanka" },
];

/**
 * LiquidJS doesn't HTML-escape output (Shopify's Liquid doesn't either —
 * themes print raw HTML on purpose). So anything that came from a URL or
 * from a shopper is escaped HERE, before it enters the page context:
 * error/notice messages and search terms arrive in the query string, and
 * without this a crafted link like ?checkoutError=<script>… would run
 * script on the store's own domain.
 */
const safe = (value) => (value === null || value === undefined || value === "" ? value || null : esc(value));

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

function serializeCustomer(customer) {
  if (!customer) return null;
  // Everything here was typed by the shopper — escaped for the page.
  return {
    id: customer.id,
    name: safe(customer.name),
    first_name: safe(String(customer.name || "").split(" ")[0]),
    email: safe(customer.email),
    phone: safe(customer.phone),
    address1: safe(customer.address1),
    address2: safe(customer.address2),
    city: safe(customer.city),
    province: safe(customer.province),
    zip: safe(customer.zip),
    country: safe(customer.country),
    accepts_marketing: customer.acceptsEmailMarketing,
    has_password: Boolean(customer.passwordHash),
    email_verified: Boolean(customer.emailVerifiedAt),
    // Signed in by code within the last half hour: may set a new password
    // without the old one (see shopper/service.js#setPassword).
    can_reset_password:
      customer.signInMethod === "code" && Date.now() / 1000 - (customer.signedInAt || 0) < 30 * 60,
  };
}

/** Theme-independent checkout helpers, added to whatever checkout page
 * the store's theme renders: fills in a signed-in shopper's saved details,
 * and records the email as it's typed so an abandoned checkout can be
 * followed up (see checkout/abandoned.js). Progressive enhancement — the
 * checkout works the same without it. */
function checkoutEnhancements(routes, customer) {
  const data = {
    contactUrl: `${routes.checkout_url}/contact`,
    prefill: customer
      ? {
          email: customer.email,
          phone: customer.phone,
          shippingName: customer.name,
          shippingAddress1: customer.address1,
          shippingAddress2: customer.address2,
          shippingCity: customer.city,
          shippingProvince: customer.province,
          shippingZip: customer.zip,
          shippingCountry: customer.country,
        }
      : {},
  };
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<script>(function(){var d=${json};var f=document.querySelector('form[action$="/checkout"]')||document.querySelector("form");if(!f)return;
Object.keys(d.prefill).forEach(function(k){var v=d.prefill[k];var el=f.elements[k];if(!v||!el||el.value)return;if(el.tagName==="SELECT"){for(var i=0;i<el.options.length;i++){if(el.options[i].value===v){el.value=v;}}}else{el.value=v;}});
var sent="";function capture(){var e=f.elements.email;if(!e)return;var v=(e.value||"").trim();if(!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(v)||v===sent)return;sent=v;var n=f.elements.shippingName;
try{fetch(d.contactUrl,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:v,name:n?n.value:""}),keepalive:true});}catch(err){}}
if(f.elements.email){f.elements.email.addEventListener("change",capture);f.elements.email.addEventListener("blur",capture);capture();}
if(f.elements.shippingName){f.elements.shippingName.addEventListener("change",function(){sent="";capture();});}})();</script>`;
}

async function loadStoreOrThrow(prisma, handle) {
  const store = await repository.getStoreByHandle(prisma, handle);
  if (!store) throw new HttpError(404, `Store not found: ${handle}`);
  if (store.status === "suspended") throw new HttpError(503, "This store is currently unavailable");
  // Distinct from the manual "suspended" status above: this is the
  // automatic 15-day-unpaid shutoff (see billing/access.js). A merchant
  // who's simply behind on a plan still gets to run their admin (blocked
  // there separately by requireActiveSubscription) right up until this
  // point — shoppers only stop seeing the storefront once it's been
  // unpaid long enough that continuing to serve it stops making sense.
  if (isStorefrontBlocked(computeAccessState(store))) {
    throw new HttpError(503, "This store is currently unavailable");
  }
  return store;
}

/** Multi-tenant SaaS custom domains (Phase 7) — a store's own domain (set
 * in Settings > Domains) resolves to its handle here, which is what lets
 * apps/storefront/middleware.js transparently rewrite a request to
 * example.com/ into the same /store/:handle route every other request
 * already goes through, with zero special-casing anywhere else. */
async function resolveDomain(prisma, domain) {
  const host = String(domain || "").toLowerCase().replace(/\.$/, "");
  // A connected apex domain also answers on its www. twin.
  const store =
    (await repository.getStoreByDomain(prisma, host)) ||
    (host.startsWith("www.") ? await repository.getStoreByDomain(prisma, host.slice(4)) : null);
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

/** Store-level facts the platform pages show (free delivery threshold,
 * COD, return window, whether prices include tax). */
async function storeFacts(prisma, store) {
  const [cheapest, taxRates] = await Promise.all([
    prisma.shippingRate.findFirst({ where: { zone: { storeId: store.id }, freeAbove: { not: null } }, orderBy: { freeAbove: "asc" } }),
    prisma.taxRate.count({ where: { storeId: store.id } }),
  ]);
  const settings = storeSettings(store);
  return {
    free_shipping_above: cheapest?.freeAbove != null ? Number(cheapest.freeAbove) : null,
    cod_enabled: checkoutService.availablePaymentMethods().some((m) => m.value === "cod"),
    return_days: Number(settings.returnWindowDays) || 0,
    low_stock: Number(settings.lowStockThreshold) || 5,
    // No tax rate configured → prices are treated as tax-inclusive (MRP).
    taxes_included: taxRates === 0,
  };
}

/** Best sellers over the last 90 days (paid orders), for home page
 * sections and the empty-cart suggestions; newest products fill in. */
async function bestSellers(prisma, store, allProducts, limit = 12) {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const rows = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: {
      productId: { not: null },
      order: { storeId: store.id, createdAt: { gte: since }, paymentStatus: { in: ["paid", "partially_refunded"] } },
    },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: limit,
  });
  const byId = new Map(Object.values(allProducts).map((p) => [p.id, p]));
  const ranked = rows.map((r) => byId.get(r.productId)).filter(Boolean);
  const newest = Object.values(allProducts).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  for (const p of newest) {
    if (ranked.length >= limit) break;
    if (!ranked.includes(p)) ranked.push(p);
  }
  return ranked;
}

/** Builds every piece of data a template render might reference, regardless
 * of which template is being rendered — cheap enough at this store's scale
 * (see the repository functions' doc note on eager-loading), and it keeps
 * this function the single place that knows the full storefront data shape. */
async function buildGlobalContext(prisma, store, { slug, cartId, discountError, checkoutError, giftCardError, rootless, customer = null, themeSettings = {} } = {}) {
  const routes = buildRoutes(store.handle, { rootless });
  const [products, collections, cart, menus, apps, facts, articles] = await Promise.all([
    repository.getAllActiveProducts(prisma, store.id),
    repository.getAllActiveCollections(prisma, store.id),
    cartService.getCart(prisma, store.id, cartId, store.handle),
    repository.getMenus(prisma, store.id),
    appsService.getInstalledAppsContext(prisma, store.id),
    storeFacts(prisma, store),
    blogService.latestArticles(prisma, store, routes, 6),
  ]);

  const all_products = {};
  for (const p of products) all_products[p.slug] = serializeProduct(p, store.handle, { rootless });

  const collectionsMap = {};
  for (const c of collections) {
    collectionsMap[c.slug] = serializeCollection(
      // Draft/archived products are linked to collections too — never show them.
      { ...c, products: c.products.map((cp) => cp.product).filter((p) => p.status === "active") },
      store.handle,
      { rootless }
    );
  }
  // `collections.all` is the conventional "every active product" pseudo-collection.
  collectionsMap.all = {
    id: "all",
    title: "All products",
    slug: "all",
    url: `${routes.collections_url}/all`,
    description: "",
    products: Object.values(all_products),
  };

  const best = await bestSellers(prisma, store, all_products);
  const headerLogo = themeSettings?.sections?.header?.settings?.logo || null;

  return {
    shop: {
      name: store.name,
      handle: store.handle,
      currency: store.currency,
      locale: "en",
      support_email: store.supportEmail || null,
      support_phone: store.supportPhone || null,
      logo: headerLogo,
      ...facts,
    },
    routes,
    all_products,
    collections: collectionsMap,
    best_sellers: best,
    featured_products: best,
    blog: { title: "Blog", url: routes.blog_url, articles },
    cart,
    customer: serializeCustomer(customer),
    linklists: buildLinklists(menus, routes),
    page_title: store.name,
    discount_error: safe(discountError),
    checkout_error: safe(checkoutError),
    gift_card_error: safe(giftCardError),
    payment_methods: checkoutService.availablePaymentMethods(),
    platform: { fonts_url: platform.fontsUrl(themeSettings) },
    apps,
  };
}

const SORTS = {
  featured: { label: "Featured", fn: null },
  "best-selling": { label: "Best selling", fn: null },
  "price-asc": { label: "Price, low to high", fn: (a, b) => a.price - b.price },
  "price-desc": { label: "Price, high to low", fn: (a, b) => b.price - a.price },
  newest: { label: "Newest", fn: (a, b) => new Date(b.created_at) - new Date(a.created_at) },
  "title-asc": { label: "Alphabetically, A–Z", fn: (a, b) => a.title.localeCompare(b.title) },
};

/** Up to 8 products to suggest on a product page: same collection first,
 * then same category or brand, then best sellers. */
function relatedProducts(ctx, product, collection) {
  const picked = [];
  const add = (p) => {
    if (p && p.id !== product.id && !picked.includes(p) && p.available) picked.push(p);
  };
  (collection?.products || []).forEach(add);
  Object.values(ctx.all_products).forEach((p) => {
    if ((product.category && p.category === product.category) || (product.brand && p.brand === product.brand)) add(p);
  });
  ctx.best_sellers.forEach(add);
  return picked.slice(0, 8);
}

/** The first real collection a product is in — its breadcrumb and
 * "you may also like" source. */
function primaryCollection(ctx, product) {
  return Object.values(ctx.collections).find((c) => c.slug !== "all" && c.products.some((p) => p.id === product.id)) || null;
}

async function renderPage(
  prisma,
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
    giftCardError,
    orderId,
    searchQuery,
    rootless,
    // Phase 4 — shopper accounts and order status.
    fastify,
    shopperToken,
    orderToken,
    loginStep,
    loginMode,
    loginEmail,
    formError,
    notice,
    localAssets = false,
    // Phase 6 — listings and the blog.
    sort,
    inStock,
    variant,
    page,
    tag,
    returnTo,
  }
) {
  const store = await loadStoreOrThrow(prisma, handle);
  const theme = await resolveTheme(prisma, store, themeId);
  // Storefront pages load their CSS, JS and images from the store's own
  // address (the storefront app proxies them); null = straight from the
  // API, for the admin's editor preview.
  const assetBase = localAssets ? (rootless ? "" : `/store/${store.handle}`) : null;
  const themeSettings = settingsOverride ?? theme.settingsData ?? {};
  const system = platform.isSystemTemplate(templateName);

  // Master theme files fill in anything this store's copy lacks (see
  // masterFiles); then the store's own files; then, for the code editor's
  // live preview, unsaved edits over the top. Platform pages (everything
  // but the home page) always use Oyklane's own templates on top of that —
  // a theme can style them but not replace them.
  let filesByPath = { ...(await masterFiles(theme.handle)), ...filesArrayToMap(theme.files), ...(filesOverride || {}) };
  if (system) {
    const { renderFiles } = await platform.load();
    filesByPath = { ...filesByPath, ...renderFiles };
    if (platform.OWN_LAYOUT[templateName]) filesByPath["layout/theme.liquid"] = renderFiles[platform.OWN_LAYOUT[templateName]];
  }

  const customer = fastify && shopperToken ? await shopperService.customerFromToken(fastify, store, shopperToken) : null;
  // (The checkout prefill below uses the raw record: it goes into JSON and
  // input values, where HTML-escaping would show "&amp;" to the shopper.)

  const globalContext = await buildGlobalContext(prisma, store, {
    slug,
    cartId,
    discountError,
    checkoutError,
    giftCardError,
    rootless,
    customer,
    themeSettings,
  });
  globalContext.form_error = safe(formError);
  globalContext.notice = safe(notice);
  const routes = globalContext.routes;

  if (templateName === "product") {
    if (!slug) throw new HttpError(400, "Missing product slug");
    const found = globalContext.all_products[slug];
    if (!found) throw new HttpError(404, `Product not found: ${slug}`);
    const collection = primaryCollection(globalContext, found);
    const selected = found.variants.find((v) => v.id === variant) || found.variants.find((v) => v.available) || found.variants[0] || null;
    globalContext.product = {
      ...found,
      collection: collection && { title: collection.title, slug: collection.slug, url: collection.url },
      selected_variant: selected,
      related: relatedProducts(globalContext, found, collection),
      client_json: JSON.stringify({
        currency: store.currency,
        lowStock: globalContext.shop.low_stock,
        labels: { add: "Add to cart", soldOut: "Sold out" },
        variants: found.variants.map((v) => ({
          id: v.id,
          title: v.title,
          price: v.price,
          comparePrice: v.comparePrice,
          inventoryQuantity: v.inventoryQuantity,
          available: v.available,
        })),
      }).replace(/</g, "\\u003c"),
    };
  }
  if (templateName === "collection") {
    if (!slug) throw new HttpError(400, "Missing collection slug");
    const found = globalContext.collections[slug];
    if (!found) throw new HttpError(404, `Collection not found: ${slug}`);
    const sortKey = SORTS[sort] ? sort : "featured";
    let list = [...found.products];
    if (inStock) list = list.filter((p) => p.available);
    if (sortKey === "best-selling") {
      const rank = new Map(globalContext.best_sellers.map((p, i) => [p.id, i]));
      list.sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
    } else if (SORTS[sortKey].fn) {
      list.sort(SORTS[sortKey].fn);
    }
    globalContext.collection = { ...found, products: list, products_count: list.length };
    globalContext.listing = {
      sort: sortKey,
      in_stock: Boolean(inStock),
      sort_options: Object.entries(SORTS).map(([value, o]) => ({ value, label: o.label })),
    };
  }
  if (templateName === "page") {
    if (!slug) throw new HttpError(400, "Missing page slug");
    const found = await repository.getActivePageBySlug(prisma, store.id, slug);
    if (!found) throw new HttpError(404, `Page not found: ${slug}`);
    globalContext.page = found;
  }
  if (templateName === "cart") {
    const threshold = globalContext.shop.free_shipping_above;
    const cart = globalContext.cart;
    if (threshold && cart.items.length) {
      const remaining = Math.max(threshold - cart.subtotal, 0);
      cart.free_shipping = {
        threshold,
        remaining,
        reached: remaining === 0,
        percent: Math.min(100, Math.round((cart.subtotal / threshold) * 100)),
      };
    }
  }
  if (templateName === "checkout") {
    globalContext.checkout_countries = CHECKOUT_COUNTRIES;
    globalContext.indian_states = INDIAN_STATES.map((s) => s.name);
  }
  if (templateName === "order-confirmation") {
    if (!orderId) throw new HttpError(400, "Missing order");
    const placed = await checkoutService.getOrderForConfirmation(prisma, store.id, orderId);
    globalContext.order = {
      ...placed,
      shippingName: safe(placed.shippingName),
      shippingAddress1: safe(placed.shippingAddress1),
      shippingAddress2: safe(placed.shippingAddress2),
      shippingCity: safe(placed.shippingCity),
      shippingProvince: safe(placed.shippingProvince),
      shippingZip: safe(placed.shippingZip),
      shippingCountry: safe(placed.shippingCountry),
      email: safe(placed.email),
      phone: safe(placed.phone),
      giftCardAmount: Number(placed.giftCardAmount || 0),
      amountDue: Math.max(0, Number(placed.total) - Number(placed.giftCardAmount || 0)),
      status_url: `${routes.orders_url}/${await ensureStatusToken(prisma, placed)}`,
    };
  }
  if (templateName === "order-status") {
    const order = orderToken
      ? await prisma.order.findFirst({ where: { storeId: store.id, statusToken: String(orderToken) }, include: FULL_INCLUDE })
      : null;
    if (!order) throw new HttpError(404, "We couldn't find that order. Check the link in your email.");
    const base = `${routes.orders_url}/${order.statusToken}`;
    globalContext.order = publicOrder(store, order, { statusUrl: base, invoiceUrl: `${base}/invoice` });
    globalContext.order.return_url = `${base}/return`;
  }
  if (templateName === "account-login") {
    globalContext.login = {
      step: loginStep === "code" ? "code" : "email",
      mode: ["register", "code"].includes(loginMode) ? loginMode : "password",
      email: safe(loginEmail) || "",
      return_to: returnTo || null,
    };
  }
  if (templateName === "account" && customer) {
    // Until the email is verified by a code, only orders placed while
    // signed in: anyone can type an address at sign-up.
    const orders = await prisma.order.findMany({
      where: customer.emailVerifiedAt
        ? { storeId: store.id, OR: [{ customerId: customer.id }, { email: { equals: customer.email, mode: "insensitive" } }] }
        : { storeId: store.id, customerId: customer.id, placedSignedIn: true },
      include: FULL_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const list = [];
    for (const o of orders) {
      const token = await ensureStatusToken(prisma, o);
      list.push(publicOrder(store, o, { statusUrl: `${routes.orders_url}/${token}` }));
    }
    globalContext.customer.orders = list;
    globalContext.customer.orders_count = list.length;
  }
  if (templateName === "search") {
    // No separate index to query — `all_products` is already every active
    // product for this render, so a case-insensitive match over title,
    // brand, category and tags is a filter over data already in memory.
    const q = (searchQuery || "").trim().toLowerCase();
    const matches = q
      ? Object.values(globalContext.all_products).filter((p) =>
          [p.title, p.brand, p.category, p.product_type, ...p.tags].some((field) => field && String(field).toLowerCase().includes(q))
        )
      : [];
    globalContext.search = { query: safe(searchQuery?.trim()) || "", results: matches, result_count: matches.length };
    // Older theme copies render search through sections/product-grid.liquid,
    // which reads `collection.products`.
    globalContext.collection = {
      id: "search",
      title: q ? `Search results for "${esc(searchQuery.trim())}"` : "Search",
      slug: "search",
      products: matches,
    };
  }
  if (templateName === "blog") {
    const cleanTag = typeof tag === "string" ? tag.trim().slice(0, 40) : "";
    const result = await blogService.blogPage(prisma, store, routes, { page, tag: cleanTag || undefined });
    globalContext.blog = { ...globalContext.blog, ...result, tag: safe(cleanTag) || null };
  }
  if (templateName === "article") {
    globalContext.article = await blogService.articleBySlug(prisma, store, routes, slug);
  }

  const seo = buildSeo(store, templateName, globalContext);
  globalContext.page_title = seo.title;

  let html;
  try {
    html = await renderTemplate({
      filesByPath,
      templateName,
      // A platform page's layout can't be overridden from the editor.
      templateOverride: system ? undefined : templateOverride,
      settingsData: themeSettings,
      globalContext,
      meta: { handle: store.handle, themeId: theme.id, currency: store.currency, apiUrl: env.API_PUBLIC_URL, assetBase },
    });
  } catch (err) {
    if (err.code === "TEMPLATE_NOT_FOUND") throw new HttpError(404, "Page not found");
    throw err;
  }

  // Head: design tokens from the theme's settings, the platform
  // stylesheet (platform pages), and search/social tags.
  const drawer = platform.cartDrawerOn(themeSettings, templateName)
    ? {
        add: routes.cart_add_url,
        update: routes.cart_update_url,
        cart: routes.cart_url,
        cartJson: `${routes.cart_url}.json`,
        checkout: routes.checkout_url,
        shop: routes.all_products_url,
        root: routes.root_url,
        currency: store.currency,
        freeShippingAbove: globalContext.shop.free_shipping_above,
      }
    : null;
  const head = `${await platform.headTags(themeSettings, { system, drawer, assetBase })}${seoTags(seo)}`;
  html = html.includes("</head>") ? html.replace("</head>", `${head}</head>`) : head + html;

  // CSS is fetched by the browser via a separate <link> GET to the asset
  // endpoint, which always serves the *saved* file — an unsaved CSS edit
  // has no other way to reach the preview, so inline it where it cascades
  // over the (stale) linked stylesheet. JS isn't given the same treatment:
  // unlike CSS, two versions of a script can't simply "layer" over each
  // other, so unsaved JS previews only after Save — a limitation, not a bug.
  if (filesOverride?.["assets/theme.css"]) {
    html = html.replace("</head>", `<style>${filesOverride["assets/theme.css"]}</style></head>`);
  }

  let tail = await platform.bodyTags({ system, drawer, assetBase });
  if (templateName === "checkout") tail += checkoutEnhancements(routes, customer);
  if (tail) html = html.includes("</body>") ? html.replace("</body>", `${tail}</body>`) : html + tail;

  // Uploaded images are stored with the API's address; on the storefront
  // they're served through the store's own address instead. Only this
  // store's uploads (/uploads/<store id>/…) are touched.
  if (assetBase != null) {
    html = html.replace(new RegExp(`https?:\\/\\/[^"'\\s/<>()]+\\/uploads\\/${store.id}\\/`, "g"), `${assetBase}/uploads/${store.id}/`);
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

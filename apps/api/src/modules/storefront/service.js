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
async function buildGlobalContext(prisma, store, { slug, cartId, discountError, checkoutError, rootless, customer = null } = {}) {
  const [products, collections, cart, menus, apps] = await Promise.all([
    repository.getAllActiveProducts(prisma, store.id),
    repository.getAllActiveCollections(prisma, store.id),
    cartService.getCart(prisma, store.id, cartId, store.handle),
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
    shop: {
      name: store.name,
      handle: store.handle,
      currency: store.currency,
      locale: "en",
      support_email: store.supportEmail || null,
      support_phone: store.supportPhone || null,
    },
    routes,
    all_products,
    collections: collectionsMap,
    cart,
    customer: serializeCustomer(customer),
    linklists: buildLinklists(menus, routes),
    page_title: store.name,
    discount_error: safe(discountError),
    checkout_error: safe(checkoutError),
    payment_methods: checkoutService.availablePaymentMethods(),
    apps,
  };
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
    orderId,
    searchQuery,
    rootless,
    // Phase 4 — shopper accounts and order status.
    fastify,
    shopperToken,
    orderToken,
    loginStep,
    loginEmail,
    formError,
    notice,
  }
) {
  const store = await loadStoreOrThrow(prisma, handle);
  const theme = await resolveTheme(prisma, store, themeId);
  // Master theme files fill in anything this store's copy lacks (see
  // masterFiles); then the store's own files; then, for the code editor's
  // live preview, unsaved edits over the top.
  const filesByPath = { ...(await masterFiles(theme.handle)), ...filesArrayToMap(theme.files), ...(filesOverride || {}) };

  const customer = fastify && shopperToken ? await shopperService.customerFromToken(fastify, store, shopperToken) : null;
  // (The checkout prefill below uses the raw record: it goes into JSON and
  // input values, where HTML-escaping would show "&amp;" to the shopper.)

  const globalContext = await buildGlobalContext(prisma, store, {
    slug,
    cartId,
    discountError,
    checkoutError,
    rootless,
    customer,
  });
  globalContext.form_error = safe(formError);
  globalContext.notice = safe(notice);

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
    };
    globalContext.page_title = "Order confirmed";
  }
  if (templateName === "order-status") {
    const order = orderToken
      ? await prisma.order.findFirst({ where: { storeId: store.id, statusToken: String(orderToken) }, include: FULL_INCLUDE })
      : null;
    if (!order) throw new HttpError(404, "We couldn't find that order. Check the link in your email.");
    const base = `${globalContext.routes.orders_url}/${order.statusToken}`;
    globalContext.order = publicOrder(store, order, { statusUrl: base, invoiceUrl: `${base}/invoice` });
    globalContext.order.return_url = `${base}/return`;
    globalContext.page_title = `Order #${order.orderNumber}`;
  }
  if (templateName === "order-lookup") {
    globalContext.page_title = "Find your order";
  }
  if (templateName === "account-login") {
    globalContext.login = {
      step: loginStep === "code" ? "code" : "email",
      email: safe(loginEmail) || "",
    };
    globalContext.page_title = "Sign in";
  }
  if (templateName === "account") {
    if (customer) {
      const orders = await prisma.order.findMany({
        where: { storeId: store.id, OR: [{ customerId: customer.id }, { email: { equals: customer.email, mode: "insensitive" } }] },
        include: FULL_INCLUDE,
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      const list = [];
      for (const o of orders) {
        const token = await ensureStatusToken(prisma, o);
        list.push(publicOrder(store, o, { statusUrl: `${globalContext.routes.orders_url}/${token}` }));
      }
      globalContext.customer.orders = list;
      globalContext.customer.orders_count = list.length;
    }
    globalContext.page_title = "Your account";
  }
  if (templateName === "search") {
    // No separate index to query — `all_products` is already every active
    // product for this render, so a case-insensitive title match is just a
    // filter over data already in memory, not a new query.
    const q = (searchQuery || "").trim();
    const matches = q
      ? Object.values(globalContext.all_products).filter((p) => p.title.toLowerCase().includes(q.toLowerCase()))
      : [];
    globalContext.search = { query: safe(q) || "", results: matches, result_count: matches.length };
    // Reuses templates/search.json -> sections/product-grid.liquid, which
    // reads `collection.products` when it has no collection setting of its
    // own — a synthetic "collection" is the whole mechanism, no changes
    // needed to that section for search to work.
    globalContext.collection = {
      id: "search",
      title: q ? `Search results for "${esc(q)}"` : "Search",
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
  if (templateName === "checkout" && !templateOverride) {
    const script = checkoutEnhancements(globalContext.routes, customer);
    html = html.includes("</body>") ? html.replace("</body>", `${script}</body>`) : html + script;
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

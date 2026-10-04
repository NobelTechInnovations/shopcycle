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
const socialConnections = require("../social/connections");
const { computeAccess } = require("../billing/access");
const shopperService = require("../shopper/service");
const paymentsService = require("../payments/service");
const metafieldService = require("../metafields/service");
const reviewsService = require("../reviews/service");
const { FULL_INCLUDE } = require("../orders/operations");
const { publicOrder } = require("../orders/public");
const { ensureStatusToken } = require("../orders/notify");
const { esc } = require("../../emails/templates");
const { storeSettings } = require("../../lib/store-settings");
const messaging = require("../../lib/messaging");
const pagePolicies = require("../pages/policies");
const { PLACED } = require("../orders/placed");
const { INDIAN_STATES } = require("../../lib/indian-states");
const blogService = require("../blog/service");
const rentalsService = require("../rentals/service");
const platform = require("./platform");
const { trackingTags } = require("./tracking");
const { buildSeo, seoTags } = require("./seo");
const shopperPhone = require("../shopper/phone");
const googleOAuth = require("../../lib/google-oauth");

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

// Store copies vs. the master theme: themes/pristine.js.
const { masterFiles, upgradePristine } = require("../themes/pristine");

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

/**
 * One-Click Checkout (the app of that name, installed from Apps): the cart
 * drawer's checkout button opens a step-by-step popup instead of the full
 * checkout page — mobile number, a code (`otp`, when an SMS or WhatsApp
 * provider is set up), a saved or new address, then payment. "native" is
 * Oyklane's own popup; `provider` leaves room for a third-party express
 * checkout later. The popup posts to the same checkout route as the full
 * page, flagged `oneClick`, so the order records that the app was used (and
 * its fee) — the API checks the app really is installed before honouring it.
 */
function oneClickConfig(ctx, customer, store) {
  const app = ctx.apps?.["one-click-checkout"];
  if (!app || !ctx.payment_methods?.length) return null;
  const fields = storeSettings(store).checkout;
  const live = messaging.channels();
  return {
    provider: app.provider || "native",
    otp: Boolean(live.sms || live.whatsapp || env.NODE_ENV !== "production"),
    storeName: store.name,
    fields: { phone: fields.phone, address2: fields.address2, company: fields.company, country: fields.country },
    options: (ctx.payment_options || []).map((o) => ({ value: o.value, mode: o.mode, title: o.title, subtitle: o.subtitle, badges: o.badges, testMode: Boolean(o.testMode), gateway: o.gateway })),
    states: INDIAN_STATES.map((st) => st.name),
    // The signed-in shopper's details (their saved addresses are fetched
    // when the popup opens). Signed out, nothing is filled in.
    prefill: customer
      ? {
          phoneVerified: Boolean(customer.phoneVerifiedAt || customer.phone_verified),
          email: customer.email || "",
          phone: customer.phone || "",
          shippingName: customer.name || "",
          shippingAddress1: customer.address1 || "",
          shippingAddress2: customer.address2 || "",
          shippingCity: customer.city || "",
          shippingProvince: customer.province || "",
          shippingZip: customer.zip || "",
        }
      : null,
  };
}

/**
 * The Phone Login app's sign-in popup: with the app on, a signed-out
 * shopper's account links open a phone → code popup instead of the sign-in
 * page (which stays as the no-JavaScript fallback).
 */
function loginPopupConfig(ctx, customer, store, routes, templateName) {
  const app = ctx.apps?.["phone-login"];
  if (!app || customer || templateName === "account-login") return null;
  const setting = app.channel;
  const chosen = shopperPhone.liveChannels(setting === "whatsapp" ? ["whatsapp"] : setting === "both" ? ["sms", "whatsapp"] : ["sms"]);
  const channels = chosen.length ? chosen : shopperPhone.liveChannels();
  if (!channels.length) return null;
  return {
    storeName: store.name,
    channels,
    endpoint: `${routes.account_url}/phone`,
    account: routes.account_url,
    login: routes.account_login_url,
    register: routes.account_register_url,
    // "Sign in" links that carry ?return_to= go back there afterwards.
    returns: { checkout: routes.checkout_url, cart: routes.cart_url },
  };
}

async function loadStoreOrThrow(prisma, handle) {
  const found = await repository.getStoreByHandle(prisma, handle);
  if (!found) throw new HttpError(404, `Store not found: ${handle}`);
  const { subscription, ...store } = found;
  // Offline when the platform suspended the store, or billing did (unpaid
  // cycles — billing/access.js). Shoppers get a friendly page and checkout
  // is closed; the merchant's dashboard shows how to bring it back.
  if (store.status === "suspended" || !computeAccess(subscription, { storeStatus: store.status }).storefront) {
    throw new HttpError(503, `${store.name} is temporarily unavailable. Please check back soon.`, { code: "store_unavailable" });
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
    // Items are a flat, ordered list with a depth; a link's sub-links are
    // the deeper ones right after it — `link.links`, as in Shopify themes.
    const top = [];
    const parents = [];
    for (const item of menu.items) {
      const link = {
        title: item.label,
        url: /^https?:\/\//.test(item.url) ? item.url : `${linkRoot}${item.url.startsWith("/") ? "" : "/"}${item.url}`,
        links: [],
      };
      const depth = Math.min(item.depth || 0, parents.length);
      parents.length = depth;
      (depth === 0 ? top : parents[depth - 1].links).push(link);
      parents.push(link);
    }
    linklists[menu.handle] = { title: menu.title, links: top };
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
    cod_enabled: paymentsService.codEnabled(store),
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
const POWERED_BY =
  '<a href="https://oyklane.com" target="_blank" rel="noopener" data-oy-powered style="display:inline!important;visibility:visible!important;opacity:1!important;color:inherit!important;font-size:inherit!important;text-decoration:underline;text-underline-offset:3px;white-space:nowrap">Powered by Oyklane.com</a>';

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

  // Rentals app: rented products show their daily rent on cards and are
  // never "sold out" — a piece comes back; the calendar shows what's free.
  // With the app removed, a product still set up for renting isn't for
  // sale either (its selling price is usually 0) — it shows as sold out.
  const rentalOn = Boolean(apps[rentalsService.APP_KEY]);
  const rentalById = {};
  for (const p of products) {
    const info = p.rental && rentalsService.cardInfo(p.rental);
    if (info) rentalById[p.id] = info;
  }
  if (Object.keys(rentalById).length) {
    const tagRental = (p) => {
      if (!rentalById[p.id]) return;
      if (rentalOn) p.rental = rentalById[p.id];
      p.available = rentalOn;
      p.variants.forEach((v) => (v.available = rentalOn));
    };
    Object.values(all_products).forEach(tagRental);
    Object.values(collectionsMap).forEach((c) => (c.products || []).forEach(tagRental));
  }

  // Product Reviews app: stars on every product (cards and pages).
  const reviewsApp = apps[reviewsService.APP_KEY] ? { ...reviewsService.DEFAULTS, ...apps[reviewsService.APP_KEY] } : null;
  if (reviewsApp) {
    const ratings = await reviewsService.summaries(prisma, store.id);
    const tag = (p) => {
      p.rating = ratings[p.id] || { average: 0, count: 0 };
    };
    Object.values(all_products).forEach(tag);
    Object.values(collectionsMap).forEach((c) => (c.products || []).forEach(tag));
  }

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
    payment_methods: await checkoutService.availablePaymentMethods(prisma, store),
    // One choice per way to pay (UPI, card, net banking, …, cash on
    // delivery), from what the connected gateways offer.
    payment_options: await paymentsService.checkoutOptions(prisma, store),
    platform: { fonts_url: platform.fontsUrl(themeSettings) },
    apps,
    // Instagram feed / Google reviews apps: `instagram`, `google_reviews`.
    ...(await socialConnections.storefrontData(prisma, store.id, apps)),
    // Stars under product cards (Product Reviews app, "show on cards").
    show_card_ratings: Boolean(reviewsApp && reviewsApp.showOnCards),
    reviews_app: reviewsApp,
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

const SIZE_VALUE = /^(xxs|xs|s|m|l|xl|xxl|xxxl|[2-5]xl|free ?size|one ?size|\d{1,3}(\.\d)?|\d{2}\s?-\s?\d{2}|(uk|us|eu)\s?\d{1,2}(\.\d)?|\d+(\.\d+)?\s?(ml|l|g|gm|kg|cm|mm|in|inch|ct|carat)s?|\d{1,2}\s?(y|yrs?|years?|m|months?)(\s?-\s?\d{1,2}\s?(y|yrs?|years?|m|months?))?)$/i;
const COLOUR_WORDS =
  /\b(black|white|ivory|cream|off[- ]?white|beige|tan|camel|brown|chocolate|coffee|grey|gray|charcoal|silver|gold|rose ?gold|red|maroon|wine|burgundy|pink|blush|peach|coral|orange|rust|mustard|yellow|lime|olive|green|mint|sage|teal|turquoise|aqua|blue|navy|indigo|denim|sky|purple|lavender|lilac|violet|magenta|multi|multicolou?r|khaki|nude|stone|sand|emerald|ruby|sapphire)\b/i;

const COLOUR_HEX = {
  black: "#111111", white: "#ffffff", ivory: "#fffff0", cream: "#f3ead8", offwhite: "#f5f2ea", beige: "#d9c8a9", tan: "#c8a27a",
  camel: "#c19a6b", brown: "#6f4e37", chocolate: "#4b2e20", coffee: "#6f4e37", grey: "#9a9a9a", gray: "#9a9a9a", charcoal: "#36454f",
  silver: "#c0c0c0", gold: "#c9a14a", rosegold: "#b76e79", red: "#c62828", maroon: "#800000", wine: "#722f37", burgundy: "#800020",
  pink: "#f4a7b9", blush: "#f2c6c2", peach: "#f7c5a0", coral: "#ff7f50", orange: "#f28c28", rust: "#b7410e", mustard: "#e1ad01",
  yellow: "#f5d10f", lime: "#a4d65e", olive: "#6b7a3a", green: "#2e7d32", mint: "#aee4c8", sage: "#9caf88", teal: "#008080",
  turquoise: "#40e0d0", aqua: "#00c4cc", blue: "#1e5bc6", navy: "#1f2a44", indigo: "#3f3d9e", denim: "#4a6fa5", sky: "#87ceeb",
  purple: "#6a1b9a", lavender: "#b9a7e0", lilac: "#c8a2c8", violet: "#7f4fc9", magenta: "#c2185b", khaki: "#b9a66b", nude: "#e3bc9a",
  stone: "#b7afa3", sand: "#d8c3a0", emerald: "#1f7a4d", ruby: "#9b111e", sapphire: "#0f52ba",
  multi: "conic-gradient(#c62828, #f5d10f, #2e7d32, #1e5bc6, #6a1b9a, #c62828)",
};
function colourSwatch(value) {
  const m = String(value).match(COLOUR_WORDS);
  if (!m) return null;
  const word = m[1].toLowerCase().replace(/[^a-z]/g, "").replace(/^multicolou?r$/, "multi");
  const hex = COLOUR_HEX[word];
  if (!hex || !hex.startsWith("#")) return hex || null;
  // "Light blue", "Dark green": the same colour, lighter or darker.
  const shift = /\b(light|pale|baby|pastel)\b/i.test(value) ? [255, 0.45] : /\b(dark|deep)\b/i.test(value) ? [0, 0.35] : null;
  if (!shift) return hex;
  const [target, t] = shift;
  return `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) + (target - parseInt(hex.slice(i, i + 2), 16)) * t).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Variant titles like "M / Black" become separate pickers — Size and
 * Colour — when every variant has the same number of parts. Names are
 * guessed from the values (sizes, colour words); anything else is
 * "Style". A product with one variant, or mixed titles, gets none (the
 * page falls back to one button per variant).
 */
function variantOptions(product, selected) {
  const variants = product.variants || [];
  if (variants.length < 2) return [];
  const split = variants.map((v) => String(v.title || "").split(" / ").map((x) => x.trim()));
  const n = split[0].length;
  if (!split.every((parts) => parts.length === n && parts.every(Boolean))) return [];
  const chosen = String(selected?.title || "").split(" / ").map((x) => x.trim());
  const used = new Set();
  return Array.from({ length: n }, (_, i) => {
    const values = [...new Set(split.map((parts) => parts[i]))];
    let name = values.every((v) => SIZE_VALUE.test(v)) ? "Size" : values.every((v) => COLOUR_WORDS.test(v)) ? "Colour" : n === 1 ? "Option" : "Style";
    if (used.has(name)) name = `${name} ${i + 1}`;
    used.add(name);
    return {
      name,
      position: i,
      is_colour: name.startsWith("Colour"),
      selected: chosen[i] || values[0],
      values: values.map((value) => ({
        value,
        // Any in-stock variant with this value — the rest are shown struck through.
        available: variants.some((v, k) => split[k][i] === value && v.available),
        swatch: name.startsWith("Colour") ? colourSwatch(value) : null,
      })),
    };
  });
}

/**
 * A product list as the collection and search pages show it: filtered by
 * what the shopper ticked (price, availability, brand, category, size,
 * colour), sorted, plus the filter panel itself — each choice with how many
 * products have it, and links that remove one filter or all of them.
 * `raw` is the query as it arrived (multi-values joined with "|").
 */
const FACET_OPTIONS = ["Size", "Colour"];
const SIZE_ORDER = ["xxs", "xs", "s", "m", "l", "xl", "xxl", "xxxl", "2xl", "3xl", "4xl", "5xl"];
function sizeRank(v) {
  const i = SIZE_ORDER.indexOf(String(v).toLowerCase().replace(/\s+/g, ""));
  if (i !== -1) return i;
  const n = parseFloat(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? 100 + n : 10000;
}
function applyListing(products, raw, { baseUrl, keep = {}, bestSellers = [] }) {
  const pick = (v) => String(v || "").split("|").map((x) => x.trim()).filter(Boolean).slice(0, 30);
  const want = { brand: pick(raw.brand), category: pick(raw.category), size: pick(raw.size), colour: pick(raw.colour) };
  const num = (v) => (v === undefined || v === null || v === "" || Number.isNaN(Number(v)) ? null : Math.max(0, Number(v)));
  const priceMin = num(raw.price_min);
  const priceMax = num(raw.price_max);
  const inStock = Boolean(raw.in_stock);
  const sortKey = SORTS[raw.sort] ? raw.sort : "featured";

  const optionsOf = new Map(products.map((p) => [p.id, variantOptions(p, null)]));
  const hasOption = (p, name, values) =>
    (optionsOf.get(p.id) || []).some((o) => o.name === name && o.values.some((v) => values.includes(v.value)));
  const tests = {
    brand: (p) => want.brand.includes(p.brand),
    category: (p) => want.category.includes(p.category),
    size: (p) => hasOption(p, "Size", want.size),
    colour: (p) => hasOption(p, "Colour", want.colour),
  };
  const passes = (p, except) =>
    (!inStock || p.available) &&
    (priceMin === null || p.price >= priceMin) &&
    (priceMax === null || p.price <= priceMax) &&
    Object.keys(tests).every((k) => k === except || !want[k].length || tests[k](p));

  let list = products.filter((p) => passes(p));
  if (sortKey === "best-selling") {
    const rank = new Map(bestSellers.map((p, i) => [p.id, i]));
    list = [...list].sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
  } else if (SORTS[sortKey].fn) {
    list = [...list].sort(SORTS[sortKey].fn);
  }

  // Counts for each choice follow the other filters, so a choice never
  // promises products that the rest of the selection has already ruled out.
  const facet = (key, label, valuesOf) => {
    const counts = new Map();
    for (const p of products) {
      if (!passes(p, key)) continue;
      for (const v of new Set(valuesOf(p))) counts.set(v, (counts.get(v) || 0) + 1);
    }
    for (const v of want[key]) if (!counts.has(v)) counts.set(v, 0);
    const values = [...counts.entries()]
      .sort((a, b) => (key === "size" ? sizeRank(a[0]) - sizeRank(b[0]) : b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))))
      // Escaped for the page: values can come from the URL.
      .map(([value, count]) => ({ value: safe(value), count, checked: want[key].includes(value), swatch: key === "colour" ? colourSwatch(value) : null }));
    return values.length > 1 || want[key].length ? { key, label, values, active: want[key].length } : null;
  };
  const optionValues = (name) => (p) => ((optionsOf.get(p.id) || []).find((o) => o.name === name)?.values || []).map((v) => v.value);
  const facets = [
    facet("category", "Category", (p) => (p.category ? [p.category] : [])),
    facet("brand", "Brand", (p) => (p.brand ? [p.brand] : [])),
    ...FACET_OPTIONS.map((name) => facet(name.toLowerCase(), name, optionValues(name))),
  ].filter(Boolean);

  // Links: the current query minus one filter value (a chip's ×), or all.
  const query = (drop) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(keep)) if (v) params.set(k, v);
    if (sortKey !== "featured") params.set("sort", sortKey);
    if (inStock && drop !== "in_stock") params.set("in_stock", "1");
    if (priceMin !== null && drop !== "price") params.set("price_min", String(priceMin));
    if (priceMax !== null && drop !== "price") params.set("price_max", String(priceMax));
    for (const k of Object.keys(want)) {
      for (const v of want[k]) if (!(drop && drop[0] === k && drop[1] === v)) params.append(k, v);
    }
    const qs = params.toString();
    return qs ? `${baseUrl}?${qs}` : baseUrl;
  };
  const chips = [];
  if (inStock) chips.push({ label: "In stock", remove_url: query("in_stock") });
  if (priceMin !== null || priceMax !== null) {
    chips.push({ label: priceMin !== null && priceMax !== null ? `₹${priceMin}–₹${priceMax}` : priceMin !== null ? `₹${priceMin}+` : `Up to ₹${priceMax}`, remove_url: query("price") });
  }
  for (const k of Object.keys(want)) for (const v of want[k]) chips.push({ label: safe(v), remove_url: query([k, v]) });
  const prices = products.map((p) => p.price).filter((n) => Number.isFinite(n));
  const clearParams = new URLSearchParams(Object.entries(keep).filter(([, v]) => v));

  return {
    list,
    listing: {
      sort: sortKey,
      in_stock: inStock,
      sort_options: Object.entries(SORTS).map(([value, o]) => ({ value, label: o.label })),
      facets,
      price: {
        min: prices.length ? Math.floor(Math.min(...prices)) : 0,
        max: prices.length ? Math.ceil(Math.max(...prices)) : 0,
        from: priceMin,
        to: priceMax,
      },
      active: chips,
      active_count: chips.length,
      clear_url: clearParams.toString() ? `${baseUrl}?${clearParams}` : baseUrl,
      total_count: products.length,
      keep: Object.entries(keep)
        .filter(([, v]) => v)
        .map(([name, value]) => ({ name, value: safe(value) })),
    },
  };
}

/** Order lines get their product's photo and link (from this render's
 * active products — a deleted or hidden product just shows no photo). */
function withItemPhotos(ctx, orders) {
  const byId = {};
  for (const p of Object.values(ctx.all_products || {})) byId[p.id] = p;
  for (const o of orders) {
    for (const item of o.items || []) {
      const p = byId[item.product_id];
      item.image = p?.featured_image?.url || null;
      item.url = p?.url || null;
    }
  }
}

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

/** Domain verification tags the sales channels ask for (Google Merchant
 * Center, Meta) — set on the channel apps' pages. Codes are checked on save. */
function verificationTags(store) {
  const v = (store.settings && typeof store.settings === "object" && store.settings.verification) || {};
  const ok = (code) => typeof code === "string" && /^[A-Za-z0-9_\-:.]{4,120}$/.test(code);
  return `${ok(v.google) ? `<meta name="google-site-verification" content="${v.google}">` : ""}${ok(v.facebook) ? `<meta name="facebook-domain-verification" content="${v.facebook}">` : ""}`;
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
    loginPhone,
    formError,
    notice,
    localAssets = false,
    // An absolute base for assets (the theme editor preview, which renders
    // inside the admin — its files come from the store's own address).
    assetBaseOverride,
    // Phase 6 — listings and the blog.
    sort,
    inStock,
    // Collection and search filters, as they came in the URL (see applyListing).
    filters = {},
    variant,
    page,
    tag,
    returnTo,
  }
) {
  // "product.rental": the theme editor previewing one of a page's extra
  // templates. Live pages ask for "product" and the item names its own.
  const parts = platform.templateParts(templateName);
  templateName = parts.base;
  const store = await loadStoreOrThrow(prisma, handle);
  const theme = await resolveTheme(prisma, store, themeId);
  // Storefront pages load their CSS, JS and images from the store's own
  // address (the storefront app proxies them); null = straight from the
  // API, for the admin's editor preview.
  const assetBase = assetBaseOverride != null ? assetBaseOverride : localAssets ? (rootless ? "" : `/store/${store.handle}`) : null;
  const themeSettings = settingsOverride ?? theme.settingsData ?? {};
  const system = platform.isSystemTemplate(templateName);

  // Master theme files fill in anything this store's copy lacks (see
  // masterFiles); then the store's own files; then, for the code editor's
  // live preview, unsaved edits over the top. Platform pages (everything
  // but the home page) always use Oyklane's own templates on top of that —
  // a theme can style them but not replace them.
  const master = await masterFiles(theme.handle);
  // App sections (Instagram feed, Google reviews) can sit on any page.
  let filesByPath = { ...master, ...upgradePristine(filesArrayToMap(theme.files), master), ...(await platform.appSectionFiles()), ...(filesOverride || {}) };
  // The store's own files, before the platform's replace them: its
  // arrangements of arrangeable pages are read from here (see below).
  const storeFiles = filesByPath;
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
  const routes = globalContext.routes;
  // The store's published policies (Settings ▸ Policies) — linked in every
  // footer through `powered_by`, which every theme prints, so no theme
  // needs changing; `shop.policies` lets a theme list them its own way.
  const policies = (await pagePolicies.published(prisma, store.id)).map((p) => ({ title: esc(p.title), url: `${routes.pages_url}/${p.slug}` }));
  globalContext.shop.policies = policies;
  // Phone Login app on: shoppers sign in by phone only (no passwords).
  globalContext.shop.phone_login = Boolean(globalContext.apps?.["phone-login"]);
  const policyLinks = policies.map((p) => `<a href="${p.url}" style="color:inherit;text-decoration:underline;text-underline-offset:3px;white-space:nowrap">${p.title}</a>`).join(" · ");
  // The platform credit every store carries (see POWERED_BY below).
  globalContext.powered_by = policyLinks ? `<span class="oy-policies">${policyLinks}</span> · ${POWERED_BY}` : POWERED_BY;
  globalContext.form_error = safe(formError);
  globalContext.notice = safe(notice);

  if (templateName === "product") {
    if (!slug) throw new HttpError(400, "Missing product slug");
    const found = globalContext.all_products[slug];
    if (!found) throw new HttpError(404, `Product not found: ${slug}`);
    const collection = primaryCollection(globalContext, found);
    const selected = found.variants.find((v) => v.id === variant) || found.variants.find((v) => v.available) || found.variants[0] || null;
    const fieldDefs = await metafieldService.list(prisma, store.id, "product");
    const reviewData = globalContext.reviews_app ? await reviewsService.forProduct(prisma, store.id, found.id) : null;
    // Rentals app: the booking calendar's rules and booked days.
    const rental = found.rental
      ? await rentalsService.productContext(prisma, store, found, await prisma.rentalProduct.findUnique({ where: { productId: found.id } }), globalContext.apps?.[rentalsService.APP_KEY], routes)
      : null;
    globalContext.product = {
      ...found,
      rental,
      // Product Reviews app: the summary, published reviews and the form.
      reviews: reviewData && {
        ...reviewData,
        form_url: `${found.url}/reviews`,
        buyers_only: globalContext.reviews_app.whoCanReview === "buyers",
      },
      // Custom data the seller marked "show on the product page".
      specs: metafieldService.specs(fieldDefs, found.metafields.custom),
      collection: collection && { title: collection.title, slug: collection.slug, url: collection.url },
      selected_variant: selected,
      options: variantOptions(found, selected),
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
    const { list, listing } = applyListing(found.products, { ...filters, sort, in_stock: inStock }, { baseUrl: found.url, bestSellers: globalContext.best_sellers });
    globalContext.collection = { ...found, products: list, products_count: list.length };
    globalContext.listing = listing;
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
    // Which fields the form asks for — Settings ▸ Checkout.
    globalContext.checkout_fields = storeSettings(store).checkout;
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
    withItemPhotos(globalContext, [globalContext.order]);
  }
  if (templateName === "account-login") {
    const phoneLogin = await shopperPhone.config(prisma, store);
    const PHONE_STEPS = ["phone", "phone-code", "phone-profile", "phone-email-code"];
    // With the Phone Login app on, shoppers sign in by phone — no password
    // or Google options (the app's whole point). An emailed code stays as the
    // fallback for when a phone code can't be sent.
    const mode = phoneLogin.enabled ? (loginMode === "code" ? "code" : "phone") : ["register", "code"].includes(loginMode) ? loginMode : "password";
    globalContext.login = {
      step: mode === "phone" ? (PHONE_STEPS.includes(loginStep) ? loginStep : "phone") : loginStep === "code" ? "code" : "email",
      mode,
      email: safe(loginEmail) || "",
      phone: safe(loginPhone) || "",
      return_to: returnTo || null,
      phone_enabled: phoneLogin.enabled,
      phone_only: phoneLogin.enabled,
      phone_channels: phoneLogin.channels,
      google_enabled: googleOAuth.configured(),
    };
  }
  if (templateName === "account") globalContext.indian_states = INDIAN_STATES.map((s) => s.name);
  if (templateName === "account" && customer) {
    // Until the email is verified by a code, only orders placed while
    // signed in: anyone can type an address at sign-up. A mobile number
    // confirmed with a code (phone sign-in, One-Click) also brings in the
    // orders placed with that number.
    const byEmail = customer.emailVerifiedAt ? [{ customerId: customer.id }, { email: { equals: customer.email, mode: "insensitive" } }] : [{ customerId: customer.id, placedSignedIn: true }];
    const last10 = customer.phoneVerifiedAt ? String(customer.phone || "").replace(/\D/g, "").slice(-10) : "";
    const byPhone = last10.length === 10
      ? (await prisma.$queryRaw`SELECT "id" FROM orders WHERE "storeId" = ${store.id} AND right(regexp_replace(coalesce("phone", ''), '\\D', '', 'g'), 10) = ${last10} LIMIT 200`).map((r) => r.id)
      : [];
    const orders = await prisma.order.findMany({
      where: { storeId: store.id, ...PLACED, OR: [...byEmail, ...(byPhone.length ? [{ id: { in: byPhone } }] : [])] },
      include: FULL_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const list = [];
    for (const o of orders) {
      const token = await ensureStatusToken(prisma, o);
      list.push(publicOrder(store, o, { statusUrl: `${routes.orders_url}/${token}` }));
    }
    withItemPhotos(globalContext, list);
    globalContext.customer.orders = list;
    globalContext.customer.orders_count = list.length;
    globalContext.customer.open_orders = list.filter((o) => !["delivered", "cancelled", "refunded"].includes(o.status.key)).length;
    globalContext.customer.initials = String(customer.name || customer.email || "?")
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("");
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
    const { list: results, listing } = applyListing(matches, { ...filters, sort, in_stock: inStock }, {
      baseUrl: routes.search_url,
      keep: { q: searchQuery?.trim() || "" },
      bestSellers: globalContext.best_sellers,
    });
    globalContext.search = { query: safe(searchQuery?.trim()) || "", results, result_count: results.length };
    globalContext.listing = listing;
    // Older theme copies render search through sections/product-grid.liquid,
    // which reads `collection.products`.
    globalContext.collection = {
      id: "search",
      title: q ? `Search results for "${esc(searchQuery.trim())}"` : "Search",
      slug: "search",
      products: results,
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

  // The store's own arrangement of this page (theme editor), if it has one
  // and it's still valid: the item's own template (product.rental), else
  // the page's default one. A rental product without a template of its
  // own uses the Rentals app's.
  if (system && platform.isArrangeable(templateName)) {
    const item = templateName === "product" ? globalContext.product : templateName === "collection" ? globalContext.collection : globalContext.page;
    const suffix = parts.suffix || item?.template_suffix || item?.templateSuffix || (item?.rental ? "rental" : null);
    const { renderFiles } = await platform.load();
    const appMade = new Set(platform.appTemplates(globalContext.apps).map((t) => `templates/${t.kind}.${t.suffix}.json`));
    const altPath = suffix ? `templates/${templateName}.${suffix}.json` : null;
    const source =
      templateOverride ??
      (altPath && (storeFiles[altPath] ?? (appMade.has(altPath) ? renderFiles[altPath] : undefined))) ??
      storeFiles[`templates/${templateName}.json`];
    const arranged = platform.sanitizeArrangement(templateName, source);
    if (arranged) filesByPath[`templates/${templateName}.json`] = arranged;
  }

  const seo = buildSeo(store, templateName, globalContext);
  globalContext.page_title = seo.title;
  // Rendering for the theme editor: sections may show setup hints that
  // shoppers never see.
  globalContext.design_mode = templateOverride != null || settingsOverride != null || filesOverride != null || assetBaseOverride != null;

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
  // The cart drawer (the theme's "Cart type"), and the One-Click popup —
  // which runs from the same script on every page but checkout, so a
  // store whose theme uses the full cart page still gets the popup
  // (drawerOff: only its checkout links are taken over).
  const drawerOn = platform.cartDrawerOn(themeSettings, templateName);
  const oneClick = templateName !== "checkout" ? oneClickConfig(globalContext, customer, store) : null;
  const drawer = drawerOn || oneClick
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
        oneClick,
        drawerOff: !drawerOn,
      }
    : null;
  const login = loginPopupConfig(globalContext, customer, store, routes, templateName);
  const head = `${await platform.headTags(themeSettings, { system, drawer, login, assetBase })}${seoTags(seo)}${verificationTags(store)}`;
  html = html.includes("</head>") ? html.replace("</head>", `${head}</head>`) : head + html;

  // Facebook Pixel / Google Analytics and their shopping events — on every
  // page, never in the theme editor's preview (it would count as visits).
  const editorPreview = templateOverride != null || settingsOverride != null || filesOverride != null || assetBaseOverride != null;
  if (!editorPreview) {
    const tracking = trackingTags({ apps: globalContext.apps, templateName, ctx: globalContext, currency: store.currency, html });
    if (tracking) html = html.includes("</head>") ? html.replace("</head>", `${tracking}</head>`) : tracking + html;
  }

  // CSS is fetched by the browser via a separate <link> GET to the asset
  // endpoint, which always serves the *saved* file — an unsaved CSS edit
  // has no other way to reach the preview, so inline it where it cascades
  // over the (stale) linked stylesheet. JS isn't given the same treatment:
  // unlike CSS, two versions of a script can't simply "layer" over each
  // other, so unsaved JS previews only after Save — a limitation, not a bug.
  if (filesOverride?.["assets/theme.css"]) {
    html = html.replace("</head>", `<style>${filesOverride["assets/theme.css"]}</style></head>`);
  }

  let tail = await platform.bodyTags({ system, drawer, login, assetBase });
  if (templateName === "checkout") tail += checkoutEnhancements(routes, customer);
  if (tail) html = html.includes("</body>") ? html.replace("</body>", `${tail}</body>`) : html + tail;

  // Every store shows "Powered by Oyklane.com". Themes print it after
  // their copyright line; if a theme's code drops it, the platform adds it
  // at the bottom of the page instead. Inline !important keeps a stylesheet
  // from hiding it.
  if (!html.includes(POWERED_BY)) {
    const bar = `<div style="text-align:center!important;padding:14px 16px!important;font:13px/1.5 system-ui,-apple-system,sans-serif!important;display:block!important;visibility:visible!important;opacity:1!important">${POWERED_BY}</div>`;
    html = html.includes("</body>") ? html.replace("</body>", `${bar}</body>`) : html + bar;
  }

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

/**
 * One product for the quick-add panel on product cards: photos, prices,
 * option pickers and every variant's stock. Active products only.
 */
async function quickProduct(prisma, handle, slug) {
  const store = await loadStoreOrThrow(prisma, handle);
  const product = await repository.getProductBySlug(prisma, store.id, String(slug || ""));
  if (!product) throw new HttpError(404, "Product not found");
  const p = serializeProduct(product, store.handle);
  const selected = p.variants.find((v) => v.available) || p.variants[0] || null;
  return {
    currency: store.currency,
    lowStock: storeSettings(store).lowStockThreshold,
    product: {
      id: p.id,
      title: p.title,
      handle: p.handle,
      brand: p.brand,
      images: p.images.slice(0, 8),
      price: p.price,
      compare_at_price: p.compare_at_price,
      price_varies: p.price_varies,
      available: p.available,
      // Rentals app: dates are picked on the product page, not in quick add.
      rental: Boolean(product.rental?.enabled),
      selected_variant_id: selected?.id || null,
      options: variantOptions(p, selected),
      variants: p.variants.map((v) => ({ id: v.id, title: v.title, price: v.price, comparePrice: v.comparePrice, available: v.available, inventoryQuantity: v.inventoryQuantity })),
    },
  };
}

module.exports = { loadStoreOrThrow, resolveTheme, buildGlobalContext, renderPage, getAsset, resolveDomain, quickProduct };

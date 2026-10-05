#!/usr/bin/env node
/**
 * End-to-end test of the 2 Oct round, against a real API:
 *
 *   Templates: extra product / page / collection templates (create,
 *   arrange, assign, preview, delete), app-made "Rental product" template
 *   Rentals app: product rules, booking calendar on the page, cart lines
 *   priced by dates, rules checked (notice, shortest, booked, buffer,
 *   pieces), checkout books it (stock untouched), cancel frees it, the
 *   seller's board (hand over, return, late fee, deposit), manual
 *   bookings and blocks, request mode with emails, calendar, cards
 *   Connected accounts: one Google and one Facebook sign-in per store,
 *   shared by every app (asked once for every app's access, tokens
 *   encrypted, never sent to the browser) · Instagram through the store's
 *   Facebook login (pick the account, Page token) · Google reviews through
 *   the store's Google account (pick the business, all reviews)
 *   Sales channels: product feeds (Google XML, Meta CSV) with exclusions
 *   and a private token · Google Merchant Center (pick the account; data
 *   source, fetch, status, website) · Meta catalog (pick or create the
 *   catalog, hourly feed, status) · domain verification tags
 *   Oyklane account: a shopper signed in at one store is signed in at
 *   another (existing account on any page; a new one only on a click to
 *   account/checkout), only proven details travel
 *   Theme editor preview still renders
 *
 *   node apps/api/test/e2e-rentals-channels.js
 *
 * Creates throwaway stores and deletes them when done, pass or fail.
 * Nothing real is contacted: email is "log"; Facebook and Google are a
 * local mock. Catalog rows for the new apps are added only if missing and
 * removed again.
 */
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "../../..");
require(path.join(ROOT, "apps/api/node_modules/dotenv")).config({ path: path.join(ROOT, ".env") });
Object.assign(process.env, { SMTP_HOST: "", EMAIL_PROVIDER: "log", SMS_PROVIDER: "log", WHATSAPP_PROVIDER: "log", MEDIA_STORAGE: "database" });

const API_PORT = 4194;
const API = `http://localhost:${API_PORT}`;
const MOCK_PORT = 4294;
const MOCK = `http://localhost:${MOCK_PORT}`;
const ORIGIN = process.env.ADMIN_ORIGIN || "http://localhost:3000";

function dbUrl(limit) {
  const u = new URL(process.env.DATABASE_URL);
  if (/pooler\.supabase\.com$/.test(u.hostname) && u.port === "5432") {
    u.port = "6543";
    u.searchParams.set("pgbouncer", "true");
  }
  u.searchParams.set("connection_limit", String(limit));
  u.searchParams.set("connect_timeout", "30");
  u.searchParams.set("pool_timeout", "30");
  return u.toString();
}
const API_DATABASE_URL = dbUrl(4);
process.env.DATABASE_URL = dbUrl(2);

let pass = 0;
let fail = 0;
function check(label, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${label}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${label}${detail !== undefined ? `  -- ${typeof detail === "string" ? detail.slice(0, 700) : JSON.stringify(detail).slice(0, 700)}` : ""}`);
  }
}

function client() {
  const jar = {};
  return async function call(method, url, body) {
    const res = await fetch(`${API}${url}`, {
      method,
      headers: {
        ...(body !== undefined && { "content-type": "application/json" }),
        ...(method !== "GET" && { origin: ORIGIN }),
        cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; "),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie?.() || []) {
      const [pair] = c.split(";");
      const [k, ...v] = pair.split("=");
      jar[k.trim()] = v.join("=");
    }
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, data, headers: res.headers };
  };
}

async function sf(method, url, body) {
  const res = await fetch(`${API}${url}`, { method, headers: body !== undefined ? { "content-type": "application/json" } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text), headers: res.headers };
  } catch {
    return { status: res.status, data: text, headers: res.headers };
  }
}

/** Facebook Graph and Google APIs, as far as these features use them. */
function startMock() {
  const calls = { fb: [], google: [] };
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      const url = new URL(req.url, MOCK);
      const json = (status, obj) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      const form = Object.fromEntries(new URLSearchParams(raw));
      let body = {};
      try {
        body = raw && req.headers["content-type"]?.includes("json") ? JSON.parse(raw) : {};
      } catch {}

      // ── Facebook Graph ──
      if (url.pathname.startsWith("/fb/")) {
        const p = url.pathname.replace(/^\/fb\/v21\.0/, "");
        const token = url.searchParams.get("access_token") || form.access_token;
        calls.fb.push({ method: req.method, path: p, token, form, query: Object.fromEntries(url.searchParams) });
        if (p === "/oauth/access_token") {
          if (url.searchParams.get("fb_exchange_token")) return json(200, { access_token: `LONG_${url.searchParams.get("fb_exchange_token")}`, expires_in: 5184000 });
          return json(200, { access_token: `SHORT_${url.searchParams.get("code")}` });
        }
        if (p === "/me") return json(200, { id: "fbuser1", name: "Loom Seller" });
        if (p === "/me/permissions") {
          const all = ["business_management", "pages_show_list", "pages_read_engagement", "instagram_basic", "catalog_management", "ads_read", "ads_management", "whatsapp_business_management", "whatsapp_business_messaging"];
          return json(200, { data: all.filter((x) => !(/NOIG/.test(token) && x === "instagram_basic")).map((permission) => ({ permission, status: "granted" })) });
        }
        if (p === "/me/accounts") {
          const two = /TWO/.test(token);
          const none = /NOPAGE/.test(token);
          return json(200, {
            data: none
              ? [{ id: "page0", name: "No IG Page", access_token: "PAGE_TOKEN_0" }]
              : [
                  { id: "page1", name: "Loomwear Page", access_token: "PAGE_TOKEN_1", instagram_business_account: { id: "ig1", username: "loomwear.fb", profile_picture_url: "https://cdn.example.com/p1.jpg" } },
                  ...(two ? [{ id: "page2", name: "Loomwear Bridal", access_token: "PAGE_TOKEN_2", instagram_business_account: { id: "ig2", username: "loomwear.bridal" } }] : []),
                ],
          });
        }
        if (/^\/ig[12]$/.test(p)) {
          if (!/^PAGE_TOKEN_/.test(token || "")) return json(400, { error: { message: "bad token", code: 190 } });
          return json(200, { id: p.slice(1), username: p === "/ig2" ? "loomwear.bridal" : "loomwear.fb", name: "Loomwear", followers_count: 900, media_count: 2 });
        }
        if (/^\/ig[12]\/media$/.test(p)) return json(200, { data: [{ id: "m1", caption: "Bridal <b>edit</b>", media_type: "IMAGE", media_url: "https://cdn.example.com/m1.jpg", permalink: "https://www.instagram.com/p/M1/", like_count: 7 }] });
        if (p === "/me/businesses") return json(200, { data: [{ id: "b1", name: "Loomwear Biz" }] });
        if (p === "/b1/owned_product_catalogs" && req.method === "GET") return json(200, { data: [{ id: "c1", name: "Main catalogue", product_count: 12 }] });
        if (p === "/b1/owned_product_catalogs" && req.method === "POST") return json(200, { id: "c9" });
        if (p === "/c9/product_feeds" && req.method === "GET") return json(200, { data: [] });
        if (p === "/c9/product_feeds" && req.method === "POST") return json(200, { id: "f1" });
        if (p === "/f1/uploads" && req.method === "POST") return json(200, { id: "u1" });
        if (p === "/f1/uploads" && req.method === "GET") return json(200, { data: [{ id: "u1", start_time: "2026-10-02T05:00:00+0000", end_time: "2026-10-02T05:01:00+0000", num_detected_items: 4, num_persisted_items: 4, num_invalid_items: 0, error_count: 0, warning_count: 1 }] });
        return json(404, { error: { message: `unknown ${p}` } });
      }

      // ── Google OAuth token endpoint ──
      if (url.pathname === "/google/token") {
        calls.google.push({ path: "token", form });
        if (form.client_id !== "test-google-client" || form.client_secret !== "test-google-secret") return json(401, { error: "invalid_client" });
        if (form.grant_type === "refresh_token") return json(200, { access_token: `AT_REFRESHED_${form.refresh_token}`, expires_in: 3600 });
        const code = form.code;
        const reviews = "https://www.googleapis.com/auth/business.manage";
        const content = "https://www.googleapis.com/auth/content";
        const scope = code.startsWith("ALL") ? `openid email ${reviews} ${content}` : code === "REVIEWS" || code === "REVIEWS_ONE" ? `openid email ${reviews}` : "openid email";
        const idToken = `h.${Buffer.from(JSON.stringify({ email: "seller@loomwear.in", name: "Loom Seller" })).toString("base64url")}.s`;
        return json(200, { access_token: `AT_${code}`, refresh_token: `RT_${code}`, expires_in: 3600, scope, id_token: idToken });
      }

      // ── Google APIs (GOOGLE_API_BASE/<host>/<path>) ──
      if (url.pathname.startsWith("/gapi/")) {
        const [, , host, ...rest] = url.pathname.split("/");
        const p = `/${rest.join("/")}`;
        const auth = req.headers.authorization || "";
        calls.google.push({ host, path: p, method: req.method, auth, body, query: Object.fromEntries(url.searchParams) });
        if (host === "oauth2.googleapis.com" && p === "/revoke") return json(200, {});
        if (!/^Bearer AT_/.test(auth)) return json(401, { error: { message: "Request had invalid authentication credentials." } });
        if (host === "mybusinessaccountmanagement.googleapis.com" && p === "/v1/accounts") return json(200, { accounts: [{ name: "accounts/111", accountName: "Loomwear" }] });
        if (host === "mybusinessbusinessinformation.googleapis.com" && p === "/v1/accounts/111/locations") {
          const one = /REVIEWS_ONE/.test(auth);
          return json(200, {
            locations: [
              { name: "locations/222", title: "Loomwear Studio", storefrontAddress: { addressLines: ["12 MG Road"], locality: "Pune" }, metadata: { placeId: "ChIJplace222", mapsUri: "https://maps.google.com/?cid=222", newReviewUri: "https://g.page/r/loomwear/review" } },
              ...(one ? [] : [{ name: "locations/333", title: "Loomwear Bridal", storefrontAddress: { addressLines: ["4 FC Road"], locality: "Pune" }, metadata: { placeId: "ChIJplace333" } }]),
            ],
          });
        }
        if (host === "mybusiness.googleapis.com" && p === "/v4/accounts/111/locations/222/reviews") {
          if (!url.searchParams.get("pageToken"))
            return json(200, {
              averageRating: 4.7,
              totalReviewCount: 152,
              nextPageToken: "PAGE2",
              reviews: [
                { reviewId: "r1", reviewer: { displayName: "Kavya R", profilePhotoUrl: "https://lh3.example.com/k.jpg" }, starRating: "FIVE", comment: "Beautiful <i>lehenga</i>", createTime: "2026-09-01T10:00:00Z", updateTime: "2026-09-01T10:00:00Z" },
                { reviewId: "r2", reviewer: { displayName: "Arjun", isAnonymous: true }, starRating: "TWO", comment: "Late delivery", createTime: "2026-08-01T10:00:00Z" },
              ],
            });
          return json(200, { reviews: [{ reviewId: "r3", reviewer: { displayName: "Priya M" }, starRating: "FOUR", comment: "(Translated by Google) Very good\n\n(Original)\nबहुत अच्छा", createTime: "2026-07-01T10:00:00Z" }] });
        }
        // Merchant API
        if (host === "merchantapi.googleapis.com") {
          if (p === "/accounts/v1/accounts") return json(200, { accounts: [{ name: "accounts/999", accountId: "999", accountName: "Loomwear MC" }] });
          if (p === "/datasources/v1/accounts/999/dataSources" && req.method === "GET") return json(200, { dataSources: [] });
          if (p === "/datasources/v1/accounts/999/dataSources" && req.method === "POST") return json(200, { name: "accounts/999/dataSources/555", ...body });
          if (p === "/datasources/v1/accounts/999/dataSources/555:fetch") return json(200, {});
          if (p === "/datasources/v1/accounts/999/dataSources/555/fileUploads/latest")
            return json(200, { processingState: "SUCCEEDED", itemsTotal: "3", itemsCreated: "3", uploadTime: "2026-10-02T04:00:00Z", issues: [{ title: "Missing GTIN", description: "Optional for your own brand", count: "2", severity: "WARNING" }] });
          if (p === "/accounts/v1/accounts/999/homepage") return json(200, { uri: body.uri });
          if (p === "/accounts/v1/accounts/999/homepage:claim") return json(400, { error: { message: "The website isn't verified yet." } });
        }
        return json(404, { error: { message: `unknown ${host}${p}` } });
      }
      json(404, {});
    });
  });
  return new Promise((resolve) => server.listen(MOCK_PORT, () => resolve({ server, calls })));
}

async function startApi() {
  const child = spawn(process.execPath, [path.join(ROOT, "apps/api/src/server.js")], {
    cwd: path.join(ROOT, "apps/api"),
    env: {
      ...process.env,
      DATABASE_URL: API_DATABASE_URL,
      API_PORT: String(API_PORT),
      NODE_ENV: "test",
      JOBS_DISABLED: "true",
      SEED_PREVIEW_APPS: "",
      META_APP_ID: "test-meta-app",
      META_APP_SECRET: "test-meta-secret",
      META_GRAPH_API_URL: `${MOCK}/fb`,
      META_GRAPH_API_VERSION: "v21.0",
      INSTAGRAM_APP_ID: "",
      INSTAGRAM_APP_SECRET: "",
      GOOGLE_CLIENT_ID: "test-google-client",
      GOOGLE_CLIENT_SECRET: "test-google-secret",
      GOOGLE_OAUTH_URL: `${MOCK}/google/auth`,
      GOOGLE_TOKEN_URL: `${MOCK}/google/token`,
      GOOGLE_API_BASE: `${MOCK}/gapi`,
      GOOGLE_PLACES_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`${API}/health`);
      if (r.ok) return { child, log: () => log };
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error(`API did not start:\n${log}`);
}

const SHIP = { shippingAddress1: "12 MG Road", shippingCity: "Pune", shippingProvince: "MH", shippingZip: "411001", shippingCountry: "IN" };
const todayIndia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const plus = (day, n) => new Date(new Date(`${day}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

const NEW_APPS = [
  { key: "rentals", name: "Rentals", category: "selling", iconKey: "calendar" },
  { key: "google-shopping", name: "Google & YouTube", category: "sales_channel", iconKey: "store" },
  { key: "facebook-shop", name: "Facebook & Instagram", category: "sales_channel", iconKey: "store" },
  { key: "instagram-feed", name: "Instagram Feed", category: "marketing", iconKey: "megaphone" },
  { key: "google-reviews", name: "Google Reviews", category: "marketing", iconKey: "star" },
];

async function main() {
  const mock = await startMock();
  const api = await startApi();
  const { PrismaClient } = require(path.join(ROOT, "packages/database/node_modules/@prisma/client"));
  const prisma = new PrismaClient();
  const { decryptSecret } = require(path.join(ROOT, "apps/api/src/lib/crypto"));
  const stamp = Date.now();
  const created = [];
  const appRowsAdded = [];
  const owner = client();
  const other = client();
  const today = todayIndia();

  try {
    for (const def of NEW_APPS) {
      if (!(await prisma.app.findUnique({ where: { key: def.key } }))) {
        await prisma.app.create({ data: { ...def, description: "test", settingsSchema: [] } });
        appRowsAdded.push(def.key);
      }
    }

    const ownerEmail = `rent-e2e-${stamp}@test.oyklane.dev`;
    let r = await owner("POST", "/api/auth/register", { name: "Rent Tester", email: ownerEmail, password: "correct-horse-battery", storeName: `Rent E2E ${stamp}`, plan: "growth" });
    check("register store A", r.status === 201, r.data);
    const store = r.data.store;
    created.push({ storeId: store.id, emails: [ownerEmail] });
    const H = store.handle;
    const otherEmail = `rent-e2e-b-${stamp}@test.oyklane.dev`;
    r = await other("POST", "/api/auth/register", { name: "Other", email: otherEmail, password: "correct-horse-battery", storeName: `Rent B ${stamp}`, plan: "growth" });
    const storeB = r.data.store;
    created.push({ storeId: storeB.id, emails: [otherEmail] });

    r = await owner("GET", "/api/themes");
    const theme = r.data.themes.find((t) => t.isActive);
    check("store has an active theme", Boolean(theme), r.data);

    // ══ Templates ════════════════════════════════════════════════════
    r = await owner("GET", "/api/themes/templates");
    check("no extra templates yet", r.status === 200 && r.data.themeId === theme.id && r.data.product.length === 0 && r.data.page.length === 0, r.data);
    r = await owner("POST", `/api/themes/${theme.id}/templates`, { kind: "product", name: "Size guide!" });
    check("create a product template (name made safe)", r.status === 201 && r.data.template.suffix === "size-guide" && r.data.template.label === "Size guide", r.data);
    const tpl = r.data.template.content;
    check("…starting from the default layout", tpl.sections.main?.type === "sys-product" && tpl.order.includes("main"), tpl);
    r = await owner("POST", `/api/themes/${theme.id}/templates`, { kind: "product", name: "size guide" });
    check("the same name twice is refused", r.status === 409, r.data);
    r = await owner("POST", `/api/themes/${theme.id}/templates`, { kind: "product", name: "Default" });
    check("“Default” is reserved", r.status === 400, r.data);

    // Arrange it: a text block on the product, a rich text section under it.
    tpl.sections.main.blocks = { t: { type: "title", settings: {} }, p: { type: "price", settings: {} }, note: { type: "text", settings: { text: "SIZEGUIDE-MARKER chest 40 in", style: "highlight", icon: "gift" } }, buy: { type: "buy_buttons", settings: { show_quantity: true } } };
    tpl.sections.main.block_order = ["t", "p", "note", "buy"];
    tpl.sections.guide = { type: "rich-text", settings: { heading: "SIZE-CHART-SECTION", text: "Measure twice" } };
    tpl.order = ["main", "guide"];
    r = await owner("PATCH", `/api/themes/${theme.id}/files`, { path: "templates/product.size-guide.json", content: JSON.stringify(tpl) });
    check("save the template's layout (every plan: it's JSON)", r.status === 200, r.data);

    r = await owner("POST", "/api/products", { title: "Plain Kurta", status: "active", variants: [{ title: "Default", price: 900, inventoryQuantity: 5 }], images: [{ url: "https://cdn.example.com/k.jpg" }], description: "A plain cotton kurta for every day, breathable and soft." });
    const plain = r.data.product;
    r = await owner("POST", "/api/products", { title: "Fitted Kurta", status: "active", templateSuffix: "size-guide", variants: [{ title: "Default", price: 1200, inventoryQuantity: 5 }], images: [{ url: "https://cdn.example.com/f.jpg" }] });
    check("a product can use the template", r.status === 201 && r.data.product.templateSuffix === "size-guide", r.data);
    const fitted = r.data.product;
    r = await owner("POST", "/api/products", { title: "Bad", status: "draft", templateSuffix: "Bad Name!", variants: [{ title: "Default", price: 1 }] });
    check("template names are checked", r.status === 400, r.data);

    r = await sf("GET", `/api/storefront/${H}/render/product?slug=${fitted.slug}`);
    check("its page uses the template: the block and the theme section", typeof r.data === "string" && r.data.includes("SIZEGUIDE-MARKER") && r.data.includes("SIZE-CHART-SECTION"), typeof r.data === "string" ? "" : r.data);
    r = await sf("GET", `/api/storefront/${H}/render/product?slug=${plain.slug}`);
    check("other products keep the default page", typeof r.data === "string" && !r.data.includes("SIZEGUIDE-MARKER") && r.data.includes("data-sys-add"), "");
    r = await owner("POST", `/api/themes/${theme.id}/render-draft`, { template: "product.size-guide", slug: plain.slug, templateOverride: tpl });
    check("the editor previews the template with any product", r.status === 200 && r.data.html.includes("SIZEGUIDE-MARKER"), r.data?.error);
    r = await owner("POST", `/api/themes/${theme.id}/render-draft`, { template: "product.Bad!", slug: plain.slug });
    check("…and refuses unknown template names", r.status === 400, r.data);

    // Pages
    r = await owner("POST", `/api/themes/${theme.id}/templates`, { kind: "page", name: "Landing" });
    const pageTpl = r.data.template.content;
    check("a page template", r.status === 201 && pageTpl.sections.main?.type === "sys-page", r.data);
    pageTpl.sections.main.settings = { hide_title: true, width: "wide" };
    pageTpl.sections.hero = { type: "rich-text", settings: { heading: "LANDING-HERO", text: "Hi" } };
    pageTpl.order = ["hero", "main"];
    await owner("PATCH", `/api/themes/${theme.id}/files`, { path: "templates/page.landing.json", content: JSON.stringify(pageTpl) });
    r = await owner("POST", "/api/pages", { title: "Festive Story", body: "PAGE-BODY-TEXT", status: "active", templateSuffix: "landing" });
    check("a page can use it", r.status === 201 && r.data.page.templateSuffix === "landing", r.data);
    const landing = r.data.page;
    r = await owner("POST", "/api/pages", { title: "About Us", body: "About text", status: "active" });
    const about = r.data.page;
    r = await sf("GET", `/api/storefront/${H}/render/page?slug=${landing.slug}`);
    check("the page shows the section above its text and hides the title", r.data.includes("LANDING-HERO") && r.data.includes("PAGE-BODY-TEXT") && r.data.indexOf("LANDING-HERO") < r.data.lastIndexOf("PAGE-BODY-TEXT") && !r.data.includes(">Festive Story</h1>"), "");
    r = await sf("GET", `/api/storefront/${H}/render/page?slug=${about.slug}`);
    check("other pages are unchanged", !r.data.includes("LANDING-HERO") && r.data.includes(">About Us</h1>"), "");
    // "Used by" in the editor: move About Us onto the Landing layout…
    r = await owner("POST", "/api/themes/templates/assign", { kind: "page", name: "page.landing", ids: [landing.id, about.id] });
    check("assign a layout to pages from the editor", r.status === 200 && r.data.usage["page.landing"] === 2, r.data);
    r = await sf("GET", `/api/storefront/${H}/render/page?slug=${about.slug}`);
    check("…the page shows that layout on the store", r.data.includes("LANDING-HERO") && r.data.includes("About text"), "");
    // …untick it: back to the default layout.
    r = await owner("POST", "/api/themes/templates/assign", { kind: "page", name: "page.landing", ids: [landing.id] });
    check("…untick it: back to the default", r.data.usage["page.landing"] === 1 && (await prisma.page.findUnique({ where: { id: about.id } })).templateSuffix === null, r.data);
    r = await owner("POST", "/api/themes/templates/assign", { kind: "product", name: "page.landing", ids: [] });
    check("a layout can't be given to the wrong kind", r.status === 400, r.data);
    r = await other("POST", "/api/themes/templates/assign", { kind: "page", name: "page.landing", ids: [about.id] });
    check("another store can't move this store's pages", (await prisma.page.findUnique({ where: { id: about.id } })).templateSuffix === null, r.status);
    r = await owner("POST", `/api/themes/${theme.id}/templates`, { kind: "page", name: "Story", assign: [about.id] });
    check("create a layout and use it for a page in one go", r.status === 201 && r.data.usage["page.story"] === 1 && (await prisma.page.findUnique({ where: { id: about.id } })).templateSuffix === "story", r.data);
    await owner("POST", "/api/themes/templates/assign", { kind: "page", name: "page", ids: [about.id] });

    // Collections
    r = await owner("POST", `/api/themes/${theme.id}/templates`, { kind: "collection", name: "Bridal" });
    const colTpl = r.data.template.content;
    colTpl.sections.banner = { type: "rich-text", settings: { heading: "BRIDAL-BANNER", text: "x" } };
    colTpl.order = ["banner", "main"];
    await owner("PATCH", `/api/themes/${theme.id}/files`, { path: "templates/collection.bridal.json", content: JSON.stringify(colTpl) });
    r = await owner("POST", "/api/collections", { title: "Bridal Edit", status: "active", productIds: [plain.id], templateSuffix: "bridal" });
    const bridal = r.data.collection;
    r = await sf("GET", `/api/storefront/${H}/render/collection?slug=${bridal.slug}`);
    check("a collection with its own template", r.data.includes("BRIDAL-BANNER") && r.data.includes("Plain Kurta"), "");

    r = await owner("GET", "/api/themes/templates");
    check("the forms list the theme's templates", r.data.product.some((t) => t.suffix === "size-guide") && r.data.page.some((t) => t.suffix === "landing") && r.data.collection.some((t) => t.suffix === "bridal"), r.data);
    r = await owner("GET", `/api/themes/${theme.id}`);
    check("the editor gets the templates and how many items use each", r.data.templates.product.some((t) => t.name === "product.size-guide") && r.data.templateUsage["product.size-guide"] === 1 && r.data.templateUsage["page.landing"] === 1, { t: r.data.templates, u: r.data.templateUsage });
    r = await owner("DELETE", `/api/themes/${theme.id}/templates/product.size-guide`);
    check("delete a template", r.status === 200, r.data);
    r = await sf("GET", `/api/storefront/${H}/render/product?slug=${fitted.slug}`);
    check("…its products fall back to the default page", !r.data.includes("SIZEGUIDE-MARKER") && r.data.includes("data-sys-add"), "");

    // ══ Rentals ══════════════════════════════════════════════════════
    r = await owner("GET", "/api/rentals/overview");
    check("Rentals needs the app", r.status === 402, r.data);
    r = await owner("POST", "/api/apps/rentals/install", { settings: {} });
    check("install Rentals", r.status === 200 || r.status === 201, r.data);
    r = await owner("GET", "/api/themes/templates");
    check("Rentals brings a “Rental product” template", r.data.product.some((t) => t.suffix === "rental" && t.source === "app" && t.label === "Rental product"), r.data.product);

    r = await owner("POST", "/api/products", {
      title: "Silk Lehenga",
      status: "active",
      description: "Hand-embroidered silk lehenga for weddings.",
      variants: [
        { title: "S", price: 0, inventoryQuantity: 0 },
        { title: "M", price: 0, inventoryQuantity: 0 },
      ],
      images: [{ url: "https://cdn.example.com/lehenga.jpg" }],
    });
    check("a product with price 0 (it's rented, not sold)", r.status === 201, r.data);
    const lehenga = r.data.product;
    const [vS, vM] = lehenga.variants;
    r = await owner("PUT", `/api/rentals/products/${lehenga.id}`, { pricePerDay: 1000, tiers: [{ days: 3, price: 1200 }] });
    check("a longer-rental rate must be lower", r.status === 400, r.data);
    r = await owner("PUT", `/api/rentals/products/${lehenga.id}`, { pricePerDay: 1000, tiers: [{ days: 3, price: 800 }], deposit: 2000, units: 1, bufferDays: 1, leadDays: 2, minDays: 2, maxDays: 10 });
    check("set the rent: ₹1000/day, ₹800 from 3 days, ₹2000 deposit", r.status === 200 && r.data.rental.pricePerDay === 1000 && r.data.rental.tiers[0].price === 800, r.data);

    r = await sf("GET", `/api/storefront/${H}/render/product?slug=${lehenga.slug}`);
    let pg = r.data;
    check("its page: daily rent, longer-rental rate, deposit, booking calendar", pg.includes("sys-rentprice") && pg.includes("/ day") && pg.includes("3+ days") && pg.includes("Refundable deposit") && pg.includes("data-sys-rental") && pg.includes('name="rentalStart"'), "");
    check("…and no Add to cart or stock line", !pg.includes("data-sys-add") && !pg.includes("data-sys-stock"), "");
    const json = JSON.parse(pg.match(/<script type="application\/json" data-sys-rental-json>([\s\S]*?)<\/script>/)[1]);
    check("…calendar data: earliest day after the notice, nothing booked", json.earliest === plus(today, 2) && json.booked[vM.id].length === 0 && json.minDays === 2 && json.mode === "cart", json);
    r = await sf("GET", `/api/storefront/${H}/render/collection?slug=all`);
    check("product cards show the rent per day", r.data.includes("Silk Lehenga") && /From<\/span>\s*₹800|₹800/.test(r.data) && r.data.includes("/ day"), "");
    r = await sf("GET", `/api/storefront/${H}/products/${lehenga.slug}/quick`);
    check("quick add sends shoppers to the page to pick dates", r.data.product.rental === true, r.data);

    const s1 = plus(today, 3);
    const e1 = plus(today, 5);
    r = await sf("POST", `/api/storefront/${H}/cart/add`, { variantId: vM.id, quantity: 1 });
    check("no dates, no cart", r.status === 400 && /dates/i.test(r.data.error), r.data);
    r = await sf("POST", `/api/storefront/${H}/cart/add`, { variantId: vM.id, quantity: 1, rentalStart: today, rentalEnd: plus(today, 2) });
    check("too soon (2 days' notice)", r.status === 400 && /earliest/i.test(r.data.error), r.data);
    r = await sf("POST", `/api/storefront/${H}/cart/add`, { variantId: vM.id, quantity: 1, rentalStart: s1, rentalEnd: s1 });
    check("too short (at least 2 days)", r.status === 400 && /at least 2/i.test(r.data.error), r.data);
    r = await sf("POST", `/api/storefront/${H}/cart/add`, { variantId: vM.id, quantity: 1, rentalStart: s1, rentalEnd: e1, rentalHandover: "delivery", rentalReturn: "collect" });
    const cartId = r.data.cart?.cartId;
    const line = r.data.cart?.items?.[0];
    check("3 days in the cart at the 3-day rate: ₹2400 (deposit on delivery)", r.status === 200 && line.price === 2400 && line.rental.days === 3 && line.rental.pricePerDay === 800 && /Rental/.test(line.detail) && /Deposit on delivery/.test(line.detail), r.data);
    check("…a line of its own (key with the dates)", line.key.includes(s1) && line.key.includes(vM.id), line);
    r = await sf("POST", `/api/storefront/${H}/cart/update`, { cartId, lineKey: line.key, quantity: 2 });
    check("a second piece for the same dates isn't free (1 piece per size)", r.status === 409, r.data);

    const before = await prisma.productVariant.findUnique({ where: { id: vM.id } });
    r = await sf("POST", `/api/storefront/${H}/checkout`, { cartId, email: `renter-${stamp}@test.oyklane.dev`, phone: "9876511111", shippingName: "Kavya Rao", ...SHIP, paymentMethod: "cod" });
    check("checkout (cash on delivery)", r.status === 201 || r.status === 200, r.data);
    const order = r.data.order;
    const item = await prisma.orderItem.findFirst({ where: { orderId: order.id } });
    check("the order line keeps the dates and the rent", item.properties?.rental?.start === s1 && item.properties.rental.end === e1 && Number(item.price) === 2400 && /Rental/.test(item.properties.detail), item);
    const after = await prisma.productVariant.findUnique({ where: { id: vM.id } });
    check("stock isn't touched by a rental", after.inventoryQuantity === before.inventoryQuantity, { before: before.inventoryQuantity, after: after.inventoryQuantity });
    let booking = await prisma.rentalBooking.findFirst({ where: { orderId: order.id } });
    check("a booking is made: confirmed, deposit due on delivery, address kept", booking && booking.status === "confirmed" && booking.depositStatus === "due" && Number(booking.deposit) === 2000 && Number(booking.rentalTotal) === 2400 && /12 MG Road/.test(booking.address), booking);

    r = await sf("POST", `/api/storefront/${H}/cart/add`, { variantId: vM.id, quantity: 1, rentalStart: plus(today, 4), rentalEnd: plus(today, 7) });
    check("the same size can't be booked over it", r.status === 409, r.data);
    r = await sf("POST", `/api/storefront/${H}/cart/add`, { variantId: vM.id, quantity: 1, rentalStart: plus(today, 6), rentalEnd: plus(today, 8) });
    check("…nor on the day after (kept free to clean it)", r.status === 409, r.data);
    r = await sf("POST", `/api/storefront/${H}/cart/add`, { variantId: vM.id, quantity: 1, rentalStart: plus(today, 7), rentalEnd: plus(today, 8) });
    check("…but from the day after that it's free", r.status === 200, r.data);
    r = await sf("POST", `/api/storefront/${H}/cart/add`, { variantId: vS.id, quantity: 1, rentalStart: s1, rentalEnd: e1 });
    check("another size on the same dates is free", r.status === 200, r.data);
    r = await sf("GET", `/api/storefront/${H}/render/product?slug=${lehenga.slug}`);
    const booked = JSON.parse(r.data.match(/data-sys-rental-json>([\s\S]*?)<\/script>/)[1]).booked;
    check("the calendar greys out the booked days and the cleaning day (that size only)", [s1, plus(today, 4), e1, plus(today, 6)].every((d) => booked[vM.id].includes(d)) && booked[vS.id].length === 0, booked);

    r = await owner("GET", "/api/rentals/overview");
    check("the seller's board: one upcoming booking, one product", r.status === 200 && r.data.products === 1 && (r.data.upcoming + r.data.goingOut.length) === 1, r.data);
    r = await owner("GET", `/api/rentals/bookings?q=Kavya`);
    check("bookings search by customer", r.data.total === 1 && r.data.bookings[0].order.orderNumber === order.orderNumber, r.data);
    r = await owner("POST", `/api/rentals/bookings/${booking.id}/out`, { depositCollected: true });
    check("handed over: with the customer, deposit held", r.data.booking.status === "out" && r.data.booking.depositStatus === "held", r.data);
    r = await owner("POST", `/api/rentals/bookings/${booking.id}/returned`, { returnedOn: plus(e1, 2), lateFee: 600 });
    check("returned 2 days late with a late fee", r.data.booking.status === "returned" && r.data.booking.lateFee === 600, r.data);
    r = await owner("POST", `/api/rentals/bookings/${booking.id}/deposit`, { depositStatus: "refunded" });
    check("deposit given back", r.data.booking.depositStatus === "refunded", r.data);
    r = await owner("POST", `/api/rentals/bookings/${booking.id}/cancel`, {});
    check("a returned booking can't be cancelled", r.status === 400, r.data);

    // Cancelling an order frees its dates.
    const c2 = await sf("POST", `/api/storefront/${H}/cart/add`, { variantId: vS.id, quantity: 1, rentalStart: plus(today, 10), rentalEnd: plus(today, 11) });
    r = await sf("POST", `/api/storefront/${H}/checkout`, { cartId: c2.data.cart.cartId, email: `renter2-${stamp}@test.oyklane.dev`, phone: "9876522222", shippingName: "Rohan", ...SHIP, paymentMethod: "cod" });
    const order2 = r.data.order;
    r = await owner("POST", `/api/orders/${order2.id}/cancel`, { reason: "Changed plans" });
    check("cancel a rental order", r.status === 200, r.data);
    booking = await prisma.rentalBooking.findFirst({ where: { orderId: order2.id } });
    check("…its booking is cancelled", booking.status === "cancelled", booking);
    r = await sf("POST", `/api/storefront/${H}/cart/add`, { variantId: vS.id, quantity: 1, rentalStart: plus(today, 10), rentalEnd: plus(today, 11) });
    check("…and the dates are free again", r.status === 200, r.data);

    // Manual bookings and blocks.
    r = await owner("POST", "/api/rentals/bookings", { productId: lehenga.id, variantId: vM.id, start: plus(today, 20), end: plus(today, 22), customerName: "Walk-in Neha", phone: "9876533333" });
    check("add a booking by hand", r.status === 201 && r.data.booking.status === "confirmed" && r.data.booking.rentalTotal === 2400 && r.data.booking.source === "manual", r.data);
    r = await owner("POST", "/api/rentals/bookings", { productId: lehenga.id, variantId: vM.id, start: plus(today, 21), end: plus(today, 23), customerName: "Second", phone: "9876544444" });
    check("a clash is flagged", r.status === 409, r.data);
    r = await owner("POST", "/api/rentals/bookings", { productId: lehenga.id, variantId: vM.id, start: plus(today, 21), end: plus(today, 23), customerName: "Second", phone: "9876544444", force: true });
    check("…and can be added anyway", r.status === 201, r.data);
    r = await owner("POST", "/api/rentals/bookings", { kind: "block", productId: lehenga.id, start: plus(today, 30), end: plus(today, 31), note: "Alteration" });
    check("block dates for every size", r.status === 201 && r.data.booking.status === "blocked" && r.data.booking.variantId === null, r.data);
    r = await sf("POST", `/api/storefront/${H}/cart/add`, { variantId: vS.id, quantity: 1, rentalStart: plus(today, 29), rentalEnd: plus(today, 30) });
    check("blocked days can't be booked", r.status === 409, r.data);
    r = await owner("GET", `/api/rentals/calendar?month=${plus(today, 20).slice(0, 7)}`);
    check("the month calendar lists the product and its bookings", r.status === 200 && r.data.products.length === 1 && r.data.bookings.some((b) => b.customerName === "Walk-in Neha"), r.data);

    // Request mode.
    r = await owner("PUT", "/api/rentals/settings", { checkoutMode: "request", handover: "both", returns: "drop_off", pickupAddress: "Shop 4, MG Road", depositCollection: "on_delivery", lateFeePerDay: 300, bookingWindowDays: 120, terms: "Dry clean only" });
    check("switch to booking requests", r.status === 200 && r.data.settings.checkoutMode === "request" && r.data.settings.lateFeePerDay === 300, r.data);
    r = await sf("GET", `/api/storefront/${H}/render/product?slug=${lehenga.slug}`);
    pg = r.data;
    check("the page asks for a request (name, phone, address) — no payment", pg.includes("Request to book") && pg.includes("/apps/rentals/request") && pg.includes('name="rentalPhone"') && pg.includes("Shop 4, MG Road") && pg.includes("Dry clean only") && !pg.includes('name="rentalReturn" value="collect"'), "");
    r = await sf("POST", `/api/storefront/${H}/apps/rentals/request`, { variantId: vS.id, start: plus(today, 40), end: plus(today, 42), handover: "delivery", name: "Isha", phone: "98765 55555", email: `isha-${stamp}@test.oyklane.dev` });
    check("delivery needs an address", r.status === 400 && /address/i.test(r.data.error), r.data);
    r = await sf("POST", `/api/storefront/${H}/apps/rentals/request`, { variantId: vS.id, start: plus(today, 40), end: plus(today, 42), handover: "delivery", name: "Isha", phone: "98765 55555", email: `isha-${stamp}@test.oyklane.dev`, address: "7 Park St, Pune" });
    check("send a booking request", r.status === 200 && r.data.ok && /call you/.test(r.data.message), r.data);
    const reqBooking = await prisma.rentalBooking.findUnique({ where: { id: r.data.bookingId } });
    check("…it waits as a request (dates not held yet)", reqBooking.status === "requested" && reqBooking.source === "request" && reqBooking.returnMethod === "drop_off", reqBooking);
    const mails = await prisma.emailLog.findMany({ where: { storeId: store.id, template: { in: ["rental_request_alert", "rental_request_received"] } } });
    check("the seller and the shopper get an email", mails.some((m) => m.template === "rental_request_alert" && m.to === ownerEmail) && mails.some((m) => m.template === "rental_request_received" && m.to.startsWith("isha-")), mails.map((m) => [m.template, m.to]));
    r = await owner("GET", "/api/rentals/overview");
    check("requests show on the seller's board", r.data.requests.some((b) => b.id === reqBooking.id), r.data.requests);
    r = await owner("POST", `/api/rentals/bookings/${reqBooking.id}/confirm`, {});
    check("confirm the request", r.data.booking.status === "confirmed", r.data);
    const conf = await prisma.emailLog.findFirst({ where: { storeId: store.id, template: "rental_confirmed" } });
    check("…the shopper is told", Boolean(conf), conf);
    r = await other("GET", `/api/rentals/bookings/${reqBooking.id}`);
    check("another store can't see the booking", r.status === 402 || r.status === 404, r.data);

    // ══ Connected accounts: one Facebook and one Google sign-in ══════
    r = await owner("GET", "/api/accounts");
    check("no accounts yet; both sign-ins offered", r.status === 200 && r.data.google.configured && !r.data.google.connected && r.data.facebook.configured && !r.data.facebook.connected, r.data);

    // Instagram through the store's Facebook login
    await owner("POST", "/api/apps/instagram-feed/install", { settings: {} });
    r = await owner("GET", "/api/social/instagram");
    check("Instagram: the store has no Facebook login yet", r.data.facebook === true && r.data.connected === false && r.data.account.connected === false, r.data);
    r = await owner("GET", "/api/social/instagram/accounts");
    check("…so its accounts ask for the Facebook sign-in first", r.status === 409 && r.data.details?.needs === "facebook" && r.data.details?.access === "instagram", r.data);
    r = await owner("POST", "/api/accounts/facebook/url", {});
    const fbScopes = decodeURIComponent(r.data.url);
    check(
      "one Facebook sign-in asks for every Meta app's access",
      ["instagram_basic", "pages_show_list", "catalog_management", "business_management", "ads_read", "whatsapp_business_management"].every((x) => fbScopes.includes(x)),
      r.data
    );
    r = await owner("POST", "/api/accounts/facebook/connect", { code: "TWO_PAGES" });
    check(
      "the store's Facebook login: who, what it allows, no token sent",
      r.status === 200 && r.data.facebook.connected && r.data.facebook.name === "Loom Seller" && r.data.facebook.access.instagram && r.data.facebook.access.catalog && !JSON.stringify(r.data).includes("LONG_"),
      r.data
    );
    const metaRow = await prisma.metaConnection.findUnique({ where: { storeId: store.id } });
    check("…kept encrypted", String(metaRow.accessToken).startsWith("enc:v1:") && decryptSecret(metaRow.accessToken) === "LONG_SHORT_TWO_PAGES", String(metaRow.accessToken).slice(0, 8));
    r = await owner("GET", "/api/social/instagram/accounts");
    check("Instagram accounts come from that login — no second sign-in, no tokens", r.status === 200 && r.data.accounts.length === 2 && !JSON.stringify(r.data).includes("PAGE_TOKEN"), r.data);
    r = await owner("POST", "/api/social/instagram/choose", { igUserId: "ig9" });
    check("an account not on the login is refused", r.status === 400, r.data);
    r = await owner("POST", "/api/social/instagram/choose", { igUserId: "ig2" });
    check("connected through the Page: posts, no expiry", r.status === 200 && r.data.connected && r.data.via === "facebook" && r.data.profile.username === "loomwear.bridal" && r.data.posts.length === 1 && !r.data.expiresAt && r.data.pageName === "Loomwear Bridal", r.data);
    let row = await prisma.appConnection.findUnique({ where: { storeId_appKey: { storeId: store.id, appKey: "instagram-feed" } } });
    check("the Page token is stored encrypted", String(row.credentials.pageToken).startsWith("enc:v1:") && decryptSecret(row.credentials.pageToken) === "PAGE_TOKEN_2", row.credentials);
    r = await owner("POST", "/api/social/instagram/refresh");
    check("refresh reads through the Page", r.status === 200 && !r.data.error && mock.calls.fb.at(-1).token === "PAGE_TOKEN_2", r.data);
    r = await owner("POST", "/api/social/instagram/token", { accessToken: "IGAA_PASTED_TOKEN_0000000000" });
    check("no pasting access tokens", r.status === 404, r.status);
    await other("POST", "/api/apps/instagram-feed/install", { settings: {} });
    r = await other("GET", "/api/social/instagram/accounts");
    check("another store doesn't get this store's Facebook login", r.status === 409 && r.data.details?.needs === "facebook", r.data);

    // Google reviews through the store's Google account
    await owner("POST", "/api/apps/google-reviews/install", { settings: {} });
    r = await owner("GET", "/api/social/google-reviews");
    check("Google reviews: sign in with Google first", r.data.business === true && r.data.ready === false && r.data.account.connected === false, r.data);
    r = await owner("GET", "/api/social/google-reviews/locations");
    check("…its businesses need the Google account", r.status === 409 && r.data.details?.needs === "google" && r.data.details?.access === "reviews", r.data);
    r = await owner("POST", "/api/accounts/google/url", { returnTo: "https://evil.example.com/steal" });
    check("sign-in only returns to an admin page", r.status === 400, r.data);
    r = await owner("POST", "/api/accounts/google/url", { returnTo: "/admin/apps/google-reviews" });
    const gUrl = new URL(r.data.url);
    check(
      "one Google sign-in asks for reviews AND Merchant Center, offline",
      gUrl.searchParams.get("scope").includes("business.manage") && gUrl.searchParams.get("scope").includes("auth/content") && gUrl.searchParams.get("access_type") === "offline" && gUrl.searchParams.get("redirect_uri").endsWith("/admin/apps/google/callback"),
      r.data.url
    );
    const state = gUrl.searchParams.get("state");
    r = await other("POST", "/api/accounts/google/callback", { code: "ALL_SCOPES", state });
    check("another store can't use this sign-in", r.status === 400, r.data);
    r = await owner("POST", "/api/accounts/google/callback", { code: "REVIEWS", state });
    check(
      "Google connected for the store (here only reviews were ticked); back to the app",
      r.status === 200 && r.data.redirect === "/admin/apps/google-reviews" && r.data.google.email === "seller@loomwear.in" && r.data.google.access.reviews && !r.data.google.access.merchant && !JSON.stringify(r.data).includes("RT_"),
      r.data
    );
    r = await owner("GET", "/api/social/google-reviews/locations");
    check("businesses from the store's Google account, to pick", r.status === 200 && r.data.locations.length === 2 && r.data.locations[0].name === "Loomwear Studio", r.data);
    r = await owner("POST", "/api/social/google-reviews/choose", { location: "locations/999" });
    check("a business not on the account is refused", r.status === 400, r.data);
    r = await owner("POST", "/api/social/google-reviews/choose", { location: "locations/222" });
    check("connected: every review (two pages), rating and count", r.status === 200 && r.data.via === "google" && r.data.reviews.length === 3 && r.data.profile.rating === 4.7 && r.data.profile.total === 152, r.data);
    check("…the reviewer's own words kept, anonymous names hidden", r.data.reviews.some((x) => x.text === "बहुत अच्छा") && r.data.reviews.some((x) => x.author === "A Google user"), r.data.reviews);
    row = await prisma.appConnection.findUnique({ where: { storeId_appKey: { storeId: store.id, appKey: "google-reviews" } } });
    check("the app keeps only which business — no tokens of its own", !row.credentials.refreshToken && !row.credentials.accessToken && row.credentials.location === "locations/222", Object.keys(row.credentials));
    let acct = await prisma.appConnection.findUnique({ where: { storeId_appKey: { storeId: store.id, appKey: "google-account" } } });
    check("the store's Google refresh token is stored encrypted", String(acct.credentials.refreshToken).startsWith("enc:v1:") && decryptSecret(acct.credentials.refreshToken) === "RT_REVIEWS", Object.keys(acct.credentials));
    await prisma.appConnection.update({ where: { id: acct.id }, data: { credentials: { ...acct.credentials, accessExpiresAt: new Date(0).toISOString() } } });
    r = await owner("POST", "/api/social/google-reviews/refresh");
    check("an expired access token is renewed with the refresh token", r.status === 200 && !r.data.error && mock.calls.google.some((c) => c.path === "token" && c.form.grant_type === "refresh_token" && c.form.refresh_token === "RT_REVIEWS"), r.data);

    // ══ Sales channels: feeds ════════════════════════════════════════
    await owner("PATCH", `/api/products/${plain.id}`, { hiddenChannels: ["google"], googleCategory: "Apparel & Accessories > Clothing" });
    r = await owner("GET", "/api/channels/google");
    check("the Google channel needs its app", r.status === 402, r.data);
    await owner("POST", "/api/apps/google-shopping/install", { settings: {} });
    await owner("POST", "/api/apps/facebook-shop/install", { settings: {} });
    r = await owner("GET", "/api/channels/google");
    const gch = r.data;
    check("Google channel: products ready, problems listed", r.status === 200 && gch.signIn === true && gch.connected === false && gch.products.problems.some((p) => p.title === "Plain Kurta" && p.reasons.includes("Hidden from this channel")) && gch.products.problems.some((p) => p.title === "Silk Lehenga" && p.reasons.includes("Rented out by the day")), gch.products);
    const feedUrl = gch.products.feedUrl;
    r = await fetch(feedUrl.replace(/^https?:\/\/[^/]+/, API));
    const xmlText = await r.text();
    check("the Google feed: RSS with g: fields, sale prices, the fitted kurta only", r.status === 200 && xmlText.includes('xmlns:g="http://base.google.com/ns/1.0"') && xmlText.includes("Fitted Kurta") && xmlText.includes("<g:price>1200.00 INR</g:price>") && !xmlText.includes("Plain Kurta") && !xmlText.includes("Silk Lehenga"), xmlText.slice(0, 400));
    r = await fetch(feedUrl.replace(/^https?:\/\/[^/]+/, API).replace(/google\.xml$/, "facebook.csv"));
    const csv = await r.text();
    check("the Meta feed: CSV with both kurtas (hidden only from Google)", csv.startsWith("id,title,description,availability") && csv.includes("Plain Kurta") && csv.includes("Fitted Kurta") && csv.includes("in stock"), csv.slice(0, 300));
    r = await fetch(feedUrl.replace(/^https?:\/\/[^/]+/, API).replace(/\/[a-f0-9]{32}\//, "/0000000000000000000000000000dead/"));
    check("a wrong feed token gets nothing", r.status === 404);

    // Google Merchant Center — the same Google account
    r = await owner("GET", "/api/channels/google/accounts");
    check("Merchant Center wasn't ticked: the store's Google sign-in is asked for again (no new connection)", r.status === 409 && r.data.details?.needs === "google" && r.data.details?.access === "merchant", r.data);
    r = await owner("POST", "/api/accounts/google/url", { returnTo: "/admin/apps/google-shopping" });
    r = await owner("POST", "/api/accounts/google/callback", { code: "ALL_SCOPES", state: new URL(r.data.url).searchParams.get("state") });
    check("signed in again with everything allowed", r.status === 200 && r.data.google.access.merchant && r.data.google.access.reviews && r.data.redirect === "/admin/apps/google-shopping", r.data);
    r = await owner("GET", "/api/channels/google/accounts");
    check("Merchant Center accounts from the store's Google account", r.status === 200 && r.data.accounts[0].id === "999", r.data);
    r = await owner("POST", "/api/channels/google/choose", { accountId: "999" });
    check("connect Merchant Center", r.status === 200 && r.data.connected && r.data.merchant.id === "999" && r.data.account.email === "seller@loomwear.in", r.data);
    const createDs = mock.calls.google.find((c) => c.host === "merchantapi.googleapis.com" && c.method === "POST" && c.path.endsWith("/dataSources"));
    check("…adds a daily-fetched data source with the store's feed", createDs && createDs.body.fileInput.fetchSettings.fetchUri === feedUrl && createDs.body.fileInput.fetchSettings.frequency === "FREQUENCY_DAILY" && createDs.body.primaryProductDataSource.feedLabel === "IN", createDs?.body);
    check("…and asks Google to fetch it now", mock.calls.google.some((c) => c.path.endsWith("dataSources/555:fetch")));
    r = await owner("GET", "/api/channels/google");
    check("status: account, last fetch, Google's notes", r.data.connected && r.data.merchant.id === "999" && r.data.lastFetch.total === 3 && r.data.lastFetch.issues[0].title === "Missing GTIN", r.data);
    r = await owner("POST", "/api/channels/google/sync");
    check("sync now", r.status === 200 && r.data.connected, r.data);
    r = await owner("POST", "/api/channels/google/claim-website");
    check("claim website: sets it, says it isn't verified yet", r.status === 200 && r.data.claimed === false && /verified/.test(r.data.error), r.data);
    r = await owner("POST", "/api/social/google-reviews/refresh");
    check("the reviews keep working on the renewed sign-in", r.status === 200 && !r.data.error && r.data.reviews.length === 3, r.data);

    // Meta catalog — the same Facebook login
    r = await owner("GET", "/api/channels/facebook");
    check("the Meta catalogue uses the store's Facebook login — no connect step", r.status === 200 && r.data.account.connected && r.data.connected === false, r.data);
    r = await owner("GET", "/api/channels/facebook/catalogs");
    check("businesses and catalogues to pick from (no token sent)", r.status === 200 && r.data.businesses[0].catalogs[0].id === "c1" && !JSON.stringify(r.data).includes("LONG_"), r.data);
    r = await owner("POST", "/api/channels/facebook/catalog", { businessId: "b7", create: true });
    check("a business not on the login is refused", r.status === 400, r.data);
    r = await owner("POST", "/api/channels/facebook/catalog", { businessId: "b1", create: true });
    check("a new catalogue with the store's hourly feed", r.status === 200 && r.data.connected && r.data.catalog.catalogId === "c9" && r.data.lastFetch.saved === 4, r.data);
    const feedCall = mock.calls.fb.find((c) => c.method === "POST" && c.path === "/c9/product_feeds");
    check("…Meta fetches the CSV feed every hour", feedCall && JSON.parse(feedCall.form.schedule).interval === "HOURLY" && JSON.parse(feedCall.form.schedule).url === feedUrl.replace(/google\.xml$/, "facebook.csv"), feedCall?.form);
    check("…all through the store's one login", feedCall.token === "LONG_SHORT_TWO_PAGES", feedCall.token);

    // An unticked permission shows, and asking again is a re-request
    r = await owner("POST", "/api/accounts/facebook/connect", { code: "NOIG_TICK" });
    check("Facebook sign-in without Instagram ticked: shown as not allowed", r.status === 200 && r.data.facebook.access.instagram === false && r.data.facebook.access.catalog === true, r.data.facebook);
    r = await owner("POST", "/api/accounts/facebook/url", { rerequest: true });
    check("…asking again re-requests the missing permission", new URL(r.data.url).searchParams.get("auth_type") === "rerequest", r.data);

    // Disconnecting the Google account
    r = await owner("DELETE", "/api/accounts/google");
    check("disconnect Google: gone here, revoked at Google", r.status === 204 && mock.calls.google.some((c) => c.host === "oauth2.googleapis.com" && c.path === "/revoke"), r.status);
    r = await owner("POST", "/api/social/google-reviews/refresh");
    check("…the reviews app says to sign in again (last reviews kept)", r.status === 200 && /Sign in with Google/.test(r.data.error || "") && r.data.reviews.length === 3, r.data);

    // Verification tags
    r = await owner("PUT", "/api/channels/verification", { google: '<meta name="google-site-verification" content="AbC123_xyz-987" />' });
    check("paste the whole Google tag: the code is kept", r.status === 200 && r.data.verification.google === "AbC123_xyz-987", r.data);
    r = await owner("PUT", "/api/channels/verification", { facebook: '"><script>alert(1)</script>' });
    check("anything that isn't a code is refused", r.status === 400, r.data);
    r = await sf("GET", `/api/storefront/${H}/render/index`);
    check("the tag is on the store's pages", r.data.includes('<meta name="google-site-verification" content="AbC123_xyz-987">'), "");

    // ══ Oyklane account: one shopper sign-in across stores ═══════════
    const until = async (fn, ms = 8000) => {
      const end = Date.now() + ms;
      for (;;) {
        const v = await fn();
        if (v || Date.now() > end) return v;
        await new Promise((res) => setTimeout(res, 250));
      }
    };
    const shopperEmail = `oy-shopper-${stamp}@test.oyklane.dev`;
    const HB = storeB.handle;
    await sf("POST", `/api/storefront/${H}/account/code`, { email: shopperEmail });
    const codeMail = await until(() => prisma.emailLog.findFirst({ where: { to: shopperEmail, template: "sign_in_code" }, orderBy: { createdAt: "desc" } }));
    const code = codeMail?.html.match(/>(\d)<\/div>/g)?.map((x) => x[1]).join("");
    r = await sf("POST", `/api/storefront/${H}/account/code/verify`, { email: shopperEmail, code });
    check("signing in at store A with an emailed code also gives an Oyklane ID", r.status === 200 && r.data.token && typeof r.data.oyklaneId === "string", r.data);
    const oyId = r.data.oyklaneId;
    r = await sf("POST", `/api/storefront/${HB}/account/oyklane`, { idToken: oyId });
    check("store B, just browsing: no account there, nothing made", r.status === 200 && r.data.none === true, r.data);
    check("…store B learned nothing about the shopper", !(await prisma.customer.findFirst({ where: { storeId: storeB.id, email: shopperEmail } })));
    r = await sf("POST", `/api/storefront/${HB}/account/oyklane`, { idToken: oyId, create: true });
    check("store B, opening their account: one is made and they're signed in", r.status === 200 && r.data.token && r.data.created === true, r.data);
    const bToken = r.data.token;
    const bCustomer = await prisma.customer.findFirst({ where: { storeId: storeB.id, email: shopperEmail } });
    check("…with the email already proven", Boolean(bCustomer?.emailVerifiedAt), bCustomer);
    const acctPage = await fetch(`${API}/api/storefront/${HB}/render/account`, { headers: { "x-shopper-token": bToken } }).then((x) => x.text());
    check("…store B's account page shows them signed in", acctPage.includes(shopperEmail), "");
    r = await sf("POST", `/api/storefront/${HB}/account/oyklane`, { idToken: oyId });
    check("next time at store B: signed in to that account on any page", r.status === 200 && r.data.token && r.data.created === false, r.data);
    const forged = `${oyId.split(".").slice(0, 2).join(".")}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    r = await sf("POST", `/api/storefront/${HB}/account/oyklane`, { idToken: forged, create: true });
    check("a forged Oyklane ID is refused", r.status === 200 && r.data.invalid === true, r.data);
    r = await sf("POST", `/api/storefront/${HB}/account/oyklane`, { idToken: bToken, create: true });
    check("a store session isn't an Oyklane ID", r.data.invalid === true, r.data);
    const pwEmail = `oy-pw-${stamp}@test.oyklane.dev`;
    r = await sf("POST", `/api/storefront/${H}/account/register`, { name: "Pw Shopper", email: pwEmail, password: "long-enough-password" });
    check("a password sign-up (email not proven) gives no Oyklane ID", r.status === 201 && r.data.token && !r.data.oyklaneId, r.data);

    // ══ Theme editor preview ═════════════════════════════════════════
    const drafts = await Promise.all([1, 2, 3, 4, 5].map(() => owner("POST", `/api/themes/${theme.id}/render-draft`, { template: "index" })));
    check("five previews at once all render", drafts.every((d) => d.status === 200 && d.data.html.includes("</html>")), drafts.map((d) => d.status));
  } catch (err) {
    check("no unexpected error", false, err.stack || String(err));
  } finally {
    for (const { storeId, emails } of created) {
      await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
      await prisma.user.deleteMany({ where: { email: { in: emails } } }).catch(() => {});
    }
    for (const key of appRowsAdded) await prisma.app.delete({ where: { key } }).catch(() => {});
    await prisma.emailLog.deleteMany({ where: { to: { endsWith: "@test.oyklane.dev" } } }).catch(() => {});
    console.log(`      (test stores, users, orders and emails deleted${appRowsAdded.length ? `; catalog rows ${appRowsAdded.join(", ")} removed` : ""})`);
    await prisma.$disconnect();
    api.child.kill();
    mock.server.close();
  }
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();

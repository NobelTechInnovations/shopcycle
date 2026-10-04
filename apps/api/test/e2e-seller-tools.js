#!/usr/bin/env node
/**
 * End-to-end test of the 1 Oct seller tools, against a real API:
 *
 *   Product page: AI description rewrite (thinking hidden) · tag and
 *   category suggestions (AI, and word matching when the AI fails) · tags
 *   Menus: sub-menus (depth) saved, normalised, rendered as dropdowns
 *   Customer behaviour: orders, cancellations, returns and undelivered
 *   shipments across stores, by phone (any format) and email · scoped
 *   Live view & visit history: signed-in shoppers by name, phone, email,
 *   with readable page names
 *   Email design: logo, colour, layout on order emails · icons served ·
 *   Flow email icon and banner
 *   Instagram feed & Google reviews apps: connect (mock Instagram and
 *   Google), what the theme shows (escaped), editor section list, minimum
 *   stars, disconnect, uninstall removes the tokens
 *
 *   node apps/api/test/e2e-seller-tools.js
 *
 * Creates throwaway stores and deletes them when done, pass or fail.
 * Nothing real is contacted: email is "log"; the AI, Instagram and Google
 * are local mocks.
 */
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "../../..");
require(path.join(ROOT, "apps/api/node_modules/dotenv")).config({ path: path.join(ROOT, ".env") });
Object.assign(process.env, { SMTP_HOST: "", EMAIL_PROVIDER: "log", SMS_PROVIDER: "log", WHATSAPP_PROVIDER: "log", MEDIA_STORAGE: "database" });

const API_PORT = 4193;
const API = `http://localhost:${API_PORT}`;
const MOCK_PORT = 4293;
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
const API_DATABASE_URL = dbUrl(3);
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

async function sf(method, url, body, headers = {}) {
  const res = await fetch(`${API}${url}`, { method, headers: { ...(body !== undefined && { "content-type": "application/json" }), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text), headers: res.headers };
  } catch {
    return { status: res.status, data: text, headers: res.headers };
  }
}

/** One mock server for the AI (NVIDIA-style stream), Instagram and Google. */
function startMock() {
  const calls = { ai: [], ig: [], google: [] };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const url = new URL(req.url, MOCK);
      const json = (status, obj) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      // ── AI ──
      if (url.pathname === "/v1/chat/completions") {
        const j = JSON.parse(body || "{}");
        calls.ai.push(j);
        const system = j.messages?.[0]?.content || "";
        const user = j.messages?.[j.messages.length - 1]?.content || "";
        let text;
        if (/JSON only/.test(system)) {
          text = /NOJSON/.test(user) ? "Sorry, I can't do that." : '```json\n{"category": "Kurtas", "new_category": "", "tags": ["Cotton", "festive", "indigo", "hand block print"]}\n```';
        } else {
          text = "**Soft** cotton kurta.\n\n- Breathable\n- Hand block printed";
        }
        res.writeHead(200, { "content-type": "text/event-stream" });
        const chunk = (delta) => res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta }] })}\n\n`);
        chunk({ role: "assistant", reasoning_content: "secret reasoning" });
        chunk({ content: "<think>hidden</think>" });
        for (let i = 0; i < text.length; i += 9) chunk({ content: text.slice(i, i + 9) });
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }
      // ── Instagram ──
      if (url.pathname.startsWith("/ig/")) {
        const token = url.searchParams.get("access_token");
        calls.ig.push({ path: url.pathname, token });
        if (/BAD/.test(token || "")) return json(400, { error: { message: "Invalid OAuth access token - Cannot parse access token", type: "OAuthException", code: 190 } });
        if (url.pathname === "/ig/refresh_access_token") return json(200, { access_token: `${token}-RENEWED`, token_type: "bearer", expires_in: 5184000 });
        if (url.pathname === "/ig/v22.0/me") return json(200, { user_id: "17841400000000001", username: "loomwear.test", name: "Loomwear", profile_picture_url: "https://cdn.example.com/p.jpg", followers_count: 1234, media_count: 3 });
        if (url.pathname === "/ig/v22.0/me/media")
          return json(200, {
            data: [
              { id: "1", caption: "New drop <script>alert(1)</script> linen", media_type: "IMAGE", media_url: "https://cdn.example.com/1.jpg", permalink: "https://www.instagram.com/p/AAA/", timestamp: "2026-09-30T10:00:00+0000", like_count: 52, comments_count: 3 },
              { id: "2", caption: "Reel", media_type: "VIDEO", media_url: "https://cdn.example.com/2.mp4", thumbnail_url: "https://cdn.example.com/2.jpg", permalink: "https://www.instagram.com/reel/BBB/", timestamp: "2026-09-29T10:00:00+0000" },
              { id: "3", caption: "", media_type: "CAROUSEL_ALBUM", media_url: "javascript:alert(1)", permalink: "https://www.instagram.com/p/CCC/" },
            ],
          });
        return json(404, { error: { message: "unknown" } });
      }
      // ── Google Places ──
      if (url.pathname.startsWith("/g/v1/")) {
        calls.google.push({ path: url.pathname, key: req.headers["x-goog-api-key"], mask: req.headers["x-goog-fieldmask"], body });
        if (req.headers["x-goog-api-key"] !== "test-places-key") return json(403, { error: { message: "API key not valid" } });
        if (url.pathname === "/g/v1/places:searchText")
          return json(200, { places: [{ id: "ChIJtestplace0001", displayName: { text: "Loomwear Studio" }, formattedAddress: "12 MG Road, Pune", rating: 4.6, userRatingCount: 87 }] });
        if (url.pathname === "/g/v1/places/ChIJtestplace0001")
          return json(200, {
            id: "ChIJtestplace0001",
            displayName: { text: "Loomwear Studio" },
            formattedAddress: "12 MG Road, Pune",
            rating: 4.6,
            userRatingCount: 87,
            googleMapsUri: "https://maps.google.com/?cid=1",
            reviews: [
              { rating: 5, text: { text: "Lovely <b>fabric</b>, fast delivery" }, authorAttribution: { displayName: "Ananya S", uri: "https://www.google.com/maps/contrib/1", photoUri: "https://lh3.example.com/a.jpg" }, relativePublishTimeDescription: "a week ago" },
              { rating: 4, text: { text: "Good fit, slightly late" }, authorAttribution: { displayName: "Rahul K" }, relativePublishTimeDescription: "a month ago" },
              { rating: 2, text: { text: "Colour faded" }, authorAttribution: { displayName: "Unhappy Person" }, relativePublishTimeDescription: "2 months ago" },
              { rating: 5, text: { text: "Best kurtas in Pune" }, authorAttribution: { displayName: "Meera I" }, relativePublishTimeDescription: "3 months ago" },
            ],
          });
        return json(404, { error: { message: "Not found" } });
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
      ANTHROPIC_API_KEY: "",
      NVIDIA_API_KEY: "nvapi-test-key",
      NVIDIA_API_URL: `${MOCK}/v1/chat/completions`,
      INSTAGRAM_APP_ID: "",
      INSTAGRAM_APP_SECRET: "",
      INSTAGRAM_GRAPH_URL: `${MOCK}/ig`,
      GOOGLE_PLACES_API_KEY: "test-places-key",
      GOOGLE_PLACES_URL: `${MOCK}/g/v1`,
      SEED_PREVIEW_APPS: "",
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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 30000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) return v;
    await wait(300);
  }
}

const SHIP = { shippingAddress1: "12 MG Road", shippingCity: "Pune", shippingProvince: "MH", shippingZip: "411001", shippingCountry: "IN" };

async function main() {
  const mock = await startMock();
  const api = await startApi();
  const { PrismaClient } = require(path.join(ROOT, "packages/database/node_modules/@prisma/client"));
  const prisma = new PrismaClient();
  const stamp = Date.now();
  const created = [];
  const appRowsAdded = [];
  const owner = client();
  const other = client();

  try {
    const ownerEmail = `tools-e2e-${stamp}@test.oyklane.dev`;
    let r = await owner("POST", "/api/auth/register", { name: "Tools Tester", email: ownerEmail, password: "correct-horse-battery", storeName: `Tools E2E ${stamp}`, plan: "growth" });
    check("register store A", r.status === 201, r.data);
    const store = r.data.store;
    created.push({ storeId: store.id, emails: [ownerEmail] });
    const H = store.handle;
    const otherEmail = `tools-e2e-b-${stamp}@test.oyklane.dev`;
    r = await other("POST", "/api/auth/register", { name: "Other Seller", email: otherEmail, password: "correct-horse-battery", storeName: `Tools B ${stamp}`, plan: "growth" });
    check("register store B", r.status === 201, r.data);
    const storeB = r.data.store;
    created.push({ storeId: storeB.id, emails: [otherEmail] });

    // ══ Product page: AI + suggestions ═══════════════════════════════
    r = await owner("GET", "/api/products/tags");
    check("tags list (empty) says AI is available", r.status === 200 && Array.isArray(r.data.tags) && r.data.aiAvailable === true, r.data);
    r = await owner("POST", "/api/categories", { title: "Kurtas" });
    const kurtas = r.data.category;
    await owner("POST", "/api/categories", { title: "Sarees" });
    r = await owner("POST", "/api/products", { title: "Cotton Kurta", status: "active", tags: "Cotton, summer", categoryId: kurtas.id, variants: [{ title: "Default", sku: `TL-${stamp}`, price: 1000, inventoryQuantity: 50 }], images: [{ url: "https://cdn.example.com/kurta.jpg" }] });
    check("product with tags saved", r.status === 201 && r.data.product.tags === "Cotton, summer", r.data);
    const product = r.data.product;
    const variantId = product.variants[0].id;
    r = await owner("GET", "/api/products/tags");
    check("store tags are listed, lower-cased", r.data.tags.map((t) => t.tag).join(",") === "cotton,summer", r.data);

    r = await owner("POST", "/api/products/ai/description", { title: "Indigo kurta", description: "soft kurta", mode: "bullets" });
    const lastAi = mock.calls.ai[mock.calls.ai.length - 1];
    check("AI rewrite: thinking hidden, markdown cleaned, bullets kept", r.status === 200 && r.data.description === "Soft cotton kurta.\n\n• Breathable\n• Hand block printed" && !/think|secret/.test(r.data.description), r.data);
    check("the AI is told the store, the product and the task", lastAi.messages[0].content.includes(store.name) && lastAi.messages[1].content.includes("Indigo kurta") && /bullet/i.test(lastAi.messages[1].content) && lastAi.model === "nvidia/nemotron-3-ultra-550b-a55b", lastAi.messages);
    r = await owner("POST", "/api/products/ai/description", { title: "", description: "" });
    check("AI rewrite needs a title or some words", r.status === 400, r.data);
    r = await owner("POST", "/api/products/ai/description", { title: "x", mode: "poem" });
    check("unknown rewrite mode refused", r.status === 400, r.data);

    r = await owner("POST", "/api/products/ai/suggest", { title: "Indigo cotton kurta for women", tags: ["cotton"] });
    check("AI suggests the existing category and new tags (not ones already added)", r.status === 200 && r.data.category?.id === kurtas.id && r.data.source === "ai" && r.data.tags.includes("festive") && r.data.tags.includes("hand block print") && !r.data.tags.includes("cotton"), r.data);
    r = await owner("POST", "/api/products/ai/suggest", { title: "NOJSON summer kurta" });
    check("when the AI answers badly, words still match a category and tags", r.status === 200 && r.data.source === "words" && r.data.category?.id === kurtas.id && r.data.tags.includes("summer"), r.data);

    // ══ Menus with dropdowns ═════════════════════════════════════════
    r = await owner("GET", "/api/menus");
    const main = (r.data.menus || r.data).find?.((m) => m.handle === "main-menu");
    const items = [
      { label: "Shop", url: "/collections/all", depth: 0 },
      { label: "Kurtas", url: "/collections/kurtas", depth: 1 },
      { label: "Cotton kurtas", url: "/collections/cotton", depth: 2 },
      { label: "Sarees", url: "/collections/sarees", depth: 1 },
      { label: "About", url: "/pages/about", depth: 0 },
      { label: "Too deep", url: "/pages/x", depth: 2 },
    ];
    r = main ? await owner("PATCH", `/api/menus/${main.id}`, { title: "Main menu", items }) : await owner("POST", "/api/menus", { handle: "main-menu", title: "Main menu", items });
    check("menu with sub-links saved", r.status === 200 || r.status === 201, r.data);
    const saved = (r.data.menu || r.data).items;
    check("depths kept, and a link can't sit deeper than one below the link above", saved.map((i) => i.depth).join(",") === "0,1,2,1,0,1", saved);
    r = await sf("GET", `/api/storefront/${H}/render/index`);
    const home = r.data;
    check("the header renders dropdowns, two levels deep", typeof home === "string" && home.includes('class="oy-has-sub"') && (home.match(/class="oy-sub"/g) || []).length >= 3 && home.includes("Cotton kurtas"), typeof home === "string" ? home.slice(0, 300) : home);
    check("dropdown styles are on the page", home.includes(".header__nav li.oy-has-sub>ul.oy-sub"));

    // ══ Customer behaviour across stores ═════════════════════════════
    async function codOrder(handle, vid, { phone, email, name = "Meera Iyer", qty = 1 }) {
      const cart = await sf("POST", `/api/storefront/${handle}/cart/add`, { variantId: vid, quantity: qty });
      const res = await sf("POST", `/api/storefront/${handle}/checkout`, { cartId: cart.data.cart.cartId, email, phone, ...SHIP, shippingName: name, paymentMethod: "cod" });
      return res.data.order;
    }
    r = await other("POST", "/api/products", { title: "Saree", status: "active", variants: [{ title: "Default", sku: `TLB-${stamp}`, price: 2000, inventoryQuantity: 50 }] });
    const variantB = r.data.product.variants[0].id;
    const shopperEmail = `shopper-${stamp}@test.oyklane.dev`;
    const b1 = await codOrder(storeB.handle, variantB, { phone: "+91 98765 00001", email: `other-${stamp}@test.oyklane.dev`, qty: 3 });
    const b2 = await codOrder(storeB.handle, variantB, { phone: "+919876500001", email: shopperEmail });
    const b3 = await codOrder(storeB.handle, variantB, { phone: "09876500001", email: `third-${stamp}@test.oyklane.dev` });
    check("three orders at store B, phone written three ways", b1 && b2 && b3, { b1, b2, b3 });
    r = await other("POST", `/api/orders/${b2.id}/cancel`, { reason: "Customer asked" });
    check("store B cancels one", r.status === 200, r.data);
    // b1: delivered, then 2 of 3 items returned; b3: shipped, came back undelivered.
    const b1Item = (await prisma.orderItem.findFirst({ where: { orderId: b1.id } })).id;
    await prisma.fulfillment.create({ data: { orderId: b1.id, storeId: storeB.id, status: "delivered", items: [{ orderItemId: b1Item, quantity: 3 }], deliveredAt: new Date() } });
    await prisma.returnRequest.create({ data: { orderId: b1.id, storeId: storeB.id, status: "received", items: [{ orderItemId: b1Item, quantity: 2 }], reason: "size" } });
    const b3Item = (await prisma.orderItem.findFirst({ where: { orderId: b3.id } })).id;
    await prisma.fulfillment.create({ data: { orderId: b3.id, storeId: storeB.id, status: "cancelled", items: [{ orderItemId: b3Item, quantity: 1 }] } });

    const a1 = await codOrder(H, variantId, { phone: "9876500001", email: shopperEmail, name: "Meera Iyer" });
    check("store A gets an order from the same shopper", a1 && a1.id, a1);
    r = await owner("GET", `/api/orders/${a1.id}/insights`);
    const ins = r.data.insights;
    check("store A sees the shopper's history at other stores (this order left out)", r.status === 200 && ins.allStores.orders === 3 && ins.otherStores === 1 && ins.thisStore.orders === 0, ins);
    check("…cancellations, returned items and undelivered shipments counted", ins.allStores.cancelled === 1 && ins.allStores.itemsReturned === 2 && ins.allStores.itemsOrdered === 5 && ins.allStores.returnRate === 40 && ins.allStores.undelivered === 1 && ins.allStores.delivered === 1, ins.allStores);
    check("…with a plain verdict", ins.risk.level === "high" && /prepaid/i.test(ins.risk.detail), ins.risk);
    check("…and no other store's name, products or amounts", !JSON.stringify(ins).includes(storeB.name) && !JSON.stringify(ins).includes("Saree") && !JSON.stringify(ins).includes("2000"));
    r = await other("GET", `/api/orders/${b2.id}/insights`);
    check("store B sees the same shopper's order at store A", r.status === 200 && r.data.insights.otherStores === 1 && r.data.insights.allStores.orders === 3, r.data);
    r = await other("GET", `/api/orders/${a1.id}/insights`);
    check("a store can't look up another store's order", r.status === 404, r.data);
    const aCustomer = (await prisma.order.findUnique({ where: { id: a1.id }, select: { customerId: true } })).customerId;
    r = await owner("GET", `/api/customers/${aCustomer}/insights`);
    check("customer page: all 4 orders, 1 here", r.status === 200 && r.data.insights.allStores.orders === 4 && r.data.insights.thisStore.orders === 1, r.data);

    // ══ Live view & visit history ════════════════════════════════════
    r = await sf("POST", `/api/storefront/${H}/account/code`, { email: shopperEmail });
    check("request a sign-in code", r.status === 200, r.data);
    const codeMail = await until(() => prisma.emailLog.findFirst({ where: { to: shopperEmail, template: "sign_in_code" }, orderBy: { createdAt: "desc" } }));
    // The log hides the code from the subject; it's in the email's digit boxes.
    const code = codeMail?.html.match(/>(\d)<\/div>/g)?.map((x) => x[1]).join("");
    check("the code email arrives (code kept out of the logged subject)", /^\d{6}$/.test(code || "") && !codeMail.subject.includes(code), codeMail ? { subject: codeMail.subject } : "no email");
    r = await sf("POST", `/api/storefront/${H}/account/code/verify`, { email: shopperEmail, code });
    check("shopper signs in", r.status === 200 && r.data.token, r.data);
    const shopper = r.data.token;
    await prisma.customer.update({ where: { id: aCustomer }, data: { phone: "9876500001" } });
    r = await sf("GET", `/api/storefront/${H}/render/index?path=/`, undefined, { "x-shopper-token": shopper });
    const visitor = r.headers.get("x-visitor-id");
    r = await sf("GET", `/api/storefront/${H}/render/product?slug=${product.slug}&visitorId=${visitor}&path=/products/${product.slug}`, undefined, { "x-shopper-token": shopper });
    check("signed-in visits are tracked in one session", r.status === 200 && r.headers.get("x-visitor-id") === visitor);
    r = await owner("GET", "/api/analytics/live");
    const live = (r.data.visitors || []).find((v) => v.sessionId === visitor);
    check("Live view shows who it is: name, phone, email", live && live.customerName === "Meera Iyer" && live.phone === "9876500001" && live.email === shopperEmail && live.customerId === aCustomer, live);
    check("…which page, by its product name, and how many pages", live && live.page?.label === "Cotton Kurta" && live.page?.kind === "product" && live.views === 2, live);
    r = await sf("GET", `/api/storefront/${H}/render/index?path=/`);
    const anonymous = r.headers.get("x-visitor-id");
    r = await owner("GET", "/api/analytics/visitors?range=today");
    const hist = r.data.sessions || [];
    const mine = hist.find((s) => s.id === visitor);
    check("visit history keeps signed-in shoppers, not anonymous visitors", r.status === 200 && mine && !hist.some((s) => s.id === anonymous), hist.map((s) => s.id));
    check("…with their details and the pages they saw", mine && mine.customer.phone === "9876500001" && mine.views.length === 2 && mine.productsViewed.includes("Cotton Kurta") && mine.views[0].label === "Home", mine);
    r = await owner("GET", "/api/analytics/visitors?range=today&who=all");
    check("'Everyone' includes anonymous visits", r.data.sessions.some((s) => s.id === anonymous), r.data.total);
    r = await owner("GET", `/api/analytics/visitors?customerId=${aCustomer}&range=90d`);
    check("one customer's visits", r.data.sessions.length >= 1 && r.data.sessions.every((s) => s.customer?.id === aCustomer), r.data);
    r = await other("GET", `/api/analytics/visitors?customerId=${aCustomer}&range=90d`);
    check("another store sees none of them", r.status === 200 && r.data.total === 0, r.data);

    // ══ Email design ═════════════════════════════════════════════════
    r = await owner("GET", "/api/flows/email-design");
    check("email design needs the Flow app", r.status === 402, r.data);
    await owner("POST", "/api/apps/flow/install", { settings: {} });
    r = await owner("GET", "/api/flows/email-design");
    check("default design with icons and a live preview", r.status === 200 && r.data.design.style === "classic" && r.data.icons.length >= 10 && r.data.preview.order.includes("Confirmed") && r.data.preview.flow.includes("THANKYOU10"), r.data.design);
    r = await owner("PUT", "/api/flows/email-design", { accent: "red", style: "banner" });
    check("a colour must be a hex colour", r.status === 400, r.data);
    r = await owner("PUT", "/api/flows/email-design", { accent: "#C8102E", style: "banner", logoUrl: "http://insecure.example.com/l.png" });
    check("the logo must be https", r.status === 400, r.data);
    r = await owner("PUT", "/api/flows/email-design", { accent: "#C8102E", style: "banner", logoUrl: "https://cdn.example.com/logo.png", logoWidth: 140 });
    check("save logo, colour and layout", r.status === 200 && r.data.design.accent === "#C8102E" && r.data.design.style === "banner", r.data);
    r = await owner("POST", "/api/flows/email-design/preview", { accent: "#D7F75B", style: "minimal" });
    check("preview a light colour: dark icons, dark button text", r.status === 200 && r.data.preview.order.includes("check-dark.png") && r.data.preview.order.includes("color:#111114;text-decoration:none"), "");

    const a2 = await codOrder(H, variantId, { phone: "9876500002", email: `designed-${stamp}@test.oyklane.dev`, name: "Kabir" });
    const mail = await until(() => prisma.emailLog.findFirst({ where: { to: `designed-${stamp}@test.oyklane.dev`, template: "order_confirmation" } }));
    check("order confirmation wears the design: colour, logo, banner layout, icon, progress", mail && mail.html.includes("#C8102E") && mail.html.includes("https://cdn.example.com/logo.png") && mail.html.includes('width="140"') && mail.html.includes("/api/email-assets/icons/check.png") && mail.html.includes("Confirmed") && mail.html.includes("Delivered"), mail?.html?.slice(0, 400));
    check("…with the product photo", mail && mail.html.includes("https://cdn.example.com/kurta.jpg"), "");
    void a2;
    r = await fetch(`${API}/api/email-assets/icons/truck.png`);
    check("email icons are served as cached PNGs", r.status === 200 && r.headers.get("content-type") === "image/png" && /immutable/.test(r.headers.get("cache-control") || ""), r.status);
    r = await fetch(`${API}/api/email-assets/icons/../../.env`);
    check("…and nothing else", r.status === 404, r.status);

    r = await owner("POST", "/api/flows", { name: "Thanks", trigger: "order_placed", steps: [{ type: "send_email", subject: "Thanks", body: "Hi", icon: "gift", banner: "https://cdn.example.com/banner.jpg" }] });
    check("a Flow email keeps its icon and banner", r.status === 201 && r.data.flow.steps[0].icon === "gift" && r.data.flow.steps[0].banner === "https://cdn.example.com/banner.jpg", r.data);
    r = await owner("POST", "/api/flows", { name: "Bad", trigger: "order_placed", steps: [{ type: "send_email", subject: "Thanks", body: "Hi", icon: "skull", banner: "http://x.example.com/b.jpg" }] });
    check("unknown icons and non-https banners are dropped", r.status === 201 && r.data.flow.steps[0].icon === "" && r.data.flow.steps[0].banner === "", r.data);
    r = await owner("POST", "/api/flows/preview", { trigger: "order_placed", step: { type: "send_email", subject: "Hi", body: "Hello", icon: "gift", banner: "https://cdn.example.com/banner.jpg" } });
    check("Flow preview shows them", r.status === 200 && r.data.html.includes("gift.png") && r.data.html.includes("banner.jpg") && r.data.html.includes("#C8102E"), "");

    // ══ Instagram feed & Google reviews ══════════════════════════════
    for (const def of [
      { key: "instagram-feed", name: "Instagram Feed", category: "marketing", iconKey: "megaphone" },
      { key: "google-reviews", name: "Google Reviews", category: "marketing", iconKey: "star" },
    ]) {
      if (!(await prisma.app.findUnique({ where: { key: def.key } }))) {
        await prisma.app.create({ data: { ...def, description: "test" } });
        appRowsAdded.push(def.key);
      }
    }
    r = await owner("GET", "/api/social/instagram");
    check("Instagram page needs the app installed", r.status === 402, r.data);
    await owner("POST", "/api/apps/instagram-feed/install", { settings: {} });
    r = await owner("GET", "/api/social/instagram");
    check("not connected; one-click sign-in off without Oyklane's Instagram app", r.status === 200 && r.data.connected === false && r.data.oauth === false, r.data);
    r = await owner("POST", "/api/social/instagram/connect-url");
    check("…so no sign-in link", r.status === 400, r.data);
    r = await owner("POST", "/api/social/instagram/token", { accessToken: "IGAA_GOOD_TOKEN_0000000000" });
    check("no pasting access tokens — sellers sign in instead", r.status === 404, r.status);
    // A store connected through Instagram's own sign-in (60-day token).
    const { encryptSecret, decryptSecret } = require(path.join(ROOT, "apps/api/src/lib/crypto"));
    await prisma.appConnection.create({
      data: { storeId: store.id, appKey: "instagram-feed", credentials: { via: "instagram", accessToken: encryptSecret("IGAA_BAD_TOKEN_0000000000") }, profile: { username: "loomwear.test" }, items: [] },
    });
    r = await owner("POST", "/api/social/instagram/refresh");
    check("a token Instagram refuses is explained", r.status === 200 && /expired|removed/i.test(r.data.error || ""), r.data);
    await prisma.appConnection.update({
      where: { storeId_appKey: { storeId: store.id, appKey: "instagram-feed" } },
      data: { credentials: { via: "instagram", accessToken: encryptSecret("IGAA_GOOD_TOKEN_0000000000") } },
    });
    r = await owner("POST", "/api/social/instagram/refresh");
    check("refresh: profile and posts (bad links dropped, video uses its thumbnail)", r.status === 200 && r.data.connected && !r.data.error && r.data.profile.username === "loomwear.test" && r.data.posts.length === 2 && r.data.posts[1].image === "https://cdn.example.com/2.jpg", r.data);
    check("the token never reaches the admin", !JSON.stringify(r.data).includes("IGAA_GOOD"));
    const igRow = await prisma.appConnection.findUnique({ where: { storeId_appKey: { storeId: store.id, appKey: "instagram-feed" } } });
    check(
      "the renewed 60-day token is stored encrypted",
      String(igRow.credentials.accessToken).startsWith("enc:v1:") && decryptSecret(igRow.credentials.accessToken) === "IGAA_GOOD_TOKEN_0000000000-RENEWED" && igRow.expiresAt && new Date(igRow.expiresAt) > new Date(Date.now() + 50 * 86400000),
      igRow.credentials
    );

    const theme = await prisma.theme.findFirst({ where: { storeId: store.id, isActive: true } });
    r = await owner("GET", `/api/themes/${theme.id}`);
    const editorSections = r.data.platform.sections.map((s) => s.path);
    check("the theme editor offers the Instagram section (installed) but not Google's (not yet)", editorSections.includes("sections/app-instagram-feed.liquid") && !editorSections.includes("sections/app-google-reviews.liquid"), editorSections);

    // Put both app sections on the home page.
    const tplFile = await prisma.themeFile.findFirst({ where: { themeId: theme.id, path: "templates/index.json" } });
    const tpl = JSON.parse(tplFile.content);
    tpl.sections["ig-test"] = { type: "app-instagram-feed", settings: { heading: "On Instagram", layout: "scroll", count: 12, columns: 4, show_profile: true, captions: true, follow_text: "Follow" } };
    tpl.sections["gr-test"] = { type: "app-google-reviews", settings: { heading: "Reviews", layout: "grid", write_text: "Write a review" } };
    tpl.order = ["ig-test", "gr-test", ...tpl.order];
    await prisma.themeFile.update({ where: { id: tplFile.id }, data: { content: JSON.stringify(tpl) } });

    r = await sf("GET", `/api/storefront/${H}/render/index`);
    let page = r.data;
    check("the store shows the Instagram posts", page.includes('class="oy-ig ') && page.includes("https://cdn.example.com/1.jpg") && page.includes("@loomwear.test") && page.includes("https://www.instagram.com/p/AAA/"), page.slice(0, 200));
    check("…with captions escaped", !page.includes("<script>alert(1)</script>") && page.includes("&lt;script&gt;"), "");
    check("Google section stays hidden from shoppers while not connected (no markup, no CSS)", !page.includes('class="oy-gr ') && !page.includes('class="oy-app-hint"') && !page.includes(".oy-gr__card"), "");
    r = await owner("POST", `/api/themes/${theme.id}/render-draft`, { template: "index", templateOverride: tpl });
    check("…but the theme editor shows a setup hint", r.status === 200 && r.data.html.includes("oy-app-hint") && r.data.html.includes("Install the Google Reviews app"), r.data?.html?.slice?.(0, 200));

    r = await owner("GET", "/api/social/google-reviews");
    check("Google page needs the app installed", r.status === 402, r.data);
    await owner("POST", "/api/apps/google-reviews/install", { settings: {} });
    r = await owner("POST", "/api/social/google-reviews/search", { query: "Loomwear Pune" });
    check("find the business on Google", r.status === 200 && r.data.places[0].id === "ChIJtestplace0001" && r.data.places[0].total === 87, r.data);
    check("…sending Oyklane's key and only the fields needed", mock.calls.google.at(-1).key === "test-places-key" && /places\.id/.test(mock.calls.google.at(-1).mask));
    r = await owner("POST", "/api/social/google-reviews/connect", { placeId: "bad id!" });
    check("an invalid place id is refused", r.status === 400, r.data);
    r = await owner("POST", "/api/social/google-reviews/connect", { placeId: "ChIJtestplace0001" });
    check("connect it: rating, count and reviews", r.status === 200 && r.data.connected && r.data.profile.rating === 4.6 && r.data.profile.total === 87 && r.data.reviews.length === 4, r.data);

    r = await sf("GET", `/api/storefront/${H}/render/index`);
    page = r.data;
    const reviewBlock = page.slice(page.indexOf('class="oy-gr '));
    check("the store shows the rating and 4★+ reviews by default", page.includes('class="oy-gr ') && reviewBlock.includes("4.6") && reviewBlock.includes("87 Google reviews") && reviewBlock.includes("Rahul K") && !reviewBlock.includes("Unhappy Person"), reviewBlock.slice(0, 300));
    check("…review text escaped, Google credited, write-a-review link", reviewBlock.includes("Lovely &lt;b&gt;fabric&lt;/b&gt;") && reviewBlock.includes("Reviews from") && reviewBlock.includes("writereview?placeid=ChIJtestplace0001"), "");
    await owner("POST", "/api/apps/google-reviews/install", { settings: { minRating: "5" } });
    r = await sf("GET", `/api/storefront/${H}/render/index`);
    const fiveOnly = r.data.slice(r.data.indexOf('class="oy-gr '));
    check("'5 stars only' hides the 4-star review", fiveOnly.includes("Meera I") && !fiveOnly.includes("Rahul K"), "");

    r = await owner("DELETE", "/api/social/google-reviews");
    r = await sf("GET", `/api/storefront/${H}/render/index`);
    check("disconnected: the section disappears", !r.data.includes('class="oy-gr '), "");
    r = await other("GET", "/api/social/instagram");
    check("another store doesn't see this Instagram (not installed there)", r.status === 402, r.data);
    await owner("POST", "/api/apps/instagram-feed/uninstall");
    const gone = await prisma.appConnection.findUnique({ where: { storeId_appKey: { storeId: store.id, appKey: "instagram-feed" } } });
    check("uninstalling Instagram deletes its stored token", gone === null, gone);
    r = await sf("GET", `/api/storefront/${H}/render/index`);
    check("…and the feed leaves the store", !r.data.includes('class="oy-ig '), "");
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

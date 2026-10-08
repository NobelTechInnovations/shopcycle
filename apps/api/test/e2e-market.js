/**
 * Oyklane Store, end to end against a real API, the shared database and a
 * mock Razorpay: a developer signs up (own session — not a seller's) ·
 * lists a paid theme · a broken zip is refused, a real one is checked and
 * previews on the demo store (all pages) · review · it's listed · a seller
 * can't install before paying · fake payments are refused (bad signature,
 * wrong amount) · a real one licenses the store and records the
 * developer's share · the installed copy is locked · a developer app
 * installs with an API key of its permissions, and loses it on removal ·
 * payout.
 *
 * Throwaway stores, developer and catalog row are deleted at the end.
 */
const path = require("path");
const fs = require("fs");
const http = require("http");
const crypto = require("crypto");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "../../..");
require(path.join(ROOT, "apps/api/node_modules/dotenv")).config({ path: path.join(ROOT, ".env") });
const { zipSync, strToU8 } = require(path.join(ROOT, "apps/api/node_modules/fflate"));

const API_PORT = 4198;
const MOCK_PORT = 4197;
const API = `http://localhost:${API_PORT}`;
const ORIGIN = process.env.ADMIN_ORIGIN || "http://localhost:3000";
const KEY_SECRET = "mock_secret_market";
const stamp = Date.now();
const DEMO = `mkt-demo-${stamp}`;
Object.assign(process.env, {
  SMTP_HOST: "",
  EMAIL_PROVIDER: "log",
  SMS_PROVIDER: "log",
  WHATSAPP_PROVIDER: "log",
  MEDIA_STORAGE: "database",
  RAZORPAY_KEY_ID: "rzp_test_mock",
  RAZORPAY_KEY_SECRET: KEY_SECRET,
  RAZORPAY_WEBHOOK_SECRET: "mock_webhook",
  RAZORPAY_API_URL: `http://localhost:${MOCK_PORT}/v1`,
  BILLING_SANDBOX: "false",
  MARKET_DEMO_STORE: DEMO,
});

let pass = 0;
let fail = 0;
function check(label, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${label}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${label}${detail !== undefined ? `  -- ${typeof detail === "string" ? detail.slice(0, 600) : JSON.stringify(detail).slice(0, 600)}` : ""}`);
  }
}

function client({ bearer } = {}) {
  const jar = {};
  const fn = async function call(method, url, body, { form } = {}) {
    const res = await fetch(`${API}${url}`, {
      method,
      headers: {
        ...(body !== undefined && !form && { "content-type": "application/json" }),
        ...(method !== "GET" && { origin: ORIGIN }),
        ...(fn.bearer && { authorization: `Bearer ${fn.bearer}` }),
        cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; "),
      },
      body: form || (body !== undefined ? JSON.stringify(body) : undefined),
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
    return { status: res.status, data };
  };
  fn.bearer = bearer || null;
  return fn;
}

// ── Mock Razorpay: orders and the payments we say were made ──
const payments = new Map();
const orders = new Map();
function startMock() {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      if (req.method === "POST" && req.url === "/v1/orders") {
        const b = JSON.parse(body || "{}");
        const id = `order_mkt${crypto.randomBytes(4).toString("hex")}`;
        orders.set(id, b.amount);
        return res.end(JSON.stringify({ id, amount: b.amount, currency: "INR" }));
      }
      const m = req.url.match(/^\/v1\/payments\/([^/?]+)/);
      if (req.method === "GET" && m && payments.has(m[1])) return res.end(JSON.stringify(payments.get(m[1])));
      res.statusCode = 404;
      res.end(JSON.stringify({ error: { description: "not found" } }));
    });
  });
  return new Promise((r) => server.listen(MOCK_PORT, () => r(server)));
}

async function startApi() {
  const child = spawn(process.execPath, [path.join(ROOT, "apps/api/src/server.js")], {
    cwd: path.join(ROOT, "apps/api"),
    env: { ...process.env, API_PORT: String(API_PORT), NODE_ENV: "test", JOBS_DISABLED: "true" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(`${API}/health`)).ok) return { child, log: () => log };
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error(`API did not start:\n${log}`);
}

/** A theme folder as a .zip (in a wrapper folder, as people zip them). */
function zipTheme(dir, { drop } = {}) {
  const files = {};
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), r);
      else if (r !== drop) files[`my-theme/${r}`] = strToU8(fs.readFileSync(path.join(d, e.name), "utf8"));
    }
  };
  walk(dir, "");
  return Buffer.from(zipSync(files));
}

function form(fields, file) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields || {})) fd.append(k, v);
  if (file) fd.append("file", new Blob([file.buffer], { type: file.type }), file.name);
  return fd;
}

// 1×1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function main() {
  const { prisma } = require(path.join(ROOT, "packages/database/src/client.js"));
  const mock = await startMock();
  const api = await startApi();
  const seller = client();
  const demoOwner = client();
  const dev = client();
  const emails = [`mkt-seller-${stamp}@test.oyklane.dev`, `mkt-demo-${stamp}@test.oyklane.dev`];
  const devEmail = `mkt-dev-${stamp}@test.oyklane.dev`;
  const storeIds = [];
  let appKey = null;

  try {
    let r = await seller("POST", "/api/auth/register", { name: "Seller", email: emails[0], password: "correct-horse-battery", storeName: `Mkt Seller ${stamp}`, plan: "growth" });
    check("seller store", r.status === 201, r.data);
    const store = r.data.store;
    storeIds.push(store.id);
    r = await demoOwner("POST", "/api/auth/register", { name: "Demo", email: emails[1], password: "correct-horse-battery", storeName: `mkt demo ${stamp}`, plan: "growth" });
    check("demo store", r.status === 201 && r.data.store.handle === DEMO, r.data.store?.handle);
    storeIds.push(r.data.store.id);
    await prisma.product.create({ data: { storeId: r.data.store.id, title: "Demo Tee", slug: "demo-tee", status: "active", variants: { create: [{ title: "Default", price: 499, inventoryQuantity: 5 }] } } }).catch(() => {});

    // ── Developer account ──
    r = await dev("POST", "/api/partners/register", { name: "Dev Studio", email: devEmail, password: "dev-password-123", company: "Pixel Studio" });
    check("developer signs up", r.status === 201 && Boolean(r.data.token), r.data);
    dev.bearer = r.data.token;
    r = await dev("GET", "/api/partners/me");
    check("…and is signed in with their token", r.status === 200 && r.data.partner.email === devEmail, r.data);
    r = await seller("GET", "/api/partners/me");
    check("a seller session isn't a developer session", r.status === 401, r.status);
    r = await client({ bearer: dev.bearer })("GET", "/api/orders");
    check("a developer token isn't a seller session", r.status === 401, r.status);
    r = await dev("POST", "/api/partners/login", { email: devEmail, password: "wrong-password" });
    check("wrong password refused", r.status === 401, r.status);

    // ── A paid theme ──
    r = await dev("POST", "/api/partners/listings", { kind: "theme", name: `Spice Market ${stamp}`, price: 50, category: "food" });
    check("paid below ₹99 refused", r.status === 400, r.data);
    r = await dev("POST", "/api/partners/listings", { kind: "theme", name: `Spice Market ${stamp}`, price: 499, category: "food", tagline: "For spice and grocery shops" });
    check("theme listing created", r.status === 201 && r.data.listing.status === "draft", r.data);
    const listing = r.data.listing;
    r = await dev("POST", "/api/partners/media", undefined, { form: form({}, { buffer: PNG, type: "image/png", name: "shot.png" }) });
    check("screenshot uploaded", r.status === 200 && /\/api\/market\/media\//.test(r.data.url || ""), r.data);
    const shot = r.data.id;
    r = await dev("POST", `/api/partners/listings/${listing.id}/versions`, undefined, { form: form({ version: "1.0.0" }, { buffer: zipTheme(path.join(ROOT, "themes/fresh"), { drop: "layout/theme.liquid" }), type: "application/zip", name: "theme.zip" }) });
    check("a theme missing its layout is refused", r.status === 400 && /layout\/theme\.liquid is missing/.test(r.data.error || ""), r.data);
    r = await dev("POST", `/api/partners/listings/${listing.id}/versions`, undefined, { form: form({ version: "1.0.0", changelog: "First release" }, { buffer: zipTheme(path.join(ROOT, "themes/fresh")), type: "application/zip", name: "theme.zip" }) });
    check("theme zip checked and stored", r.status === 201 && r.data.version.files > 20, r.data);
    const pv = await prisma.marketListing.findUnique({ where: { id: listing.id } });
    check("…and previews on the demo store", Boolean(pv.previewThemeId));
    r = await demoOwner("GET", "/api/themes");
    check("the preview isn't one of the demo store's themes", !(r.data.themes || []).some((t) => t.id === pv.previewThemeId), (r.data.themes || []).map((t) => t.name));
    r = await seller("GET", `/api/storefront/${DEMO}/render/index?themeId=${pv.previewThemeId}`);
    check("preview renders (home)", r.status === 200 && /<html/i.test(String(r.data)), String(r.data).slice(0, 200));
    r = await seller("GET", `/api/storefront/${DEMO}/render/collection?slug=all&themeId=${pv.previewThemeId}`);
    check("preview renders (collection)", r.status === 200, r.status);

    r = await dev("POST", `/api/partners/listings/${listing.id}/submit`);
    check("review needs a description, screenshots and payout UPI", r.status === 400 && /description/.test(r.data.error) && /payout/.test(r.data.error), r.data);
    await dev("PATCH", `/api/partners/listings/${listing.id}`, { description: "A warm, fast theme for spice and grocery shops — category circles, deals of the day, and one-tap add.".repeat(2), screenshots: [shot] });
    await dev("PATCH", "/api/partners/me", { payoutUpi: "pixel@okhdfcbank", payoutName: "Pixel Studio" });
    r = await dev("POST", `/api/partners/listings/${listing.id}/submit`);
    check("sent for review", r.status === 200, r.data);
    r = await seller("GET", "/api/market/public/browse?kind=theme");
    check("not listed while in review", !r.data.items.some((i) => i.id === listing.id) && r.data.items.some((i) => i.slug === "fresh" && i.official), r.data.items?.length);

    const market = require(path.join(ROOT, "apps/api/src/modules/market/service.js"));
    const version = await prisma.marketVersion.findFirst({ where: { listingId: listing.id, status: "in_review" } });
    await market.decide(prisma, version.id, { approve: true });
    r = await seller("GET", "/api/market/public/browse?kind=theme&price=paid");
    check("approved → listed", r.data.items.some((i) => i.id === listing.id && i.price === 499), r.data.items?.map((i) => i.name));
    r = await seller("GET", `/api/market/public/theme/${listing.slug}`);
    check("its page: preview links on the demo store, every page", r.status === 200 && r.data.preview?.themeId && r.data.pages.some((p) => p.key === "product") && r.data.pages.some((p) => p.key === "cart"), r.data.pages);

    // ── Seller buys ──
    r = await seller("GET", `/api/market/store/theme/${listing.slug}`);
    check("seller sees price + GST", r.status === 200 && r.data.owned === false && r.data.price.total > 499, r.data.price);
    r = await seller("POST", `/api/market/store/themes/${listing.slug}/install`, {});
    check("can't install before paying", r.status === 402, r.data);
    r = await seller("POST", `/api/market/store/themes/${listing.slug}/buy`, {});
    check("checkout started", r.status === 200 && r.data.checkout?.order_id, r.data);
    const orderId = r.data.checkout.order_id;
    const sig = (o, p) => crypto.createHmac("sha256", KEY_SECRET).update(`${o}|${p}`).digest("hex");
    r = await seller("POST", "/api/market/store/verify", { orderId, paymentId: "pay_fake1", signature: "deadbeef" });
    check("fake signature refused", r.status === 400, r.data);
    payments.set("pay_cheap", { id: "pay_cheap", order_id: orderId, status: "captured", amount: 100 });
    r = await seller("POST", "/api/market/store/verify", { orderId, paymentId: "pay_cheap", signature: sig(orderId, "pay_cheap") });
    check("a payment for less is refused", r.status === 400, r.data);
    payments.set("pay_real", { id: "pay_real", order_id: orderId, status: "captured", amount: orders.get(orderId) });
    r = await seller("POST", "/api/market/store/verify", { orderId, paymentId: "pay_real", signature: sig(orderId, "pay_real") });
    check("a real payment licenses the store", r.status === 200 && r.data.owned === true, r.data);
    const earning = await prisma.partnerEarning.findFirst({ where: { listingId: listing.id } });
    check("developer's 80% recorded", earning && Number(earning.share) === 399.2, earning && Number(earning.share));
    r = await seller("POST", "/api/market/store/verify", { orderId, paymentId: "pay_real", signature: sig(orderId, "pay_real") });
    check("verifying again changes nothing", r.status === 200 && (await prisma.partnerEarning.count({ where: { listingId: listing.id } })) === 1);

    r = await seller("POST", `/api/market/store/themes/${listing.slug}/install`, {});
    check("installed", r.status === 200 && r.data.themeId, r.data);
    const themeId = r.data.themeId;
    r = await seller("GET", `/api/themes/${themeId}`);
    const files = r.data.theme?.files || [];
    const section = files.find((f) => f.path.startsWith("sections/") && f.path.endsWith(".liquid"));
    check("installed copy is locked: code hidden, schema kept", r.data.theme.locked && section && /^\{%-?\s*schema/.test(section.content) && !files.find((f) => f.path === "assets/theme.css")?.content, section?.content?.slice(0, 80));
    r = await seller("PATCH", `/api/themes/${themeId}/files`, { path: "layout/theme.liquid", content: "stolen" });
    check("its code can't be changed", r.status === 403, r.status);
    r = await seller("PATCH", `/api/themes/${themeId}/files`, { path: "templates/index.json", content: JSON.stringify({ sections: {}, order: [] }) });
    check("…but its layouts can", r.status === 200, r.data);

    // ── A developer app ──
    r = await dev("POST", "/api/partners/listings", { kind: "app", name: `Review Pal ${stamp}`, price: 0, category: "reviews", scopes: ["read_products", "read_orders"], appUrl: "https://example.invalid/app", installWebhook: "https://example.invalid/hook" });
    const appListing = r.data.listing;
    check("app listing", r.status === 201, r.data);
    await dev("PATCH", `/api/partners/listings/${appListing.id}`, { description: "Collects reviews after delivery and shows them on product pages, with photos and replies.".repeat(2), screenshots: [shot] });
    await dev("POST", `/api/partners/listings/${appListing.id}/versions`, { version: "1.0.0" });
    await dev("POST", `/api/partners/listings/${appListing.id}/submit`);
    const appVersion = await prisma.marketVersion.findFirst({ where: { listingId: appListing.id, status: "in_review" } });
    await market.decide(prisma, appVersion.id, { approve: true });
    appKey = `mkt-${appListing.slug}`;
    r = await seller("GET", "/api/apps");
    check("approved app is in every store's Apps", (r.data.apps || []).some((a) => a.key === appKey && a.marketplace), (r.data.apps || []).length);
    r = await seller("POST", `/api/apps/${appKey}/install`, { settings: {} });
    check("seller installs it", r.status === 200 || r.status === 201, r.data);
    const lic = await prisma.marketLicense.findFirst({ where: { listingId: appListing.id, storeId: store.id } });
    const key = lic?.apiKeyId ? await prisma.apiKey.findUnique({ where: { id: lic.apiKeyId } }) : null;
    check("…an API key with just its permissions", key && !key.revokedAt && key.scopes.join() === "read_products,read_orders", key?.scopes);
    r = await seller("GET", `/api/market/store/apps/${appKey}/open`);
    check("'Open' is a signed link", r.status === 200 && /store=.*&ts=\d+&signature=[a-f0-9]{64}/.test(r.data.url), r.data);
    r = await seller("POST", `/api/apps/${appKey}/uninstall`);
    check("removing it revokes the key", Boolean((await prisma.apiKey.findUnique({ where: { id: key.id } })).revokedAt), r.data);

    // ── Payout ──
    const partner = await prisma.partner.findUnique({ where: { email: devEmail } });
    r = await dev("GET", "/api/partners/overview");
    check("developer sees ₹399.20 owed", r.data.earnings.owed === 399.2, r.data.earnings);
    await market.recordPayout(prisma, partner.id, { reference: "UTR123" });
    r = await dev("GET", "/api/partners/overview");
    check("paid out", r.data.earnings.owed === 0 && r.data.earnings.payouts[0]?.amount === 399.2, r.data.earnings);
  } catch (err) {
    fail += 1;
    console.log(`FAIL  unexpected error: ${err.stack || err}`);
    console.log(api.log().slice(-3000));
  } finally {
    for (const id of storeIds) await prisma.store.delete({ where: { id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { email: { in: emails } } }).catch(() => {});
    const partner = await prisma.partner.findUnique({ where: { email: devEmail } }).catch(() => null);
    if (partner) {
      await prisma.marketMedia.deleteMany({ where: { partnerId: partner.id } }).catch(() => {});
      await prisma.partner.delete({ where: { id: partner.id } }).catch(() => {});
    }
    if (appKey) await prisma.app.delete({ where: { key: appKey } }).catch(() => {});
    await prisma.emailLog.deleteMany({ where: { to: { endsWith: "@test.oyklane.dev" } } }).catch(() => {});
    console.log("      (test stores, developer, listings and catalog row deleted)");
    await prisma.$disconnect();
    api.child.kill();
    mock.close();
  }
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();

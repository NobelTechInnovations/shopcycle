#!/usr/bin/env node
/**
 * End-to-end test of the growth phase, against a real API instance:
 *
 *   shopper passwords (sign-up, sign-in, change, forgotten → code) ·
 *   unverified accounts only see their own signed-in orders · gift cards
 *   (issue, apply, partial and full payment, refunds back to the card,
 *   cancelling an unpaid order) · blog posts · SEO preferences · robots,
 *   sitemap, newsletter · admin search · product bulk actions · cart
 *   drawer JSON config · placeholder cards on an empty store · platform
 *   overview is super-admin only
 *
 *   node apps/api/test/e2e-growth.js
 *
 * Creates throwaway stores and deletes them when done, pass or fail.
 */
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { startGatewaysMock } = require("./gateways-mock");

const ROOT = path.resolve(__dirname, "../../..");
require(path.join(ROOT, "apps/api/node_modules/dotenv")).config({ path: path.join(ROOT, ".env") });
// Tests never send real email/SMS or upload to a media CDN (this process and the API it starts).
Object.assign(process.env, { SMTP_HOST: "", EMAIL_PROVIDER: "log", SMS_PROVIDER: "log", WHATSAPP_PROVIDER: "log", MEDIA_STORAGE: "database" });

const API_PORT = 4199;
const API = `http://localhost:${API_PORT}`;
const MOCK_PORT = 4296;
const MOCK = `http://localhost:${MOCK_PORT}`;
const ORIGIN = process.env.ADMIN_ORIGIN || "http://localhost:3000";

// Shared production database: the session pooler (:5432) allows only 15
// clients in total, so tests use the transaction pooler (:6543).
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
    console.log(`FAIL  ${label}${detail !== undefined ? `  -- ${typeof detail === "string" ? detail.slice(0, 600) : JSON.stringify(detail).slice(0, 600)}` : ""}`);
  }
}

function client() {
  const jar = {};
  return async function call(method, url, body, headers = {}) {
    const res = await fetch(`${API}${url}`, {
      method,
      headers: {
        ...(body !== undefined && { "content-type": "application/json" }),
        ...(method !== "GET" && { origin: ORIGIN }),
        cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; "),
        ...headers,
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
    return { status: res.status, data };
  };
}

// Storefront calls come from the storefront server: no Origin, no cookies.
async function sf(method, url, body, headers = {}) {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: { ...(body !== undefined && { "content-type": "application/json" }), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
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
      SMTP_HOST: "",
      RAZORPAY_KEY_ID: "",
      RAZORPAY_KEY_SECRET: "",
      CASHFREE_API_URL: `${MOCK}/pg`,
      STRIPE_API_URL: MOCK,
      PAYPAL_API_URL: MOCK,
      PAYU_API_URL: `${MOCK}/payu`,
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

const SHIP = {
  phone: "9876543210",
  shippingName: "Growth Shopper",
  shippingAddress1: "7 Park Street",
  shippingCity: "Kolkata",
  shippingProvince: "WB",
  shippingZip: "700016",
  shippingCountry: "IN",
};

async function main() {
  const { server: mock } = await startGatewaysMock(MOCK_PORT);
  const api = await startApi();
  const { PrismaClient } = require(path.join(ROOT, "packages/database/node_modules/@prisma/client"));
  const prisma = new PrismaClient();
  const stamp = Date.now();
  const created = [];
  const owner = client();

  try {
    // ── Setup: a store with one product ──
    const ownerEmail = `growth-e2e-${stamp}@test.oyklane.dev`;
    let r = await owner("POST", "/api/auth/register", { name: "Growth Test", email: ownerEmail, password: "correct-horse-battery", storeName: `Growth E2E ${stamp}`, plan: "growth" });
    check("register a store", r.status === 201, r.data);
    const store = r.data.store;
    created.push({ storeId: store.id, emails: [ownerEmail] });
    const H = store.handle;

    // An empty store's home page still shows product slots (example cards).
    r = await sf("GET", `/api/storefront/${H}/render/index`);
    check("empty store home shows placeholder illustrations", r.status === 200 && String(r.data).includes("placeholder-svg"), String(r.data).slice(0, 200));
    check("cart drawer is on by default (config on the page)", String(r.data).includes('id="oy-cart-config"') && String(r.data).includes("cart-drawer.js"));
    r = await sf("GET", `/api/storefront/${H}/render/cart`);
    check("no cart drawer on the cart page itself", !String(r.data).includes('id="oy-cart-config"'));

    r = await owner("POST", "/api/products", { title: "Linen Shirt", status: "active", variants: [{ title: "Default", sku: `LIN-${stamp}`, price: 1000, inventoryQuantity: 50 }] });
    check("create product", r.status === 201 || r.status === 200, r.data);
    const product = r.data.product;
    const variantId = product.variants[0].id;

    async function freshCart(qty = 1) {
      const res = await sf("POST", `/api/storefront/${H}/cart/add`, { variantId, quantity: qty });
      return res.data.cart.cartId;
    }

    // ── Shopper accounts with passwords ──
    const shopperEmail = `buyer-${stamp}@test.oyklane.dev`;
    r = await sf("POST", `/api/storefront/${H}/account/register`, { name: "Asha Rao", email: shopperEmail, password: "short" });
    check("sign-up refuses a short password", r.status === 400, r.data);
    r = await sf("POST", `/api/storefront/${H}/account/register`, { name: "Asha Rao", email: shopperEmail.toUpperCase(), password: "garden-lamp-42", acceptsMarketing: true });
    check("shopper signs up with a password", r.status === 201 && typeof r.data.token === "string", r.data);
    let token = r.data.token;
    const customer = await prisma.customer.findFirst({ where: { storeId: store.id, email: shopperEmail } });
    check("account stored lowercase, password hashed, consent kept", customer && customer.passwordHash?.startsWith("$2") && customer.acceptsEmailMarketing === true && !customer.emailVerifiedAt, customer);
    r = await sf("POST", `/api/storefront/${H}/account/register`, { name: "Someone", email: shopperEmail, password: "another-pass-1" });
    check("second sign-up with the same email refused", r.status === 409, r.data);
    r = await sf("POST", `/api/storefront/${H}/account/password-login`, { email: shopperEmail, password: "wrong-password" });
    check("wrong password refused", r.status === 400 && /incorrect/i.test(r.data.error), r.data);
    r = await sf("POST", `/api/storefront/${H}/account/password-login`, { email: "nobody-here@test.oyklane.dev", password: "garden-lamp-42" });
    check("unknown email gives the same answer", r.status === 400 && /incorrect/i.test(r.data.error), r.data);
    r = await sf("POST", `/api/storefront/${H}/account/password-login`, { email: shopperEmail, password: "garden-lamp-42" });
    check("password sign-in works", r.status === 200 && r.data.token, r.data);
    const otherDevice = r.data.token;

    // Orders: one placed signed in, one placed as a guest with the same email.
    let cartId = await freshCart();
    r = await sf("POST", `/api/storefront/${H}/checkout`, { cartId, email: shopperEmail, ...SHIP, paymentMethod: "cod" }, { "x-shopper-token": token });
    check("signed-in checkout", r.status === 201, r.data);
    const signedInOrder = r.data.order;
    check("order marked as placed signed in", (await prisma.order.findUnique({ where: { id: signedInOrder.id } })).placedSignedIn === true);
    cartId = await freshCart();
    r = await sf("POST", `/api/storefront/${H}/checkout`, { cartId, email: shopperEmail, ...SHIP, shippingName: "Someone Else", shippingAddress1: "99 Other Road", paymentMethod: "cod" });
    check("guest checkout with the account's email still works", r.status === 201, r.data);
    const guestOrder = r.data.order;
    const after = await prisma.customer.findUnique({ where: { id: customer.id } });
    check("guest checkout doesn't change the account's saved address", after.address1 === "7 Park Street" && after.name === "Growth Shopper", after);
    r = await sf("GET", `/api/storefront/${H}/render/account`, undefined, { "x-shopper-token": token });
    const acct = String(r.data);
    check("unverified account shows its signed-in order", acct.includes(`#${signedInOrder.orderNumber}`), acct.slice(0, 300));
    check("…but not the guest order placed with its email", !acct.includes(`#${guestOrder.orderNumber}`));
    check("account page: summary tiles, tabs and order cards with a track link", acct.includes("sys-acct__tiles") && acct.includes('data-sys-tabs') && acct.includes("sys-ocard") && /Track order|View order/.test(acct), acct.slice(0, 300));

    // Someone who has ordered as a guest can't claim the email by signing up.
    cartId = await freshCart();
    await sf("POST", `/api/storefront/${H}/checkout`, { cartId, email: `guest-${stamp}@test.oyklane.dev`, ...SHIP, paymentMethod: "cod" });
    r = await sf("POST", `/api/storefront/${H}/account/register`, { name: "Claimer", email: `guest-${stamp}@test.oyklane.dev`, password: "claim-it-now-1" });
    check("sign-up over a guest with orders needs an email code first", r.status === 409 && /code/i.test(r.data.error), r.data);

    r = await sf("POST", `/api/storefront/${H}/account/password`, { password: "new-garden-lamp" }, { "x-shopper-token": token });
    check("changing the password needs the current one", r.status === 400, r.data);
    r = await sf("POST", `/api/storefront/${H}/account/password`, { currentPassword: "garden-lamp-42", password: "new-garden-lamp" }, { "x-shopper-token": token });
    check("password changed", r.status === 200 && r.data.token, r.data);
    const newToken = r.data.token;
    r = await sf("POST", `/api/storefront/${H}/account/profile`, { name: "Asha Rao" }, { "x-shopper-token": otherDevice });
    check("other devices are signed out", r.status === 401, r.data);
    r = await sf("POST", `/api/storefront/${H}/account/profile`, { name: "Asha Rao" }, { "x-shopper-token": newToken });
    check("this device keeps working with the new session", r.status === 200, r.data);
    r = await sf("POST", `/api/storefront/${H}/account/password-login`, { email: shopperEmail, password: "new-garden-lamp" });
    check("new password signs in", r.status === 200, r.data);

    // Forgotten password: sign in by code, then set a new one without the old.
    r = await sf("POST", `/api/storefront/${H}/account/code`, { email: shopperEmail });
    const codeMail = await prisma.emailLog.findFirst({ where: { storeId: store.id, template: "sign_in_code", to: shopperEmail }, orderBy: { createdAt: "desc" } });
    // The code is laid out one digit per cell.
    const code = String(codeMail?.html || "").match(/>(\d)<\/div><\/td>/g)?.map((m) => m[1]).join("");
    r = await sf("POST", `/api/storefront/${H}/account/code/verify`, { email: shopperEmail, code });
    check("sign in by emailed code", r.status === 200 && r.data.token, r.data);
    const codeToken = r.data.token;
    check("a code sign-in verifies the email", Boolean((await prisma.customer.findUnique({ where: { id: customer.id } })).emailVerifiedAt));
    r = await sf("POST", `/api/storefront/${H}/account/password`, { password: "reset-by-code-1" }, { "x-shopper-token": codeToken });
    check("after a code sign-in, a new password needs no old one", r.status === 200, r.data);
    r = await sf("GET", `/api/storefront/${H}/render/account`, undefined, { "x-shopper-token": r.data.token });
    check("once verified, the account shows every order with its email", String(r.data).includes(`#${guestOrder.orderNumber}`));

    // ── Gift cards ──
    r = await owner("POST", "/api/gift-cards", { amount: 300, note: "Goodwill" });
    check("issue a ₹300 gift card", r.status === 201 && /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/.test(r.data.code), r.data);
    const small = r.data;
    const stored = await prisma.giftCard.findUnique({ where: { id: small.card.id } });
    check("only a hash and the last 4 are stored", stored.codeHash.length === 64 && !JSON.stringify(stored).includes(small.code.replace(/-/g, "")) && stored.last4 === small.code.slice(-4), stored);
    r = await owner("GET", `/api/gift-cards/${small.card.id}`);
    check("admin never sees the full code again", !JSON.stringify(r.data).includes(small.code.replace(/-/g, "")) && r.data.giftCard.transactions.length === 1, r.data);

    cartId = await freshCart(2); // ₹2,000
    r = await sf("POST", `/api/storefront/${H}/cart/gift-card`, { cartId, code: "ABCD-EFGH-JKLM-NPQR" });
    check("a wrong code is refused", r.status === 400, r.data);
    r = await sf("POST", `/api/storefront/${H}/cart/gift-card`, { cartId, code: small.code.toLowerCase().replace(/-/g, " ") });
    check("apply the card (any case, spaces)", r.status === 200 && r.data.cart.gift_card?.amount === 300, r.data.cart?.gift_card);
    const total = r.data.cart.total;
    check("cart shows what's left to pay", r.data.cart.due === Math.round((total - 300) * 100) / 100, { total, due: r.data.cart.due });
    r = await sf("POST", `/api/storefront/${H}/checkout`, { cartId, email: `gc-${stamp}@test.oyklane.dev`, ...SHIP, paymentMethod: "cod" });
    check("checkout with card + cash on delivery", r.status === 201 && r.data.order.paymentMethod === "cod", r.data);
    const partOrder = await prisma.order.findUnique({ where: { id: r.data.order.id } });
    check("order records ₹300 paid by gift card", Number(partOrder.giftCardAmount) === 300 && partOrder.giftCardId === small.card.id, partOrder);
    check("card balance spent to ₹0", Number((await prisma.giftCard.findUnique({ where: { id: small.card.id } })).balance) === 0);
    r = await sf("POST", `/api/storefront/${H}/cart/gift-card`, { cartId: await freshCart(), code: small.code });
    check("a used-up card is refused", r.status === 400 && /no balance/i.test(r.data.error), r.data);

    // Refund part of it: back onto the card first, then the rest by hand.
    await owner("POST", `/api/orders/${partOrder.id}/mark-paid`);
    r = await owner("POST", `/api/orders/${partOrder.id}/refunds`, { amount: 500, reason: "Changed mind" });
    check("refund ₹500 on a card-and-cash order", r.status === 201 || r.status === 200, r.data);
    const refunds = await prisma.refund.findMany({ where: { orderId: partOrder.id }, orderBy: { createdAt: "asc" } });
    check("₹300 back to the gift card, ₹200 paid back manually", refunds.length === 2 && refunds.some((x) => x.method === "gift_card" && Number(x.amount) === 300) && refunds.some((x) => x.method === "manual" && Number(x.amount) === 200), refunds);
    check("card balance restored to ₹300", Number((await prisma.giftCard.findUnique({ where: { id: small.card.id } })).balance) === 300);
    const refundMail = await prisma.emailLog.findFirst({ where: { storeId: store.id, template: "refund_issued" }, orderBy: { createdAt: "desc" } });
    check("refund email explains the split", /back on your gift card/i.test(refundMail?.html || "") && /paid back to you directly/i.test(refundMail?.html || ""), refundMail?.html?.slice(0, 400));

    // A card that covers everything: no payment step at all.
    r = await owner("POST", "/api/gift-cards", { amount: 5000 });
    const big = r.data;
    cartId = await freshCart(1);
    await sf("POST", `/api/storefront/${H}/cart/gift-card`, { cartId, code: big.code });
    r = await sf("POST", `/api/storefront/${H}/checkout`, { cartId, email: `gc2-${stamp}@test.oyklane.dev`, ...SHIP, paymentMethod: "gift_card" });
    check("fully covered order placed", r.status === 201, r.data);
    const fullOrder = await prisma.order.findUnique({ where: { id: r.data.order.id } });
    check("…paid by gift card, nothing to collect", fullOrder.paymentMethod === "gift_card" && fullOrder.paymentStatus === "paid", fullOrder);
    cartId = await freshCart(1);
    r = await sf("POST", `/api/storefront/${H}/checkout`, { cartId, email: `gc3-${stamp}@test.oyklane.dev`, ...SHIP, paymentMethod: "gift_card" });
    check("'gift_card' payment refused when no card covers the order", r.status === 400, r.data);

    // Cancelling an unpaid (COD) order gives the card money back.
    const bigBefore = Number((await prisma.giftCard.findUnique({ where: { id: big.card.id } })).balance);
    cartId = await freshCart(1);
    await sf("POST", `/api/storefront/${H}/cart/add`, { cartId, variantId, quantity: 5 }); // ₹6,000 — more than the card
    await sf("POST", `/api/storefront/${H}/cart/gift-card`, { cartId, code: big.code });
    r = await sf("POST", `/api/storefront/${H}/checkout`, { cartId, email: `gc4-${stamp}@test.oyklane.dev`, ...SHIP, paymentMethod: "cod" });
    const codOrder = r.data.order;
    check("card spent on a COD order", Number((await prisma.giftCard.findUnique({ where: { id: big.card.id } })).balance) === 0, r.data);
    r = await owner("POST", `/api/orders/${codOrder.id}/cancel`, { reason: "Customer asked", notify: false });
    check("cancel the unpaid order", r.status === 200, r.data);
    check("card balance back", Number((await prisma.giftCard.findUnique({ where: { id: big.card.id } })).balance) === bigBefore, bigBefore);

    r = await owner("PATCH", `/api/gift-cards/${big.card.id}`, { status: "disabled" });
    cartId = await freshCart();
    r = await sf("POST", `/api/storefront/${H}/cart/gift-card`, { cartId, code: big.code });
    check("a disabled card can't be used", r.status === 400 && /disabled/i.test(r.data.error), r.data);
    r = await owner("GET", "/api/gift-cards?status=active");
    check("gift card list with unspent total", r.status === 200 && r.data.outstanding === 300, r.data);

    // ── Blog ──
    r = await owner("POST", "/api/blog", { title: "How we pick our linen", body: "First paragraph.\nStill the first.\n\nSecond one.", status: "draft" });
    check("draft blog post", r.status === 201, r.data);
    const post = r.data.article;
    r = await sf("GET", `/api/storefront/${H}/render/blog`);
    check("drafts stay off the blog", !String(r.data).includes("How we pick our linen"));
    r = await owner("PATCH", `/api/blog/${post.id}`, { title: "How we pick our linen", body: "First paragraph.\nStill the first.\n\nSecond one.", status: "published", tags: "Fabric, Behind the scenes" });
    check("publish the post", r.status === 200 && r.data.article.publishedAt, r.data);
    r = await sf("GET", `/api/storefront/${H}/render/blog`);
    check("published post on the blog page", String(r.data).includes("How we pick our linen"));
    r = await sf("GET", `/api/storefront/${H}/render/article?slug=${post.slug}`);
    check("plain-text posts become paragraphs", String(r.data).includes("<p>First paragraph.<br>Still the first.</p>") && String(r.data).includes("<p>Second one.</p>"), String(r.data).match(/<p>First[\s\S]{0,120}/)?.[0]);
    await owner("PATCH", `/api/blog/${post.id}`, { title: "How we pick our linen", body: "<h2>Why linen</h2><p>It breathes.</p>", status: "published" });
    r = await sf("GET", `/api/storefront/${H}/render/article?slug=${post.slug}`);
    check("posts written in HTML are kept as written", String(r.data).includes("<h2>Why linen</h2><p>It breathes.</p>"));
    r = await sf("GET", `/api/storefront/${H}/sitemap.xml`);
    check("sitemap lists the product and the post", String(r.data).includes(`/products/${product.slug}`) && String(r.data).includes(`/blog/${post.slug}`), String(r.data).slice(0, 300));
    r = await sf("GET", `/api/storefront/${H}/robots.txt`);
    check("robots.txt points at the sitemap and keeps checkout out", /Sitemap:/.test(r.data) && /Disallow: .*checkout/.test(r.data), r.data);

    // ── SEO preferences ──
    r = await owner("PATCH", "/api/store", { settings: { seo: { title: "Linen for Hot Days", description: "Breathable shirts, made in Kerala." } } });
    check("save SEO preferences", r.status === 200, r.data);
    r = await sf("GET", `/api/storefront/${H}/render/index`);
    check("home page uses the SEO title and description", String(r.data).includes("<title>Linen for Hot Days</title>") && String(r.data).includes("Breathable shirts, made in Kerala."));

    // ── Newsletter ──
    r = await sf("POST", `/api/storefront/${H}/newsletter`, { email: `news-${stamp}@test.oyklane.dev` });
    check("newsletter signup", r.status === 200 || r.status === 201, r.data);
    const sub = await prisma.customer.findFirst({ where: { storeId: store.id, email: `news-${stamp}@test.oyklane.dev` } });
    check("signup becomes a customer with email consent", sub?.acceptsEmailMarketing === true, sub);
    r = await sf("POST", `/api/storefront/${H}/account/register`, { name: "News Reader", email: `news-${stamp}@test.oyklane.dev`, password: "reader-pass-1" });
    check("a newsletter subscriber can still sign up (nothing private to protect)", r.status === 201, r.data);

    // ── Admin search ──
    r = await owner("GET", `/api/search?q=${signedInOrder.orderNumber}`);
    check("search finds an order by number", r.data.orders?.some((o) => o.id === signedInOrder.id), r.data);
    r = await owner("GET", "/api/search?q=linen");
    check("search finds products and blog posts", r.data.products?.some((p) => p.id === product.id) && r.data.articles?.some((a) => a.id === post.id), r.data);
    r = await owner("GET", `/api/search?q=LIN-${stamp}`);
    check("search finds a product by SKU", r.data.products?.some((p) => p.id === product.id), r.data);

    // ── Bulk actions ──
    r = await owner("POST", "/api/products", { title: "Second Shirt", status: "active", variants: [{ title: "Default", price: 800, inventoryQuantity: 3 }] });
    const second = r.data.product;
    r = await owner("POST", "/api/products/bulk", { ids: [product.id, second.id, "not-a-real-id"], action: "archive" });
    check("bulk archive", r.status === 200 && r.data.count === 2, r.data);
    check("both archived", (await prisma.product.count({ where: { id: { in: [product.id, second.id] }, status: "archived" } })) === 2);
    r = await owner("POST", "/api/products/bulk", { ids: [product.id], action: "activate" });
    check("bulk activate", r.data.count === 1, r.data);
    r = await owner("POST", "/api/products/bulk", { ids: [second.id], action: "delete" });
    check("bulk delete", r.data.count === 1 && !(await prisma.product.findUnique({ where: { id: second.id } })), r.data);

    // ── Seller payment gateways ──
    await owner("POST", "/api/products/bulk", { ids: [product.id], action: "activate" });
    r = await owner("GET", "/api/payments");
    check("payments: five gateways listed, cash on delivery on", r.data.providers?.length === 5 && r.data.cod.enabled === true, r.data);
    r = await owner("PUT", "/api/payments/stripe", { credentials: { publishableKey: "pk_test_x", secretKey: "sk_test_bad" }, testMode: true });
    check("wrong Stripe key is refused before saving", r.status === 400, r.data);
    r = await owner("PUT", "/api/payments/stripe", { credentials: { publishableKey: "pk_test_x", secretKey: "sk_test_ok" }, testMode: true });
    const stripeRow = r.data.providers?.find((p) => p.key === "stripe");
    check("connect Stripe (checked with Stripe, then saved)", r.status === 200 && stripeRow?.enabled && stripeRow.fields.find((f) => f.key === "secretKey").saved === "•••• t_ok", stripeRow);
    const storedGateway = await prisma.paymentProvider.findFirst({ where: { storeId: store.id, provider: "stripe" } });
    check("gateway keys are stored encrypted", storedGateway.credentials.startsWith("enc:v1:") && !storedGateway.credentials.includes("sk_test_ok"));
    const viewCart = await freshCart(1);
    r = await sf("GET", `/api/storefront/${H}/render/checkout?cartId=${viewCart}`);
    check("checkout offers the connected gateway", String(r.data).includes('value="stripe"'), String(r.data).match(/name="paymentMethod"[^>]*>/g));

    const RB = "https://shop.example.test";
    cartId = await freshCart(1);
    r = await sf("POST", `/api/storefront/${H}/checkout`, { cartId, email: `pay-${stamp}@test.oyklane.dev`, ...SHIP, paymentMethod: "stripe", returnBase: RB });
    check("Stripe checkout sends the shopper to Stripe", r.status === 201 && r.data.payment?.kind === "redirect" && r.data.payment.url.includes("checkout.stripe.test"), r.data);
    const stripeOrder = r.data.order;
    check("…and keeps the cart until paid", (await sf("GET", `/api/storefront/${H}/cart?cartId=${cartId}`)).data.cart.item_count === 1);
    r = await sf("POST", `/api/storefront/${H}/checkout/payments/stripe/confirm`, { orderId: stripeOrder.id, cartId });
    check("not paid yet → not confirmed", r.data.paid === false, r.data);
    const session = (await prisma.order.findUnique({ where: { id: stripeOrder.id } })).paymentGatewayRef;
    await fetch(`${MOCK}/__pay/stripe/${session}`, { method: "POST" });
    r = await sf("POST", `/api/storefront/${H}/checkout/payments/stripe/confirm`, { orderId: stripeOrder.id, cartId, params: { session_id: session } });
    const paidStripe = await prisma.order.findUnique({ where: { id: stripeOrder.id } });
    check("paid on Stripe → order paid (checked with Stripe)", r.data.paid === true && paidStripe.paymentStatus === "paid" && paidStripe.paymentReference === "pi_mock_1", paidStripe);
    check("cart cleared after payment", (await sf("GET", `/api/storefront/${H}/cart?cartId=${cartId}`)).data.cart.item_count === 0);
    r = await sf("POST", `/api/storefront/${H}/checkout/payments/cashfree/confirm`, { orderId: stripeOrder.id });
    check("a return for the wrong gateway is refused", r.status === 400, r.data);

    r = await owner("PUT", "/api/payments/cashfree", { credentials: { appId: "cf_app", secretKey: "cf_secret_ok" }, testMode: true });
    check("connect Cashfree", r.status === 200, r.data);
    cartId = await freshCart(2);
    r = await sf("POST", `/api/storefront/${H}/checkout`, { cartId, email: `pay2-${stamp}@test.oyklane.dev`, ...SHIP, paymentMethod: "cashfree", returnBase: RB });
    check("Cashfree checkout hands over a payment session", r.data.payment?.kind === "cashfree" && r.data.payment.sessionId && r.data.payment.mode === "sandbox", r.data);
    const cfOrder = r.data.order;
    await fetch(`${MOCK}/__pay/cashfree/oy_${cfOrder.id}`, { method: "POST" });
    r = await sf("POST", `/api/storefront/${H}/checkout/payments/cashfree/confirm`, { orderId: cfOrder.id, params: { order_id: `oy_${cfOrder.id}` } });
    check("Cashfree payment confirmed", r.data.paid === true, r.data);

    r = await owner("PUT", "/api/payments/payu", { credentials: { merchantKey: "gtKFFx", salt: "eCwWELxi42" }, testMode: true });
    check("connect PayU", r.status === 200, r.data);
    cartId = await freshCart(1);
    r = await sf("POST", `/api/storefront/${H}/checkout`, { cartId, email: `pay3-${stamp}@test.oyklane.dev`, ...SHIP, paymentMethod: "payu", returnBase: RB });
    const pf = r.data.payment?.fields || {};
    const hashOk = crypto.createHash("sha512").update(`${pf.key}|${pf.txnid}|${pf.amount}|${pf.productinfo}|${pf.firstname}|${pf.email}|||||||||||eCwWELxi42`).digest("hex");
    check("PayU checkout posts a signed form to PayU", r.data.payment?.kind === "form" && r.data.payment.action.endsWith("/_payment") && pf.hash === hashOk && pf.surl.startsWith(`${RB}/checkout/return/payu`), r.data.payment);
    const payuOrder = r.data.order;
    const back = { ...pf, status: "success", mihpayid: "403993715", salt: undefined };
    delete back.salt;
    back.hash = crypto.createHash("sha512").update(`eCwWELxi42|success|||||||||||${pf.email}|${pf.firstname}|${pf.productinfo}|${pf.amount}|${pf.txnid}|${pf.key}`).digest("hex");
    r = await sf("POST", `/api/storefront/${H}/checkout/payments/payu/confirm`, { orderId: payuOrder.id, params: { ...back, hash: (back.hash[0] === "0" ? "1" : "0") + back.hash.slice(1) } });
    check("PayU return with a forged signature is refused", r.data.paid === false, r.data);
    r = await sf("POST", `/api/storefront/${H}/checkout/payments/payu/confirm`, { orderId: payuOrder.id, params: back });
    check("PayU return with PayU's signature → paid", r.data.paid === true, r.data);

    // Paying online, coming back without paying, then checking out again
    // from the same cart: one order, not two.
    const stockBefore = (await prisma.productVariant.findUnique({ where: { id: variantId } })).inventoryQuantity;
    cartId = await freshCart(1);
    r = await sf("POST", `/api/storefront/${H}/checkout`, { cartId, email: `retry-${stamp}@test.oyklane.dev`, ...SHIP, paymentMethod: "cashfree", returnBase: RB });
    const firstTry = r.data.order;
    check("online checkout keeps the cart until paid", (await sf("GET", `/api/storefront/${H}/cart?cartId=${cartId}`)).data.cart.item_count === 1);
    r = await sf("POST", `/api/storefront/${H}/checkout`, { cartId, email: `retry-${stamp}@test.oyklane.dev`, ...SHIP, paymentMethod: "cod" });
    const secondTry = r.data.order;
    check("checking out again from the same cart places the order", r.status === 201 && secondTry && secondTry.id !== firstTry.id, r.data);
    const replaced = await prisma.order.findUnique({ where: { id: firstTry.id } });
    check("…the unpaid first try is cancelled", replaced.fulfillmentStatus === "cancelled" && /checked out again/.test(replaced.cancelReason || ""), replaced);
    check("…and its stock put back (sold once, not twice)", (await prisma.productVariant.findUnique({ where: { id: variantId } })).inventoryQuantity === stockBefore - 1);
    r = await owner("GET", "/api/orders?status=all&pageSize=50");
    check("…All orders shows one order, not two", r.data.orders.some((o) => o.id === secondTry.id) && !r.data.orders.some((o) => o.id === firstTry.id), r.data.orders?.map((o) => o.orderNumber));
    r = await owner("GET", "/api/orders?status=cancelled&pageSize=50");
    check("…the replaced try is still under Cancelled", r.data.orders.some((o) => o.id === firstTry.id));

    // Ways to pay: one per method the gateways offer, and the chosen one
    // reaches the gateway.
    const optCart = await freshCart(1);
    r = await sf("GET", `/api/storefront/${H}/render/checkout?cartId=${optCart}`);
    check("checkout lists ways to pay per method (UPI, card, …)", /value="(payu|cashfree|stripe):upi"/.test(String(r.data)) && /value="[a-z]+:card"/.test(String(r.data)), String(r.data).match(/value="[a-z]+:[a-z]+"/g));
    r = await sf("POST", `/api/storefront/${H}/checkout`, { cartId: optCart, email: `mode-${stamp}@test.oyklane.dev`, ...SHIP, paymentMethod: "payu", payMode: "upi", returnBase: RB });
    check("PayU opens on the chosen method (enforce_paymethod)", r.data.payment?.fields?.enforce_paymethod === "upi" && !String(r.data.payment?.fields?.hash || "").includes("upi"), r.data.payment?.fields);

    // One-Click: a code-confirmed number signs the shopper in with the order.
    await owner("POST", "/api/apps/one-click-checkout/install", { settings: {} });
    const occPhone = "9844400001";
    const occCode = async () => (await prisma.messageLog.findFirst({ where: { storeId: store.id, to: `91${occPhone}` }, orderBy: { createdAt: "desc" } }))?.body?.match(/^(\d{6})/)?.[1];
    r = await sf("POST", `/api/storefront/${H}/checkout/express/code`, { phone: occPhone });
    r = await sf("POST", `/api/storefront/${H}/checkout/express/verify`, { phone: occPhone, code: await occCode() });
    check("new number verified: a ticket, no session yet", r.status === 200 && r.data.ticket && !r.data.token, r.data);
    const occCart = await freshCart(1);
    const occEmail = `occ-${stamp}@test.oyklane.dev`;
    r = await sf("POST", `/api/storefront/${H}/checkout`, { cartId: occCart, email: occEmail, ...SHIP, phone: `+91 ${occPhone}`, paymentMethod: "cod", oneClick: true, phoneTicket: r.data.ticket });
    check("the order signs the new shopper in", r.status === 201 && r.data.session, r.data);
    const occCustomer = await prisma.customer.findFirst({ where: { storeId: store.id, email: occEmail } });
    const occOrder = await prisma.order.findUnique({ where: { id: r.data.order.id } });
    check("…their number is saved as verified, and the order is theirs", occCustomer?.phoneVerifiedAt && occCustomer.phone === `+91${occPhone}` && occOrder.customerId === occCustomer.id && occOrder.placedSignedIn, { customer: occCustomer, order: occOrder && { customerId: occOrder.customerId, placedSignedIn: occOrder.placedSignedIn } });
    r = await sf("POST", `/api/storefront/${H}/checkout/express/code`, { phone: occPhone });
    r = await sf("POST", `/api/storefront/${H}/checkout/express/verify`, { phone: occPhone, code: await occCode() });
    check("next time, the code signs them straight in", r.status === 200 && r.data.token && r.data.signedIn && !r.data.ticket, r.data);
    r = await sf("POST", `/api/storefront/${H}/checkout/express/mine`, {}, { "x-shopper-token": r.data.token });
    check("…with their saved address ready", r.status === 200 && r.data.verified && r.data.addresses?.some((a) => a.zip === SHIP.shippingZip), r.data);
    r = await sf("POST", `/api/storefront/${H}/checkout/express/mine`, {});
    check("saved addresses need a signed-in shopper", r.status === 401, r.data);
    const tamperCart = await freshCart(1);
    r = await sf("POST", `/api/storefront/${H}/checkout`, { cartId: tamperCart, email: `occ2-${stamp}@test.oyklane.dev`, ...SHIP, paymentMethod: "cod", oneClick: true, phoneTicket: "not-a-ticket" });
    check("a bad ticket just places the order (no sign-in)", r.status === 201 && !r.data.session, r.data);

    r = await owner("PUT", "/api/payments/paypal", { credentials: { clientId: "pp_client", clientSecret: "pp_secret" }, testMode: true });
    check("PayPal refused for a rupee store (PayPal doesn't take INR here)", r.status === 400 && /INR/.test(r.data.error), r.data);
    await prisma.store.update({ where: { id: store.id }, data: { currency: "USD" } });
    r = await owner("PUT", "/api/payments/paypal", { credentials: { clientId: "pp_client", clientSecret: "pp_secret" }, testMode: true });
    check("connect PayPal (USD store)", r.status === 200, r.data);
    cartId = await freshCart(1);
    r = await sf("POST", `/api/storefront/${H}/checkout`, { cartId, email: `pay4-${stamp}@test.oyklane.dev`, ...SHIP, paymentMethod: "paypal", returnBase: RB });
    const ppOrder = r.data.order;
    const ppRef = (await prisma.order.findUnique({ where: { id: ppOrder.id } })).paymentGatewayRef;
    check("PayPal checkout sends the shopper to PayPal", r.data.payment?.kind === "redirect" && r.data.payment.url.includes(ppRef), r.data);
    r = await sf("POST", `/api/storefront/${H}/checkout/payments/paypal/confirm`, { orderId: ppOrder.id, params: { token: ppRef } });
    check("not approved on PayPal → not paid", r.data.paid === false, r.data);
    await fetch(`${MOCK}/__pay/paypal/${ppRef}`, { method: "POST" });
    r = await sf("POST", `/api/storefront/${H}/checkout/payments/paypal/confirm`, { orderId: ppOrder.id, params: { token: ppRef } });
    check("approved → captured → paid", r.data.paid === true, r.data);
    r = await sf("POST", `/api/storefront/${H}/checkout/payments/paypal/confirm`, { orderId: ppOrder.id, params: { token: ppRef } });
    check("a repeated return stays paid (captured once)", r.data.paid === true, r.data);
    await prisma.store.update({ where: { id: store.id }, data: { currency: "INR" } });

    r = await owner("PUT", "/api/payments/cod", { enabled: false });
    cartId = await freshCart(1);
    r = await sf("POST", `/api/storefront/${H}/checkout`, { cartId, email: `pay5-${stamp}@test.oyklane.dev`, ...SHIP, paymentMethod: "cod" });
    check("cash on delivery switched off is refused at checkout", r.status === 400, r.data);
    await owner("PUT", "/api/payments/cod", { enabled: true });
    await owner("DELETE", "/api/payments/stripe");
    r = await sf("POST", `/api/storefront/${H}/checkout`, { cartId, email: `pay6-${stamp}@test.oyklane.dev`, ...SHIP, paymentMethod: "stripe", returnBase: RB });
    check("a disconnected gateway can't be used", r.status === 400, r.data);

    // ── Public API with scoped keys ──
    const v1 = async (method, url, token, body) => {
      const res = await fetch(`${API}/api/v1${url}`, {
        method,
        headers: { ...(token && { authorization: `Bearer ${token}` }), ...(body && { "content-type": "application/json" }) },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: res.status, data: await res.json().catch(() => null) };
    };
    const setPlan = async (key) => {
      const plan = await prisma.plan.findFirst({ where: { key } });
      await prisma.subscription.update({ where: { storeId: store.id }, data: { planId: plan.id } });
      await prisma.store.update({ where: { id: store.id }, data: { planId: plan.id } });
    };
    await setPlan("growth");
    r = await owner("POST", "/api/developer/keys", { name: "Too early", scopes: ["read_products"] });
    check("API keys need Pro (refused on Growth)", r.status === 403, r.data);
    await setPlan("pro");
    r = await owner("POST", "/api/developer/keys", { name: "Read catalogue", scopes: ["read_products"] });
    check("create an API key (token shown once)", r.status === 201 && /^oyk_/.test(r.data.token) && r.data.key.prefix === r.data.token.slice(0, 10), r.data);
    const readKey = r.data.token;
    r = await owner("GET", "/api/developer/keys");
    check("key list never shows the token", r.data.keys.length === 1 && !JSON.stringify(r.data).includes(readKey), r.data);
    check("only a hash is stored", !(await prisma.apiKey.findFirst({ where: { storeId: store.id } })).keyHash.includes(readKey.slice(4, 20)));
    r = await v1("GET", "/products", null);
    check("no key → 401", r.status === 401, r.data);
    r = await v1("GET", "/products", readKey);
    check("read_products lists products", r.status === 200 && r.data.data.some((p) => p.id === product.id && p.variants[0].price === 1000) && r.data.total >= 1, r.data);
    await setPlan("growth");
    r = await v1("GET", "/products", readKey);
    check("an existing key stops working off Pro", r.status === 403 && r.data?.code === "plan_upgrade_required", r.data);
    await setPlan("pro");
    r = await v1("GET", "/orders", readKey);
    check("…but can't read orders (scope)", r.status === 403 && /read_orders/.test(r.data.error), r.data);
    r = await owner("POST", "/api/developer/keys", { name: "Warehouse app", scopes: ["read_orders", "write_orders", "write_products", "write_inventory", "read_customers"] });
    const fullKey = r.data.token;
    r = await v1("POST", "/products", fullKey, { title: "API Kurta", status: "active", variants: [{ title: "M", sku: `API-${stamp}`, price: 1499, inventoryQuantity: 5 }] });
    check("write_products creates a product", r.status === 201 && r.data.data.title === "API Kurta" && r.data.data.handle, r.data);
    const apiProduct = r.data.data;
    r = await v1("POST", "/inventory/adjust", fullKey, { variant_id: apiProduct.variants[0].id, mode: "set", quantity: 12, reason: "received" });
    check("write_inventory sets stock", r.status === 200 && r.data.data.quantity === 12, r.data);
    r = await v1("GET", `/orders?limit=2`, fullKey);
    check("read_orders lists orders, paginated", r.status === 200 && r.data.data.length === 2 && r.data.limit === 2 && r.data.data[0].line_items.length >= 1, r.data);
    const someOrder = r.data.data[0];
    check("orders never expose internal fields", !("storeId" in someOrder) && !("statusToken" in someOrder) && !("razorpayOrderId" in someOrder));
    r = await v1("GET", `/customers?email=${encodeURIComponent(shopperEmail)}`, fullKey);
    check("read_customers finds a customer by email", r.data.data.length === 1 && r.data.data[0].has_account === true && !("passwordHash" in r.data.data[0]), r.data);
    const keyId = (await owner("GET", "/api/developer/keys")).data.keys.find((k) => k.name === "Read catalogue").id;
    await owner("DELETE", `/api/developer/keys/${keyId}`);
    r = await v1("GET", "/products", readKey);
    check("a revoked key stops working", r.status === 401, r.data);

    // ── Themes: Atelier (clothing) and Lumière (jewellery) ──
    for (const handle of ["atelier", "lumiere"]) {
      r = await owner("POST", "/api/themes/install", { handle });
      check(`install the ${handle} theme`, r.status === 201 || r.status === 200, r.data);
      const themeId = r.data.theme?.id || r.data.id;
      r = await sf("GET", `/api/storefront/${H}/render/index?themeId=${themeId}`);
      const home = String(r.data);
      const marker = handle === "atelier" ? ['data-section-type="split-hero"', 'data-section-type="shop-the-look"', "circles--circle"] : ['data-section-type="craft-story"', 'data-section-type="gift-guide"', "circles--arch"];
      check(`${handle} home page renders its own sections`, r.status === 200 && marker.every((m) => home.includes(m)), marker.filter((m) => !home.includes(m)));
      check(`${handle} header and footer take the theme's saved settings`, home.includes("header--center") && home.includes("Powered by Oyklane.com"), home.slice(0, 200));
      await owner("DELETE", `/api/themes/${themeId}`);
    }

    // Size / Colour pickers from "M / Black" variant titles.
    r = await owner("POST", "/api/products", {
      title: "Option Tee", status: "active",
      variants: [
        { title: "S / Black", price: 700, inventoryQuantity: 3 }, { title: "M / Black", price: 700, inventoryQuantity: 0 },
        { title: "S / Olive Green", price: 700, inventoryQuantity: 2 }, { title: "M / Olive Green", price: 700, inventoryQuantity: 4 },
      ],
    });
    const optionTee = r.data.product;
    r = await sf("GET", `/api/storefront/${H}/render/product?slug=${optionTee.slug}`);
    const teeHtml = String(r.data);
    check("variant titles split into Size and Colour pickers", teeHtml.includes("Size:") && teeHtml.includes("Colour:") && teeHtml.includes('name="option1"') && teeHtml.includes("sys-swatch__dot"), teeHtml.slice(0, 200));
    check("…with the per-variant list kept for no-JS", teeHtml.includes("<noscript>") && teeHtml.includes('data-sys-variant-input disabled'));

    // Header/footer settings: shipped nested under `settings`, edited flat.
    const liveTheme = (await owner("GET", "/api/themes")).data.themes.find((t) => t.isActive);
    const sd = liveTheme.settingsData;
    sd.sections.footer = { ...(sd.sections.footer || {}), settings: { ...(sd.sections.footer?.settings || {}), about: "Shipped about text" } };
    await owner("PATCH", `/api/themes/${liveTheme.id}/settings`, { settingsData: sd });
    r = await sf("GET", `/api/storefront/${H}/render/index`);
    check("footer uses settings shipped nested under `settings`", String(r.data).includes("Shipped about text"));
    sd.sections.footer.about = "Edited about text";
    await owner("PATCH", `/api/themes/${liveTheme.id}/settings`, { settingsData: sd });
    r = await sf("GET", `/api/storefront/${H}/render/index`);
    check("…and a value edited in the theme editor (flat) wins", String(r.data).includes("Edited about text") && !String(r.data).includes("Shipped about text"));

    // ── Quick add on product cards ──
    r = await sf("GET", `/api/storefront/${H}/products/${optionTee.slug}/quick`);
    check("quick add: a card gets the product's pickers and stock", r.status === 200 && r.data.product.options.length === 2 && r.data.product.variants.length === 4 && r.data.product.variants.some((v) => !v.available), r.data);
    r = await sf("GET", `/api/storefront/${H}/products/no-such-product/quick`);
    check("quick add: unknown product is a 404", r.status === 404);

    // ── Product page arranged in the theme editor ──
    const layoutTheme = (await owner("GET", "/api/themes")).data.themes.find((t) => t.isActive);
    const arranged = {
      sections: {
        main: {
          type: "sys-product",
          settings: { gallery_layout: "stacked", show_breadcrumbs: false },
          blocks: {
            t: { type: "title", settings: { size: "large" } },
            pk: { type: "variant_picker", settings: {} },
            b: { type: "buy_buttons", settings: { show_quantity: false, button_label: "Buy it now" } },
            p: { type: "price", settings: { size: "large", show_tax_note: false } },
            tr: { type: "trust", settings: {}, disabled: true },
          },
          block_order: ["t", "pk", "b", "p", "tr"],
        },
        extra: { type: "sys-checkout-summary", settings: {} },
      },
      order: ["main", "extra"],
    };
    r = await owner("POST", `/api/themes/${layoutTheme.id}/render-draft`, { template: "product", slug: optionTee.slug, templateOverride: arranged });
    check("the editor previews an unsaved product layout", r.status === 200 && r.data.html.includes("Buy it now") && !r.data.html.includes("fbevents"), r.data?.error);
    r = await owner("GET", `/api/themes/${layoutTheme.id}`);
    check("the editor gets the platform's product page sections", r.data.platform?.sections.some((f) => f.path === "sections/sys-product.liquid") && r.data.platform.templates.product.order.includes("main"), r.data.platform);
    r = await owner("PATCH", `/api/themes/${layoutTheme.id}/files`, { path: "templates/product.json", content: JSON.stringify(arranged) });
    check("save a product page layout", r.status === 200, r.data);
    r = await sf("GET", `/api/storefront/${H}/render/product?slug=${optionTee.slug}`);
    const arrangedHtml = String(r.data);
    check(
      "product page follows the seller's layout: order, sizes, labels",
      arrangedHtml.includes("sys-pinfo__title--large") && arrangedHtml.includes("sys-pinfo__pricebox--large") && arrangedHtml.includes("Buy it now") && arrangedHtml.indexOf("data-sys-add") < arrangedHtml.indexOf("data-sys-price") && !arrangedHtml.includes("sys-crumbs"),
      arrangedHtml.slice(0, 200)
    );
    check("…hidden blocks and removed sections stay off", !arrangedHtml.includes("sys-trust") && !arrangedHtml.includes('data-section-type="sys-related"') && !arrangedHtml.includes('name="quantity" value="1" min="1"'));
    check("…and other platform sections can't be slipped in", !arrangedHtml.includes("sys-checkout-summary"));
    await owner("PATCH", `/api/themes/${layoutTheme.id}/files`, { path: "templates/product.json", content: JSON.stringify({ sections: { x: { type: "rich-text", settings: {} } }, order: ["x"] }) });
    r = await sf("GET", `/api/storefront/${H}/render/product?slug=${optionTee.slug}`);
    check("a layout without the product itself falls back to the standard page", String(r.data).includes("sys-trust") && String(r.data).includes("data-sys-add"));

    // ── Checkout fields (Settings ▸ Checkout) ──
    r = await owner("PATCH", "/api/store", { settings: { checkout: { phone: "hidden", company: "required", gstin: "optional", note: "optional", country: "india" } } });
    check("save checkout field settings", r.status === 200, r.data);
    r = await sf("POST", `/api/storefront/${H}/cart/add`, { variantId: product.variants[0].id, quantity: 1 });
    const fieldsCart = r.data.cart.cartId;
    r = await sf("GET", `/api/storefront/${H}/render/checkout?cartId=${fieldsCart}`);
    const checkoutHtml = String(r.data);
    check("checkout form follows the settings", !checkoutHtml.includes('name="phone"') && /name="company"\s+required/.test(checkoutHtml) && checkoutHtml.includes('name="gstin"') && checkoutHtml.includes('name="note"') && checkoutHtml.includes('type="hidden" name="shippingCountry" value="IN"'), checkoutHtml.slice(0, 200));
    const { phone: _phone, ...shipNoPhone } = SHIP;
    r = await sf("POST", `/api/storefront/${H}/checkout`, { cartId: fieldsCart, email: `fields-${stamp}@test.oyklane.dev`, ...shipNoPhone, paymentMethod: "cod" });
    check("a required company name is enforced", r.status === 400 && /company/i.test(r.data.error), r.data);
    r = await sf("POST", `/api/storefront/${H}/checkout`, { cartId: fieldsCart, email: `fields-${stamp}@test.oyklane.dev`, ...shipNoPhone, company: "Acme Traders", gstin: "27ABCDE1234F1Z", paymentMethod: "cod" });
    check("a malformed GSTIN is refused", r.status === 400 && /GSTIN/.test(r.data.error), r.data);
    r = await sf("POST", `/api/storefront/${H}/checkout`, { cartId: fieldsCart, email: `fields-${stamp}@test.oyklane.dev`, ...shipNoPhone, phone: "9999999999", company: "Acme Traders", gstin: "27abcde1234f1z5", note: "Leave with the guard", paymentMethod: "cod" });
    const fieldsOrder = r.data.order;
    check("order keeps company, GSTIN (uppercased) and note; a hidden phone is dropped", r.status === 201 && fieldsOrder && (await prisma.order.findUnique({ where: { id: fieldsOrder.id } })).buyerGstin === "27ABCDE1234F1Z5", r.data);
    const fieldsRow = await prisma.order.findUnique({ where: { id: fieldsOrder.id } });
    check("…stored as sent", fieldsRow.buyerCompany === "Acme Traders" && fieldsRow.customerNote === "Leave with the guard" && fieldsRow.phone === null, fieldsRow);
    await owner("PATCH", "/api/store", { settings: { checkout: { phone: "required", company: "hidden", gstin: "hidden", note: "hidden", country: "show" } } });

    // ── Product Reviews app ──
    r = await sf("POST", `/api/storefront/${H}/products/${product.slug}/reviews`, { rating: 5, name: "A", email: "a@test.oyklane.dev", body: "Lovely shirt, fits well." });
    check("reviews are off until the app is installed", r.status === 402, r.data);
    r = await owner("POST", "/api/apps/product-reviews/install", { settings: {} });
    check("install Product Reviews", r.status === 200 || r.status === 201, r.data);
    r = await sf("GET", `/api/storefront/${H}/render/product?slug=${product.slug}`);
    check("product page shows the reviews section and form", String(r.data).includes('id="reviews"') && String(r.data).includes("Write a review"));
    // The Linen Shirt was ordered earlier by `shopperEmail` — a verified buyer.
    r = await sf("POST", `/api/storefront/${H}/products/${product.slug}/reviews`, { rating: 5, name: "Growth Shopper", email: shopperEmail, title: "Perfect", body: "Soft linen and a great fit." });
    check("a verified buyer's review is published straight away", r.status === 200 && r.data.status === "published", r.data);
    r = await sf("POST", `/api/storefront/${H}/products/${product.slug}/reviews`, { rating: 2, name: "Stranger", email: `stranger-${stamp}@test.oyklane.dev`, body: "Didn't like the colour." });
    check("…anyone else's waits for approval", r.status === 200 && r.data.status === "pending", r.data);
    r = await sf("POST", `/api/storefront/${H}/products/${product.slug}/reviews`, { rating: 4, name: "Growth Shopper", email: shopperEmail, body: "Second try at a review." });
    check("one review per person per product", r.status === 409, r.data);
    r = await sf("POST", `/api/storefront/${H}/products/${product.slug}/reviews`, { rating: 9, name: "X", email: "x@test.oyklane.dev", body: "Out of range rating here." });
    check("ratings are 1 to 5", r.status === 400, r.data);
    r = await owner("GET", "/api/reviews?status=pending");
    check("the pending review is in the admin queue", r.status === 200 && r.data.counts.pending === 1 && r.data.reviews[0].authorName === "Stranger", r.data);
    const pendingId = r.data.reviews[0].id;
    await owner("PATCH", `/api/reviews/${pendingId}`, { status: "published", reply: "Sorry to hear that — we've added more colours." });
    const csv = [
      "product_slug,rating,title,body,author,verified",
      `${product.slug},4,"Nice, but","Good linen, runs a bit ""large"".",Priya,yes`,
      `/products/${product.slug},5,,"Second, imported",Rahul,no`,
      "no-such-thing,5,,Lost,Nobody,no",
      `${product.slug},0,,Bad rating,Zero,no`,
    ].join("\n");
    r = await owner("POST", "/api/reviews/import", { csv });
    check("CSV import matches products by slug and skips bad rows", r.status === 200 && r.data.imported === 2 && r.data.skippedCount === 2 && /no-such-thing/.test(r.data.skipped[0].reason), r.data);
    r = await sf("GET", `/api/storefront/${H}/render/product?slug=${product.slug}`);
    const reviewHtml = String(r.data);
    check("published reviews show with the average, reply and verified badge", reviewHtml.includes("Based on 4 reviews") && reviewHtml.includes("added more colours") && reviewHtml.includes("Verified buyer") && (reviewHtml.includes("runs a bit &quot;large&quot;") || reviewHtml.includes("runs a bit &#34;large&#34;")), reviewHtml.slice(0, 200));
    r = await sf("GET", `/api/storefront/${H}/render/collection?slug=all`);
    check("stars on product cards", String(r.data).includes("sys-pcard__rating"));

    // ── Facebook Pixel + GA events, on every page ──
    await owner("POST", "/api/apps/facebook-pixel/install", { settings: { pixelId: "123456789012345" } });
    await owner("POST", "/api/apps/google-analytics/install", { settings: { measurementId: "G-TEST1234" } });
    r = await sf("GET", `/api/storefront/${H}/render/product?slug=${product.slug}`);
    const trackedPdp = String(r.data);
    check("product page: pixel once, and a ViewContent event", (trackedPdp.match(/fbq\('init'/g) || []).length === 1 && trackedPdp.includes('oyTrack("ViewContent"'), trackedPdp.slice(0, 200));
    r = await sf("GET", `/api/storefront/${H}/render/checkout?cartId=${fieldsCart}`);
    r = await sf("POST", `/api/storefront/${H}/cart/add`, { variantId: product.variants[0].id, quantity: 1 });
    r = await sf("GET", `/api/storefront/${H}/render/checkout?cartId=${r.data.cart.cartId}`);
    check("checkout (its own layout) still gets the pixel and InitiateCheckout", String(r.data).includes("fbevents.js") && String(r.data).includes('oyTrack("InitiateCheckout"'));
    r = await sf("GET", `/api/storefront/${H}/render/order-confirmation?orderId=${fieldsOrder.id}`);
    check("order confirmation fires Purchase once", String(r.data).includes('oyTrack("Purchase"') && String(r.data).includes("oy-purchase-"), String(r.data).slice(0, 200));

    // ── Custom data (metafields) ──
    r = await owner("POST", "/api/metafields", { ownerType: "product", name: "Fabric", type: "text" });
    check("define a product field (key from the name)", r.status === 201 && r.data.definition.key === "fabric", r.data);
    const fabricDef = r.data.definition;
    await owner("POST", "/api/metafields", { ownerType: "product", name: "Fit", type: "text", choices: ["Slim", "Regular"] });
    await owner("POST", "/api/metafields", { ownerType: "product", name: "Weight (g)", type: "number" });
    await owner("POST", "/api/metafields", { ownerType: "product", name: "Internal note", type: "text", showOnStorefront: false });
    r = await owner("POST", "/api/metafields", { ownerType: "product", name: "fabric", type: "text" });
    check("duplicate keys refused", r.status === 409, r.data);
    r = await owner("PATCH", `/api/products/${product.id}`, { metafields: { fit: "Baggy" } });
    check("a value outside the preset choices is refused", r.status === 400 && /Fit/.test(r.data.error), r.data);
    r = await owner("PATCH", `/api/products/${product.id}`, { metafields: { fabric: "Pure linen", fit: "Slim", weight_g: "180", internal_note: "reorder in May", nope: "ignored" } });
    check("save custom data on a product (checked, typed)", r.status === 200 && r.data.product.metafields.fabric === "Pure linen" && r.data.product.metafields.weight_g === 180 && !("nope" in r.data.product.metafields), r.data.product?.metafields);
    r = await sf("GET", `/api/storefront/${H}/render/product?slug=${product.slug}`);
    const productHtml = String(r.data);
    check("product page lists visible fields under Details", productHtml.includes("Pure linen") && productHtml.includes("Weight (g)") && productHtml.includes("Slim"), productHtml.slice(0, 200));
    check("hidden fields stay off the store", !productHtml.includes("reorder in May"));
    r = await v1("PATCH", `/products/${product.id}`, fullKey, { metafields: { fit: "Regular" } });
    check("public API updates one field, keeps the rest", r.status === 200 && r.data.data.metafields.fit === "Regular" && r.data.data.metafields.fabric === "Pure linen", r.data);
    r = await owner("PATCH", `/api/products/${product.id}`, { metafields: { fabric: null } });
    check("a blank value clears the field", r.status === 200 && !("fabric" in r.data.product.metafields) && r.data.product.metafields.fit === "Regular", r.data.product?.metafields);
    await owner("PATCH", `/api/products/${product.id}`, { metafields: { fabric: "Linen" } });
    r = await owner("DELETE", `/api/metafields/${fabricDef.id}`);
    check("delete a field", r.status === 200, r.data);
    check("…and its saved values", !("fabric" in (await prisma.product.findUnique({ where: { id: product.id } })).metafields));

    // ── Webhooks ──
    const received = [];
    const hookServer = require("http").createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        received.push({ path: req.url, headers: req.headers, raw });
        res.writeHead(req.url === "/fail" ? 500 : 200);
        res.end("ok");
      });
    });
    await new Promise((res) => hookServer.listen(4295, res));
    try {
      r = await owner("POST", "/api/developer/webhooks", { url: "http://localhost:4295/hook", events: ["order.created", "product.updated", "not.an.event"] });
      check("add a webhook (signing secret shown once)", r.status === 201 && /^whsec_/.test(r.data.secret) && r.data.endpoint.events.length === 2, r.data);
      const hookSecret = r.data.secret;
      const hookId = r.data.endpoint.id;
      r = await owner("POST", `/api/developer/webhooks/${hookId}/test`);
      check("send test → delivered", r.data.delivery?.status === "success" && received.some((x) => x.headers["x-oyklane-event"] === "ping"), r.data);
      cartId = await freshCart(1);
      r = await sf("POST", `/api/storefront/${H}/checkout`, { cartId, email: `hook-${stamp}@test.oyklane.dev`, ...SHIP, paymentMethod: "cod" });
      const hookOrder = r.data.order;
      let got = null;
      for (let i = 0; i < 40 && !got; i += 1) {
        got = received.find((x) => x.headers["x-oyklane-event"] === "order.created" && x.raw.includes(hookOrder.id));
        if (!got) await new Promise((res) => setTimeout(res, 250));
      }
      check("order.created delivered to the endpoint", Boolean(got), received.map((x) => x.headers["x-oyklane-event"]));
      const expectedSig = got && `sha256=${crypto.createHmac("sha256", hookSecret).update(`${got.headers["x-oyklane-timestamp"]}.${got.raw}`).digest("hex")}`;
      check("…signed with the endpoint's secret", got && got.headers["x-oyklane-signature"] === expectedSig, got?.headers);
      const hookBody = got && JSON.parse(got.raw);
      check("…with the order in the API's format", hookBody?.event === "order.created" && hookBody.data.number === hookOrder.orderNumber && Array.isArray(hookBody.data.line_items), hookBody);
      r = await owner("POST", "/api/developer/webhooks", { url: "http://localhost:4295/fail", events: ["product.updated"] });
      await owner("PATCH", `/api/products/${product.id}`, { title: "Linen Shirt" });
      let failed = null;
      for (let i = 0; i < 40 && !failed; i += 1) {
        failed = await prisma.webhookDelivery.findFirst({ where: { endpointId: r.data.endpoint.id, attempts: { gt: 0 } } });
        if (!failed) await new Promise((res) => setTimeout(res, 250));
      }
      check("a failing endpoint is retried later (not dropped)", failed?.status === "pending" && failed.responseStatus === 500 && failed.nextAttemptAt > new Date(), failed);
      r = await owner("GET", "/api/developer/webhooks");
      check("delivery log shows recent deliveries", r.data.deliveries.length >= 3 && r.data.events.length >= 9, r.data.deliveries?.length);
      r = await owner("POST", "/api/developer/webhooks", { url: "ftp://example.com/x", events: ["order.paid"] });
      check("non-http webhook URLs are refused", r.status === 400, r.data);
    } finally {
      hookServer.close();
    }

    // ── Domains ──
    r = await sf("GET", `/api/storefront/${H}/render/index`);
    check("store pages never reference the API's own address", !String(r.data).includes(`localhost:${API_PORT}`) && String(r.data).includes(`/store/${H}/oy-assets/`), String(r.data).match(/(href|src)="[^"]*assets[^"]*"/)?.[0]);
    r = await owner("PUT", "/api/store/domain", { domain: "myshop.up.railway.app" });
    check("hosting-provider domains can't be connected", r.status === 400, r.data);
    r = await owner("PUT", "/api/store/domain", { domain: `https://WWW.growth-${stamp}.example.com/` });
    check("connect a domain (URL and www cleaned up)", r.status === 200 && r.data.domain === `growth-${stamp}.example.com` && r.data.stage === "dns" && r.data.live === false, r.data);
    check("subdomain gets a single CNAME record", r.data.records?.length === 1 && r.data.records[0].type === "CNAME", r.data.records);
    r = await sf("GET", `/api/storefront/primary-domain?handle=${H}`);
    check("the Oyklane address doesn't forward to a domain that isn't live", r.data.domain === null, r.data);
    r = await sf("GET", `/api/storefront/resolve-domain?domain=growth-${stamp}.example.com`);
    check("the connected domain resolves to the store", r.data.handle === H, r.data);
    r = await owner("PATCH", "/api/store/domain/redirect", { redirect: false });
    check("turn off forwarding", r.status === 200 && r.data.redirect === false, r.data);
    r = await owner("PATCH", "/api/store/domain/handle", { handle: "store" });
    check("reserved names can't be a store address", r.status === 400, r.data);
    const newHandle = `growth-shop-${stamp}`;
    r = await owner("PATCH", "/api/store/domain/handle", { handle: newHandle });
    check("change the store's Oyklane address", r.status === 200 && r.data.handle === newHandle, r.data);
    check("same store, same id", (await prisma.store.findUnique({ where: { id: store.id } })).handle === newHandle);
    r = await sf("GET", `/api/storefront/${newHandle}/render/index`);
    check("store answers on its new address", r.status === 200);
    r = await owner("DELETE", "/api/store/domain");
    check("disconnect the domain", r.status === 200 && r.data.domain === null, r.data);

    // ── Platform overview is for the platform console only ──
    r = await owner("GET", "/api/super-admin/overview");
    check("a store owner can't read the platform overview", r.status === 401 || r.status === 403, r.status);
  } catch (err) {
    fail += 1;
    console.log(`FAIL  unexpected error: ${err.stack || err}`);
    console.log(api.log().slice(-3000));
  } finally {
    for (const { storeId, emails } of created) {
      await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
      await prisma.user.deleteMany({ where: { email: { in: emails } } }).catch(() => {});
    }
    await prisma.emailLog.deleteMany({ where: { to: { endsWith: "@test.oyklane.dev" } } }).catch(() => {});
    console.log("      (test stores, users and their emails deleted)");
    await prisma.$disconnect();
    api.child.kill();
    mock.close();
  }
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();

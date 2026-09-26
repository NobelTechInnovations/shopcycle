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
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "../../..");
require(path.join(ROOT, "apps/api/node_modules/dotenv")).config({ path: path.join(ROOT, ".env") });

const API_PORT = 4199;
const API = `http://localhost:${API_PORT}`;
const ORIGIN = process.env.ADMIN_ORIGIN || "http://localhost:3000";

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
    env: { ...process.env, API_PORT: String(API_PORT), NODE_ENV: "test", JOBS_DISABLED: "true", SMTP_HOST: "", RAZORPAY_KEY_ID: "", RAZORPAY_KEY_SECRET: "" },
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
  const api = await startApi();
  const { PrismaClient } = require(path.join(ROOT, "packages/database/node_modules/@prisma/client"));
  const prisma = new PrismaClient();
  const stamp = Date.now();
  const created = [];
  const owner = client();

  try {
    // ── Setup: a store with one product ──
    const ownerEmail = `growth-e2e-${stamp}@test.oyklane.dev`;
    let r = await owner("POST", "/api/auth/register", { name: "Growth Test", email: ownerEmail, password: "correct-horse-battery", storeName: `Growth E2E ${stamp}` });
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
  }
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();

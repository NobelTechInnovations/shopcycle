#!/usr/bin/env node
/**
 * End-to-end test of shopper essentials and merchant operations
 * (Phases 4–5), against a real API instance and a mock Razorpay:
 *
 *   seller email verification · password reset · products keep their
 *   variants · stock history · checkout (COD + online) · order emails ·
 *   order status page · escaping on storefront pages · partial and full
 *   shipping · delivery · returns · refunds (manual + Razorpay) ·
 *   cancellation with restock · shopper sign-in codes · order lookup ·
 *   abandoned checkout reminders · GST invoices · CSV export/import ·
 *   inventory adjustments · staff can't refund
 *
 *   node apps/api/test/e2e-orders.js
 *
 * Creates throwaway stores and deletes them when done, pass or fail.
 */
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { startRazorpayMock } = require("./razorpay-mock");

const ROOT = path.resolve(__dirname, "../../..");
require(path.join(ROOT, "apps/api/node_modules/dotenv")).config({ path: path.join(ROOT, ".env") });

const MOCK_PORT = 4297;
const API_PORT = 4198;
const API = `http://localhost:${API_PORT}`;
const ORIGIN = process.env.ADMIN_ORIGIN || "http://localhost:3000";
const KEY_SECRET = "mock_key_secret_for_tests";

let pass = 0;
let fail = 0;
function check(label, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${label}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${label}${detail !== undefined ? `  -- ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 600)}` : ""}`);
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
    return { status: res.status, data, headers: res.headers };
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
      API_PORT: String(API_PORT),
      NODE_ENV: "test",
      RAZORPAY_KEY_ID: "rzp_test_mock",
      RAZORPAY_KEY_SECRET: KEY_SECRET,
      RAZORPAY_WEBHOOK_SECRET: "mock_webhook_secret_for_tests",
      RAZORPAY_API_URL: `http://localhost:${MOCK_PORT}/v1`,
      JOBS_DISABLED: "true",
      SMTP_HOST: "",
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

const linkFrom = (html, pathPart) => {
  const m = String(html || "").match(new RegExp(`href="([^"]*${pathPart}[^"]*)"`));
  return m ? m[1].replace(/&amp;/g, "&") : null;
};

async function main() {
  const { server } = await startRazorpayMock(MOCK_PORT);
  const api = await startApi();
  const { PrismaClient } = require(path.join(ROOT, "packages/database/node_modules/@prisma/client"));
  const prisma = new PrismaClient();
  const stamp = Date.now();
  const email = `orders-e2e-${stamp}@test.oyklane.dev`;
  const created = []; // { storeId, emails[] }
  const owner = client();

  try {
    // ── Sign-up sends a verification email; the link verifies ──
    let r = await owner("POST", "/api/auth/register", {
      name: "Orders Test",
      email,
      password: "correct-horse-battery",
      storeName: `Orders E2E ${stamp}`,
    });
    check("register a store", r.status === 201, r.data);
    const store = r.data.store;
    created.push({ storeId: store.id, emails: [email] });
    check("new account starts unverified", r.data.user?.emailVerified === false, r.data.user);

    let log = await prisma.emailLog.findFirst({ where: { to: email, template: "email_verify" }, orderBy: { createdAt: "desc" } });
    check("verification email logged (no provider configured)", log?.status === "logged" && Boolean(log.html), log);
    const verifyLink = linkFrom(log?.html, "verify-email");
    const verifyToken = verifyLink && new URL(verifyLink).searchParams.get("token");
    r = await owner("POST", "/api/auth/email/verify", { token: verifyToken });
    check("verification link verifies the email", r.status === 200, r.data);
    r = await owner("POST", "/api/auth/email/verify", { token: verifyToken });
    check("verification link works only once", r.status === 400, r.data);
    r = await owner("GET", "/api/auth/me");
    check("/me reports the email verified", r.data.user?.emailVerified === true, r.data.user);

    // ── Password reset ──
    r = await owner("POST", "/api/auth/password/forgot", { email: "nobody-here@test.oyklane.dev" });
    check("forgot-password answers the same for unknown emails", r.status === 200 && r.data.ok === true, r.data);
    r = await owner("POST", "/api/auth/password/forgot", { email: email.toUpperCase() });
    check("forgot-password accepted", r.status === 200, r.data);
    let resetLog = null;
    for (let i = 0; i < 20 && !resetLog; i += 1) {
      resetLog = await prisma.emailLog.findFirst({ where: { to: email, template: "password_reset" } });
      if (!resetLog) await new Promise((res) => setTimeout(res, 250));
    }
    check("reset email logged", Boolean(resetLog?.html), resetLog);
    const resetToken = new URL(linkFrom(resetLog?.html, "reset-password")).searchParams.get("token");
    r = await owner("GET", `/api/auth/password/reset?token=${encodeURIComponent(resetToken)}`);
    check("reset link checks as valid", r.data.valid === true, r.data);
    r = await owner("POST", "/api/auth/password/reset", { token: resetToken, password: "short" });
    check("too-short new password refused", r.status === 400, r.data);
    r = await owner("POST", "/api/auth/password/reset", { token: resetToken, password: "a-brand-new-passphrase" });
    check("password reset succeeds", r.status === 200, r.data);
    r = await owner("GET", "/api/auth/me");
    check("reset signs out existing sessions", r.status === 401, r.status);
    r = await owner("POST", "/api/auth/password/reset", { token: resetToken, password: "another-new-passphrase" });
    check("reset link works only once", r.status === 400, r.data);
    r = await owner("POST", "/api/auth/login", { email, password: "correct-horse-battery" });
    check("old password no longer works", r.status === 401, r.status);
    r = await owner("POST", "/api/auth/login", { email, password: "a-brand-new-passphrase" });
    check("new password works", r.status === 200, r.data);
    log = await prisma.emailLog.findFirst({ where: { to: email, template: "password_changed" } });
    check("'password changed' notice emailed", Boolean(log), log);

    // ── Store details ──
    await prisma.store.update({
      where: { id: store.id },
      data: { supportEmail: "help@orders-e2e.test", billingName: "Orders E2E Pvt Ltd", gstin: "27AAPFU0939F1ZV", billingState: "Maharashtra", billingAddress: "1 Test Road, Pune" },
    });

    // ── Products keep their variants when edited; stock history ──
    r = await owner("POST", "/api/products", {
      title: "Cotton Tee",
      status: "active",
      hsnCode: "6109",
      variants: [
        { title: "M", sku: `TEE-M-${stamp}`, price: 500, inventoryQuantity: 10 },
        { title: "L", sku: `TEE-L-${stamp}`, price: 500, inventoryQuantity: 10 },
      ],
    });
    check("create product with two variants", r.status === 201 || r.status === 200, r.data);
    const product = r.data.product;
    const [vM, vL] = product.variants;
    let hist = await owner("GET", `/api/inventory/${vM.id}/history`);
    check("opening stock recorded in history", hist.data.history?.[0]?.reason === "received" && hist.data.history[0].delta === 10, hist.data);

    r = await owner("PATCH", `/api/products/${product.id}`, {
      variants: [
        { id: vM.id, title: "M", sku: vM.sku, price: 550 },
        { id: vL.id, title: "L", sku: vL.sku, price: 550, inventoryQuantity: 12 },
      ],
    });
    check("edit product", r.status === 200, r.data);
    const ids = r.data.product.variants.map((v) => v.id).sort();
    check("editing keeps variant ids (orders and carts stay linked)", JSON.stringify(ids) === JSON.stringify([vM.id, vL.id].sort()), ids);
    const mAfter = r.data.product.variants.find((v) => v.id === vM.id);
    const lAfter = r.data.product.variants.find((v) => v.id === vL.id);
    check("stock left alone when not sent", mAfter.inventoryQuantity === 10, mAfter);
    check("stock change applied", lAfter.inventoryQuantity === 12, lAfter);
    hist = await owner("GET", `/api/inventory/${vL.id}/history`);
    check("stock edit recorded as a correction", hist.data.history?.[0]?.reason === "correction" && hist.data.history[0].delta === 2, hist.data.history?.[0]);

    // ── Storefront checkout (COD) ──
    r = await sf("POST", `/api/storefront/${store.handle}/cart/add`, { variantId: vM.id, quantity: 2 });
    let cartId = r.data.cart?.cartId;
    r = await sf("POST", `/api/storefront/${store.handle}/cart/add`, { cartId, variantId: vL.id, quantity: 1 });
    check("cart holds 3 items", r.data.cart?.item_count === 3, r.data.cart);
    r = await sf("POST", `/api/storefront/${store.handle}/checkout/contact`, { cartId, email: "Shopper.One@test.oyklane.dev", name: "Shopper One" });
    check("checkout captures the shopper's email", r.data.captured === true, r.data);
    const shopper = {
      email: "shopper.one@test.oyklane.dev",
      phone: "9876543210",
      shippingName: "Shopper <b>One</b>",
      shippingAddress1: "12 MG Road",
      shippingCity: "Pune",
      shippingProvince: "MH",
      shippingZip: "411001",
      shippingCountry: "IN",
    };
    r = await sf("POST", `/api/storefront/${store.handle}/checkout`, { cartId, ...shopper, paymentMethod: "cod" });
    check("COD order placed", r.status === 201, r.data);
    const orderId = r.data.order?.id;
    const cartGone = await prisma.cartSession.findFirst({ where: { storeId: store.id, cartId } });
    check("cart removed after ordering (not abandoned)", !cartGone, cartGone);

    let order = (await owner("GET", `/api/orders/${orderId}`)).data.order;
    check("stock sold: M 10→8, L 12→11", order && (await prisma.productVariant.findUnique({ where: { id: vM.id } })).inventoryQuantity === 8 && (await prisma.productVariant.findUnique({ where: { id: vL.id } })).inventoryQuantity === 11);
    check("timeline records the order", order.events.some((e) => e.kind === "placed"), order.events);
    const confirmation = await prisma.emailLog.findFirst({ where: { refId: orderId, template: "order_confirmation" } });
    check("order confirmation emailed to the shopper", confirmation?.to === shopper.email, confirmation);
    const alert = await prisma.emailLog.findFirst({ where: { refId: orderId, template: "new_order_alert" } });
    check("new-order alert emailed to the store", alert?.to === "help@orders-e2e.test", alert);
    const statusToken = (await prisma.order.findUnique({ where: { id: orderId } })).statusToken;
    check("order has a status-page token", typeof statusToken === "string" && statusToken.length >= 20, statusToken);
    check("confirmation email links to the status page", String(confirmation?.html).includes(`/orders/${statusToken}`));

    // ── Storefront pages: order status, escaping ──
    r = await sf("GET", `/api/storefront/${store.handle}/render/order-status?orderToken=${statusToken}`);
    check("order status page renders", r.status === 200 && String(r.data).includes(`Order #${order.orderNumber}`), String(r.data).slice(0, 300));
    check("shopper-typed name is escaped on the page", String(r.data).includes("Shopper &lt;b&gt;One&lt;/b&gt;") && !String(r.data).includes("Shopper <b>One</b>"));
    r = await sf("GET", `/api/storefront/${store.handle}/render/order-status?orderToken=not-a-real-token`);
    check("unknown status token is a 404", r.status === 404, r.status);
    // (Checkout only shows its error with something in the cart.)
    const xssCart = (await sf("POST", `/api/storefront/${store.handle}/cart/add`, { variantId: vL.id, quantity: 1 })).data.cart.cartId;
    r = await sf("GET", `/api/storefront/${store.handle}/render/checkout?cartId=${xssCart}&checkoutError=${encodeURIComponent("<script>alert(1)</script>")}`);
    check(
      "?checkoutError is shown escaped, never as script",
      String(r.data).includes("&lt;script&gt;alert(1)&lt;/script&gt;") && !String(r.data).includes("<script>alert(1)</script>"),
      String(r.data).match(/.{0,40}alert\(1\).{0,40}/)?.[0]
    );
    await prisma.cartSession.deleteMany({ where: { storeId: store.id, cartId: xssCart } });
    r = await sf("GET", `/api/storefront/${store.handle}/render/search?q=${encodeURIComponent('"><img src=x onerror=alert(1)>')}`);
    check(
      "?q (search) is shown escaped, never as markup",
      String(r.data).includes("&lt;img src=x onerror=alert(1)&gt;") && !String(r.data).includes("<img src=x onerror=alert(1)>"),
      String(r.data).match(/.{0,40}onerror.{0,40}/)?.[0]
    );

    // ── Shipping in two parts ──
    const itemM = order.items.find((i) => i.variantId === vM.id);
    const itemL = order.items.find((i) => i.variantId === vL.id);
    r = await owner("POST", `/api/orders/${orderId}/fulfillments`, {
      items: [{ orderItemId: itemM.id, quantity: 1 }],
      courier: "Delhivery",
      trackingNumber: "AWB123",
    });
    check("partial shipment created", r.status === 201, r.data);
    check("Delhivery tracking link filled in", String(r.data.fulfillment?.trackingUrl).includes("delhivery.com") && r.data.fulfillment.trackingUrl.includes("AWB123"), r.data.fulfillment);
    order = (await owner("GET", `/api/orders/${orderId}`)).data.order;
    check("order is partially fulfilled", order.fulfillmentStatus === "partially_fulfilled", order.fulfillmentStatus);
    r = await owner("POST", `/api/orders/${orderId}/fulfillments`, { items: [{ orderItemId: itemM.id, quantity: 5 }] });
    check("can't ship more than was ordered", r.status === 400, r.data);
    r = await owner("POST", `/api/orders/${orderId}/fulfillments`, { courier: "Shiprocket", trackingNumber: "SR999" });
    check("ship the rest", r.status === 201, r.data);
    order = (await owner("GET", `/api/orders/${orderId}`)).data.order;
    check("order is fulfilled", order.fulfillmentStatus === "fulfilled", order.fulfillmentStatus);
    const shipEmails = await prisma.emailLog.count({ where: { refId: orderId, template: "shipping_update" } });
    check("shopper emailed for each shipment", shipEmails === 2, shipEmails);
    r = await owner("POST", `/api/orders/${orderId}/fulfillments`, {});
    check("nothing left to ship", r.status === 400, r.data);
    for (const f of order.fulfillments) await owner("POST", `/api/orders/${orderId}/fulfillments/${f.id}`, { action: "delivered" });
    r = await sf("GET", `/api/storefront/${store.handle}/render/order-status?orderToken=${statusToken}`);
    check("status page shows Delivered", String(r.data).includes("Delivered"), "");

    // ── Returns (shopper) → received → refund ──
    r = await sf("POST", `/api/storefront/${store.handle}/orders/${statusToken}/returns`, {
      items: [{ orderItemId: itemM.id, quantity: 1 }],
      reason: "Wrong size or fit",
    });
    check("shopper can request a return", r.status === 201, r.data);
    r = await sf("POST", `/api/storefront/${store.handle}/orders/${statusToken}/returns`, { items: [{ orderItemId: itemL.id, quantity: 1 }], reason: "x" });
    check("only one return in progress at a time", r.status === 400, r.data);
    order = (await owner("GET", `/api/orders/${orderId}`)).data.order;
    const ret = order.returns[0];
    r = await owner("POST", `/api/orders/${orderId}/returns/${ret.id}`, { action: "receive" });
    check("can't receive before approving", r.status === 400, r.data);
    r = await owner("POST", `/api/orders/${orderId}/returns/${ret.id}`, { action: "approve", merchantNote: "Pickup tomorrow" });
    check("approve return", r.status === 200 && r.data.return.status === "approved", r.data);
    r = await owner("POST", `/api/orders/${orderId}/returns/${ret.id}`, { action: "receive", restock: true });
    check("receive return (restocks)", r.status === 200, r.data);
    check("returned unit back in stock (M 8→9)", (await prisma.productVariant.findUnique({ where: { id: vM.id } })).inventoryQuantity === 9);
    r = await owner("POST", `/api/orders/${orderId}/refunds`, { amount: 550, reason: "Return", returnId: ret.id });
    check("unpaid COD order can't be refunded", r.status === 400, r.data);
    r = await owner("POST", `/api/orders/${orderId}/mark-paid`, {});
    check("COD collected → paid", r.status === 200, r.data);
    r = await owner("POST", `/api/orders/${orderId}/refunds`, { amount: 99999, reason: "Too much" });
    check("can't refund more than was paid", r.status === 400, r.data);
    r = await owner("POST", `/api/orders/${orderId}/refunds`, { items: [{ orderItemId: itemM.id, quantity: 1 }], amount: 550, reason: "Return", returnId: ret.id });
    check("refund for the return", r.status === 201 && r.data.refund?.method === "manual", r.data);
    order = (await owner("GET", `/api/orders/${orderId}`)).data.order;
    check("order partially refunded", order.paymentStatus === "partially_refunded" && Number(order.refundedAmount) === 550, [order.paymentStatus, order.refundedAmount]);
    check("return closed by the refund", order.returns[0].status === "closed", order.returns[0].status);
    check("refund email sent", (await prisma.emailLog.count({ where: { refId: orderId, template: "refund_issued" } })) === 1);

    // ── Cancellation restocks ──
    r = await sf("POST", `/api/storefront/${store.handle}/cart/add`, { variantId: vL.id, quantity: 3 });
    cartId = r.data.cart.cartId;
    r = await sf("POST", `/api/storefront/${store.handle}/checkout`, { cartId, ...shopper, shippingName: "Shopper One", paymentMethod: "cod" });
    const order2Id = r.data.order.id;
    check("L 11→8 after second order", (await prisma.productVariant.findUnique({ where: { id: vL.id } })).inventoryQuantity === 8);
    r = await owner("POST", `/api/orders/${order2Id}/cancel`, { reason: "Customer changed their mind", restock: true });
    check("cancel order", r.status === 200, r.data);
    check("cancelling restocks (L back to 11)", (await prisma.productVariant.findUnique({ where: { id: vL.id } })).inventoryQuantity === 11);
    let o2 = (await owner("GET", `/api/orders/${order2Id}`)).data.order;
    check("order marked cancelled", o2.fulfillmentStatus === "cancelled" && o2.cancelReason === "Customer changed their mind", o2);
    check("cancellation email sent", (await prisma.emailLog.count({ where: { refId: order2Id, template: "order_cancelled" } })) === 1);
    r = await owner("POST", `/api/orders/${order2Id}/cancel`, {});
    check("can't cancel twice", r.status === 400, r.data);
    const cancelHistory = (await owner("GET", `/api/inventory/${vL.id}/history`)).data.history;
    check("history shows the sale and the cancellation", cancelHistory.some((h) => h.reason === "order_cancelled" && h.orderNumber === o2.orderNumber), cancelHistory.slice(0, 3));

    // ── Online payment → full refund through Razorpay ──
    r = await sf("POST", `/api/storefront/${store.handle}/cart/add`, { variantId: vM.id, quantity: 1 });
    cartId = r.data.cart.cartId;
    r = await sf("POST", `/api/storefront/${store.handle}/checkout`, { cartId, ...shopper, shippingName: "Online Buyer", paymentMethod: "razorpay" });
    check("online order created (pending payment)", r.status === 201 && r.data.razorpay?.orderId, r.data);
    const order3Id = r.data.order.id;
    const rzpOrder = r.data.razorpay.orderId;
    check("no confirmation before payment", (await prisma.emailLog.count({ where: { refId: order3Id, template: "order_confirmation" } })) === 0);
    const sig = crypto.createHmac("sha256", KEY_SECRET).update(`${rzpOrder}|pay_online_1`).digest("hex");
    r = await sf("POST", "/api/storefront/checkout/razorpay/verify", { orderId: order3Id, razorpay_order_id: rzpOrder, razorpay_payment_id: "pay_online_1", razorpay_signature: sig });
    check("payment verified", r.status === 200 && r.data.order?.paymentStatus === "paid", r.data);
    await sf("POST", "/api/storefront/checkout/razorpay/verify", { orderId: order3Id, razorpay_order_id: rzpOrder, razorpay_payment_id: "pay_online_1", razorpay_signature: sig });
    check("confirmation sent exactly once (double callback)", (await prisma.emailLog.count({ where: { refId: order3Id, template: "order_confirmation" } })) === 1);
    r = await owner("POST", `/api/orders/${order3Id}/refunds`, { amount: 550, reason: "Out of stock", restock: true, items: [{ orderItemId: (await prisma.orderItem.findFirst({ where: { orderId: order3Id } })).id, quantity: 1 }] });
    check("full refund through Razorpay", r.status === 201 && r.data.refund?.method === "razorpay" && /^rfnd_/.test(r.data.refund.razorpayRefundId || ""), r.data);
    const o3 = (await owner("GET", `/api/orders/${order3Id}`)).data.order;
    check("order fully refunded", o3.paymentStatus === "refunded", o3.paymentStatus);

    // ── Shopper sign-in by code ──
    r = await sf("POST", `/api/storefront/${store.handle}/account/code`, { email: "Shopper.One@test.oyklane.dev" });
    check("sign-in code requested", r.status === 200, r.data);
    const codeMail = await prisma.emailLog.findFirst({ where: { storeId: store.id, template: "sign_in_code" }, orderBy: { createdAt: "desc" } });
    const code = String(codeMail?.html || "").match(/>(\d)<\/div><\/td>/g)?.map((m) => m[1]).join("");
    check("code emailed from the store", /^\d{6}$/.test(code || "") && codeMail.to === "shopper.one@test.oyklane.dev", codeMail?.subject);
    check("the store's email log doesn't show the code", Boolean(code) && !String(codeMail?.subject).includes(code), codeMail?.subject);
    r = await owner("GET", `/api/email-log/store/${codeMail.id}`);
    check("staff can't open a sign-in code email", r.status === 200 && r.data.email?.html === null, r.data.email?.html?.slice(0, 40));
    const wrong = code === "000000" ? "111111" : "000000";
    r = await sf("POST", `/api/storefront/${store.handle}/account/code/verify`, { email: "shopper.one@test.oyklane.dev", code: wrong });
    check("wrong code refused", r.status === 400, r.data);
    r = await sf("POST", `/api/storefront/${store.handle}/account/code/verify`, { email: "SHOPPER.ONE@test.oyklane.dev", code });
    check("right code signs in (email case ignored)", r.status === 200 && r.data.token, r.data);
    const shopperToken = r.data.token;
    r = await sf("POST", `/api/storefront/${store.handle}/account/code/verify`, { email: "shopper.one@test.oyklane.dev", code });
    check("a code works once", r.status === 400, r.data);
    const customerCount = await prisma.customer.count({ where: { storeId: store.id, email: { equals: "shopper.one@test.oyklane.dev", mode: "insensitive" } } });
    check("sign-in reuses the checkout customer (no duplicate)", customerCount === 1, customerCount);
    r = await sf("GET", `/api/storefront/${store.handle}/render/account`, undefined, { "x-shopper-token": shopperToken });
    check("account page lists the shopper's orders", r.status === 200 && String(r.data).includes(`Order #${order.orderNumber}`), String(r.data).slice(0, 200));
    r = await sf("GET", `/api/storefront/${store.handle}/render/account`, undefined, { "x-shopper-token": "forged.token.value" });
    check("forged session shows the signed-out page", r.status === 200 && String(r.data).includes("Sign in"), "");
    r = await sf("POST", `/api/storefront/${store.handle}/account/profile`, { name: "Shopper One", phone: "9876543210", city: "Mumbai", province: "Maharashtra" }, { "x-shopper-token": shopperToken });
    check("profile saved", r.status === 200, r.data);
    r = await sf("GET", `/api/storefront/${store.handle}/render/checkout`, undefined, { "x-shopper-token": shopperToken });
    check("checkout pre-fills a signed-in shopper", String(r.data).includes('"shippingCity":"Mumbai"'), "");
    r = await sf("POST", `/api/storefront/${store.handle}/account/sign-out-everywhere`, {}, { "x-shopper-token": shopperToken });
    r = await sf("POST", `/api/storefront/${store.handle}/account/profile`, { name: "X" }, { "x-shopper-token": shopperToken });
    check("sign out everywhere revokes the session", r.status === 401, r.status);

    // ── Order lookup ──
    r = await sf("POST", `/api/storefront/${store.handle}/orders/lookup`, { orderNumber: `#${order.orderNumber}`, email: "SHOPPER.ONE@test.oyklane.dev" });
    check("lookup by number + email", r.status === 200 && r.data.token === statusToken, r.data);
    r = await sf("POST", `/api/storefront/${store.handle}/orders/lookup`, { orderNumber: String(order.orderNumber), email: "someone-else@test.oyklane.dev" });
    check("lookup with the wrong email finds nothing", r.status === 404, r.data);

    // ── Abandoned checkout ──
    r = await sf("POST", `/api/storefront/${store.handle}/cart/add`, { variantId: vM.id, quantity: 1 });
    const abandonedCart = r.data.cart.cartId;
    await sf("POST", `/api/storefront/${store.handle}/checkout/contact`, { cartId: abandonedCart, email: "leaver@test.oyklane.dev", name: "Lee Ver" });
    r = await owner("GET", "/api/orders/abandoned");
    check("abandoned checkout listed for the merchant", r.data.checkouts?.some((c) => c.email === "leaver@test.oyklane.dev" && c.itemCount === 1), r.data);
    await prisma.cartSession.update({ where: { storeId_cartId: { storeId: store.id, cartId: abandonedCart } }, data: { checkoutStartedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) } });
    const { sweepAbandonedCheckouts } = require(path.join(ROOT, "apps/api/src/modules/checkout/abandoned"));
    let sweep = await sweepAbandonedCheckouts(prisma, { delayMinutes: 60 });
    check("reminder sent after the delay", sweep.sent >= 1, sweep);
    const reminder = await prisma.emailLog.findFirst({ where: { to: "leaver@test.oyklane.dev", template: "abandoned_checkout" } });
    check("reminder email logged with a recovery link", String(reminder?.html).includes("/cart/recover/"), reminder?.subject);
    sweep = await sweepAbandonedCheckouts(prisma, { delayMinutes: 60 });
    check("only one reminder per checkout", (await prisma.emailLog.count({ where: { to: "leaver@test.oyklane.dev", template: "abandoned_checkout" } })) === 1, sweep);
    const recoveryToken = (await prisma.cartSession.findFirst({ where: { storeId: store.id, cartId: abandonedCart } })).recoveryToken;
    r = await sf("POST", `/api/storefront/${store.handle}/cart/recover`, { token: recoveryToken });
    check("recovery link restores the cart", r.data.cartId === abandonedCart, r.data);

    // ── GST invoice (Premium) ──
    r = await owner("POST", `/api/orders/${orderId}/invoice`, {});
    check("GST invoices are Premium-only", r.status === 403, r.data);
    const premium = await prisma.plan.findUnique({ where: { name: "Premium" } });
    await prisma.store.update({ where: { id: store.id }, data: { planId: premium.id, subscriptionStatus: "trialing", trialEndsAt: new Date(Date.now() + 20 * 86400000) } });
    r = await owner("POST", `/api/orders/${orderId}/invoice`, {});
    check("invoice issued on Premium", r.status === 200 && /^INV-\d{4}-0001$/.test(r.data.invoiceNumber || ""), r.data);
    const firstNumber = r.data.invoiceNumber;
    r = await owner("POST", `/api/orders/${orderId}/invoice`, {});
    check("issuing again returns the same number", r.data.invoiceNumber === firstNumber, r.data);
    r = await owner("GET", `/api/orders/${orderId}/invoice`);
    check("same-state delivery → CGST + SGST", r.data.invoice?.taxType === "cgst_sgst" && r.data.invoice.placeOfSupply.startsWith("Maharashtra"), r.data.invoice);
    check("HSN code on the invoice lines", r.data.invoice?.lines?.[0]?.hsn === "6109", r.data.invoice?.lines);
    r = await sf("GET", `/api/storefront/${store.handle}/orders/${statusToken}/invoice`);
    check("shopper can open the invoice", r.status === 200 && String(r.data).includes(firstNumber) && String(r.data).includes("27AAPFU0939F1ZV"), String(r.data).slice(0, 200));

    // ── CSV (Premium) ──
    await prisma.customer.create({ data: { storeId: store.id, name: '=HYPERLINK("http://evil.test","x")', email: `formula-${stamp}@test.oyklane.dev` } });
    r = await owner("GET", "/api/data/exports/customers");
    check("customers export", r.status === 200 && String(r.data).includes("Amount Spent"), String(r.data).slice(0, 120));
    check("formula cells are neutralised in exports", String(r.data).includes(`"'=HYPERLINK(`) && !/(^|,)"?=HYPERLINK/m.test(String(r.data)), String(r.data).split("\n").find((l) => l.includes("HYPERLINK")));
    r = await owner("GET", "/api/data/exports/orders");
    check("orders export includes the invoice number", String(r.data).includes(firstNumber), "");
    r = await owner("GET", "/api/data/exports/products");
    const productsCsv = String(r.data);
    check("products export", productsCsv.includes(vM.sku), productsCsv.slice(0, 200));
    const importCsv = [
      "Handle,Title,Status,Variant Title,SKU,Price,Inventory",
      `cotton-tee,Cotton Tee,active,M,${vM.sku},599,40`,
      `new-mug-${stamp},Stoneware Mug,active,Default,MUG-${stamp},349,15`,
      `bad-row-${stamp},Broken,active,Default,,not-a-price,1`,
    ].join("\n");
    r = await owner("POST", "/api/data/imports/products", { csv: importCsv, dryRun: true });
    check("import dry run reports without writing", r.data.created === 1 && r.data.updated === 1 && r.data.errors?.length === 1, r.data);
    check("dry run changed nothing", (await prisma.productVariant.findUnique({ where: { id: vM.id } })).inventoryQuantity === 9);
    r = await owner("POST", "/api/data/imports/products", { csv: importCsv });
    check("import creates and updates", r.data.created === 1 && r.data.updated === 1 && r.data.errors?.[0]?.line === 4, r.data);
    const mImported = await prisma.productVariant.findUnique({ where: { id: vM.id } });
    check("import updates price and stock by SKU", Number(mImported.price) === 599 && mImported.inventoryQuantity === 40, mImported);

    // ── Inventory adjustments ──
    r = await owner("POST", "/api/inventory/adjust", { variantId: vM.id, mode: "add", quantity: -2, reason: "damaged", note: "Torn in transit" });
    check("adjust: −2 damaged", r.status === 200 && r.data.inventoryQuantity === 38, r.data);
    r = await owner("POST", "/api/inventory/adjust", { variantId: vM.id, mode: "set", quantity: 50, reason: "correction" });
    check("adjust: set to 50 (stocktake)", r.data.inventoryQuantity === 50 && r.data.adjustment?.delta === 12, r.data);
    r = await owner("GET", "/api/inventory?filter=all");
    check("inventory list", r.status === 200 && r.data.variants?.length >= 3, r.data);

    // ── Staff can't refund ──
    const staffEmail = `orders-staff-${stamp}@test.oyklane.dev`;
    const bcrypt = require(path.join(ROOT, "apps/api/node_modules/bcryptjs"));
    const staffUser = await prisma.user.create({ data: { name: "Staff Member", email: staffEmail, passwordHash: await bcrypt.hash("staff-passphrase-1", 10), emailVerifiedAt: new Date() } });
    created[0].emails.push(staffEmail);
    await prisma.storeUser.create({ data: { storeId: store.id, userId: staffUser.id, role: "staff" } });
    const staff = client();
    await staff("POST", "/api/auth/login", { email: staffEmail, password: "staff-passphrase-1" });
    r = await staff("POST", `/api/orders/${orderId}/refunds`, { amount: 10, reason: "test" });
    check("staff can't issue refunds", r.status === 403, r.data);
    r = await staff("POST", `/api/orders/${orderId}/notes`, { note: "Called the customer" });
    check("staff can add notes", r.status === 201, r.data);

    // ── Legacy status endpoint runs the real actions ──
    r = await owner("POST", "/api/orders", { paymentStatus: "pending", items: [{ title: "Phone order", quantity: 1, price: 100, variantId: vL.id }] });
    const manual = r.data.order;
    check("manual order takes stock (L 11→10)", (await prisma.productVariant.findUnique({ where: { id: vL.id } })).inventoryQuantity === 10);
    r = await owner("PATCH", `/api/orders/${manual.id}/status`, { fulfillmentStatus: "cancelled" });
    check("legacy cancel restocks too (L back to 11)", r.status === 200 && (await prisma.productVariant.findUnique({ where: { id: vL.id } })).inventoryQuantity === 11, r.data);
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
    server.close();
  }
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();

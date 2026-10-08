/**
 * UPI QR app, end to end against a real API and the shared database:
 * set up the UPI ID · checkout shows "UPI QR" · placing an order leads to
 * the QR page (QR with the amount, timer) · an unreported order isn't an
 * order yet · wrong / reused UTRs refused · "I've paid" places it and
 * alerts the seller · "Received" makes it paid and the QR page sees it ·
 * "Not received" cancels and restocks · numbers on the app page.
 *
 * Creates a throwaway store and deletes it when done, pass or fail.
 */
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "../../..");
require(path.join(ROOT, "apps/api/node_modules/dotenv")).config({ path: path.join(ROOT, ".env") });
Object.assign(process.env, { SMTP_HOST: "", EMAIL_PROVIDER: "log", SMS_PROVIDER: "log", WHATSAPP_PROVIDER: "log", MEDIA_STORAGE: "database" });

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
    return { status: res.status, data };
  };
}
const sf = client();

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

async function main() {
  const { prisma } = require(path.join(ROOT, "packages/database/src/client.js"));
  // The catalog row is seeded in production only; make it for the test if missing.
  let madeApp = false;
  if (!(await prisma.app.findUnique({ where: { key: "upi-qr" } }))) {
    await prisma.app.create({ data: { key: "upi-qr", name: "UPI QR payments", description: "test", category: "checkout", iconKey: "qr-code", settingsSchema: [] } });
    madeApp = true;
  }
  const api = await startApi();
  const stamp = Date.now();
  const email = `upi-e2e-${stamp}@test.oyklane.dev`;
  const owner = client();
  let storeId = null;

  try {
    let r = await owner("POST", "/api/auth/register", { name: "UPI Test", email, password: "correct-horse-battery", storeName: `UPI E2E ${stamp}`, plan: "growth" });
    check("register a store", r.status === 201, r.data);
    const store = r.data.store;
    storeId = store.id;

    r = await owner("POST", "/api/products", { title: "Kaju Katli 500g", status: "active", variants: [{ title: "Default", sku: `KK-${stamp}`, price: 450, inventoryQuantity: 10 }] });
    const variant = r.data.product?.variants?.[0];
    check("product created", Boolean(variant), r.data);

    r = await owner("GET", "/api/upi-qr");
    check("app page needs the app installed", r.status === 404, r.status);
    r = await owner("POST", "/api/apps/upi-qr/install", {});
    check("install UPI QR", r.status === 200 || r.status === 201, r.data);
    r = await owner("PUT", "/api/upi-qr/settings", { upiId: "not-a-upi-id", payeeName: "Ram" });
    check("bad UPI ID refused", r.status === 400, r.data);

    const shopper = { email: "upi.buyer@test.oyklane.dev", phone: "9876543210", shippingName: "Upi Buyer", shippingAddress1: "1 MG Road", shippingCity: "Jaipur", shippingProvince: "RJ", shippingZip: "302001", shippingCountry: "IN" };
    const addToCart = async () => (await sf("POST", `/api/storefront/${store.handle}/cart/add`, { variantId: variant.id, quantity: 2 })).data.cart?.cartId;

    let cartId = await addToCart();
    r = await sf("POST", `/api/storefront/${store.handle}/checkout`, { cartId, ...shopper, paymentMethod: "upi_qr", returnBase: "https://shop.example" });
    check("UPI QR refused before a UPI ID is set", r.status === 400, r.data);

    r = await owner("PUT", "/api/upi-qr/settings", { upiId: "ramsweets@okhdfcbank", payeeName: "Ram Sweets", minutes: 5 });
    check("UPI ID saved", r.status === 200 && r.data.settings.upiId === "ramsweets@okhdfcbank", r.data);
    r = await owner("GET", "/api/upi-qr/preview");
    check("₹1 test QR made", /<svg[\s\S]*url\(#oyg\)/.test(r.data.svg || ""), String(r.data.svg).slice(0, 120));

    r = await sf("GET", `/api/storefront/${store.handle}/render/checkout?cartId=${cartId}`);
    check("checkout offers UPI QR", /value="upi_qr:upi_qr"/.test(r.data), "no option");

    r = await sf("POST", `/api/storefront/${store.handle}/checkout`, { cartId, ...shopper, paymentMethod: "upi_qr", payMode: "upi_qr", returnBase: "https://shop.example" });
    check("order goes to the QR page", r.status === 201 && r.data.payment?.kind === "redirect" && /^https:\/\/shop\.example\/checkout\/upi\?order=/.test(r.data.payment.url), r.data);
    const orderId = r.data.order?.id;

    r = await sf("GET", `/api/storefront/${store.handle}/render/upi-pay?orderId=${orderId}&cartId=${cartId}`);
    check("QR page shows the QR, amount and timer", r.status === 200 && /<svg/.test(r.data) && /data-upi-clock/.test(r.data) && /900/.test(r.data), String(r.data).slice(0, 300));
    r = await sf("GET", `/api/storefront/${store.handle}/render/upi-pay?orderId=${orderId}&cartId=someone-else`);
    check("another cart can't open the QR", r.status === 404, r.status);

    r = await owner("GET", "/api/orders");
    check("unreported UPI order isn't in Orders yet", !(r.data.orders || []).some((o) => o.id === orderId), (r.data.orders || []).map((o) => o.id));

    r = await sf("GET", `/api/storefront/${store.handle}/checkout/upi/${orderId}/status?cartId=${cartId}`);
    check("status: QR showing", r.data.status === "awaiting" && r.data.secondsLeft > 250, r.data);

    r = await sf("POST", `/api/storefront/${store.handle}/checkout/upi/${orderId}/submit`, { cartId, utr: "12345" });
    check("short UTR refused", r.status === 400, r.data);
    r = await sf("POST", `/api/storefront/${store.handle}/checkout/upi/${orderId}/submit`, { cartId, utr: "4123 4567 8901" });
    check("'I've paid' with the UTR", r.status === 200 && r.data.status === "submitted", r.data);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    check("order now placed, payment still to check", order.paymentReference === "412345678901" && order.paymentStatus === "pending", order);
    r = await owner("GET", "/api/orders");
    check("reported UPI order shows in Orders", (r.data.orders || []).some((o) => o.id === orderId), r.data.orders?.length);
    const cartLeft = await prisma.cartSession.findFirst({ where: { storeId, cartId } });
    check("cart cleared after reporting", !cartLeft, cartLeft);
    const alert = await prisma.emailLog.findFirst({ where: { storeId, template: "upi_payment_alert" } });
    check("seller emailed to check the payment", Boolean(alert) && /412345678901/.test(alert.html || JSON.stringify(alert.payload || "")), alert?.subject);

    r = await owner("GET", "/api/upi-qr");
    check("app page: 1 to check", r.data.stats?.toCheck === 1 && r.data.payments?.[0]?.utr === "412345678901", r.data.stats);
    const paymentId = r.data.payments[0].id;
    r = await owner("POST", `/api/upi-qr/${paymentId}/confirm`);
    check("Received", r.status === 200 && r.data.payment.status === "confirmed", r.data);
    check("order is paid", (await prisma.order.findUnique({ where: { id: orderId } })).paymentStatus === "paid");
    r = await sf("GET", `/api/storefront/${store.handle}/checkout/upi/${orderId}/status`);
    check("QR page sees it confirmed", r.data.status === "confirmed", r.data);

    // Second order: the same UTR again, then "Not received".
    cartId = await addToCart();
    r = await sf("POST", `/api/storefront/${store.handle}/checkout`, { cartId, ...shopper, paymentMethod: "upi_qr", returnBase: "https://shop.example" });
    const order2 = r.data.order?.id;
    r = await sf("POST", `/api/storefront/${store.handle}/checkout/upi/${order2}/submit`, { cartId, utr: "412345678901" });
    check("a UTR already used is refused", r.status === 400, r.data);
    r = await sf("POST", `/api/storefront/${store.handle}/checkout/upi/${order2}/submit`, { cartId, utr: "512345678901" });
    const stockBefore = (await prisma.productVariant.findUnique({ where: { id: variant.id } })).inventoryQuantity;
    r = await owner("GET", "/api/upi-qr?status=submitted");
    r = await owner("POST", `/api/upi-qr/${r.data.payments[0].id}/reject`);
    check("Not received", r.status === 200 && r.data.payment.status === "rejected", r.data);
    const o2 = await prisma.order.findUnique({ where: { id: order2 } });
    const stockAfter = (await prisma.productVariant.findUnique({ where: { id: variant.id } })).inventoryQuantity;
    check("order cancelled and stock back", Boolean(o2.cancelledAt) && stockAfter === stockBefore + 2, { cancelledAt: o2.cancelledAt, stockBefore, stockAfter });

    r = await owner("GET", "/api/upi-qr?status=all");
    check("history and numbers", r.data.total === 2 && r.data.stats.confirmed30 === 1 && r.data.stats.collected30 === 900 && r.data.stats.conversion30 === 50, r.data.stats);

    // Third order: "I've paid" without a reference.
    cartId = await addToCart();
    r = await sf("POST", `/api/storefront/${store.handle}/checkout`, { cartId, ...shopper, paymentMethod: "upi_qr", returnBase: "https://shop.example" });
    const order3 = r.data.order?.id;
    r = await sf("POST", `/api/storefront/${store.handle}/checkout/upi/${order3}/submit`, { cartId, utr: "" });
    check("'I've paid' without a reference", r.status === 200 && r.data.status === "submitted", r.data);
    check("…order placed, payment to check", Boolean((await prisma.order.findUnique({ where: { id: order3 } })).paymentReference));

    // Automatic confirmation from bank SMS.
    r = await owner("PUT", "/api/upi-qr/auto-sms", { on: true });
    check("auto-confirm on: a secret link", r.status === 200 && /\/api\/public\/upi-sms\/[a-f0-9]{36}$/.test(r.data.smsUrl || ""), r.data);
    const hook = new URL(r.data.smsUrl).pathname;
    cartId = await addToCart();
    r = await sf("POST", `/api/storefront/${store.handle}/checkout`, { cartId, ...shopper, paymentMethod: "upi_qr", returnBase: "https://shop.example" });
    const order4 = r.data.order?.id;
    const p4 = await prisma.upiPayment.findUnique({ where: { orderId: order4 } });
    check("same amount showing → a few paise less", Number(p4.amount) === 899.99, Number(p4.amount));
    r = await sf("POST", hook, { text: "Rs.500.00 debited from A/c XX1234 to VPA x@ybl UPI Ref No 712345678901" });
    check("a debit SMS is ignored", r.status === 200 && r.data.ok === false, r.data);
    r = await sf("POST", hook, { message: "Money Received - INR 899.99 in your A/c XX1234 on 08-10-26 from VPA buyer@ybl UPI Ref:612345678901" });
    check("credit SMS confirms the matching QR", r.status === 200 && r.data.ok === true && (await prisma.order.findUnique({ where: { id: order4 } })).paymentStatus === "paid", r.data);
    r = await sf("GET", `/api/storefront/${store.handle}/checkout/upi/${order4}/status?cartId=${cartId}`);
    check("…and the QR page moves on", r.data.status === "confirmed", r.data);
    r = await sf("POST", hook, { text: "Your A/c XX1234 is credited with Rs 900.00 (UPI Ref No 812345678901)" });
    check("…a reported payment too", r.data.ok === true && (await prisma.order.findUnique({ where: { id: order3 } })).paymentStatus === "paid", r.data);
    r = await sf("POST", hook.replace(/[a-f0-9]{36}$/, "0".repeat(36)), { text: "credited Rs 1" });
    check("a wrong link is refused", r.status === 404, r.status);

    // A live gateway takes UPI over.
    const upiService = require("../src/modules/upi/service");
    const gw = await prisma.paymentProvider.create({ data: { storeId, provider: "razorpay", enabled: true, testMode: false, credentials: "x" } });
    check("hidden while a gateway is live", (await upiService.availableSettings(prisma, storeId)) === null && (await upiService.liveGateway(prisma, storeId)) === "Razorpay");
    await prisma.paymentProvider.update({ where: { id: gw.id }, data: { testMode: true } });
    check("…back when it's in test mode", Boolean(await upiService.availableSettings(prisma, storeId)));
  } catch (err) {
    fail += 1;
    console.log(`FAIL  unexpected error: ${err.stack || err}`);
    console.log(api.log().slice(-3000));
  } finally {
    if (storeId) await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { email } }).catch(() => {});
    await prisma.emailLog.deleteMany({ where: { to: { endsWith: "@test.oyklane.dev" } } }).catch(() => {});
    if (madeApp) await prisma.app.delete({ where: { key: "upi-qr" } }).catch(() => {});
    console.log("      (test store, user, emails" + (madeApp ? " and the catalog row" : "") + " deleted)");
    await prisma.$disconnect();
    api.child.kill();
  }
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();

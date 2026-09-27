#!/usr/bin/env node
/**
 * End-to-end test of platform billing against a mock Razorpay:
 * subscribe → trial plan changes → commission → renewals & invoices →
 * scheduled downgrade → refunds → checkout payment binding.
 *
 *   node apps/api/test/e2e-billing.js
 *   KEEP_TEST_STORE=1 node apps/api/test/e2e-billing.js   (keep the store to inspect)
 *
 * Starts its own Razorpay mock and its own API instance (port 4199) using
 * the database in the root .env, creates a throwaway store, and deletes
 * that store and its owner when done — pass or fail. Exits non-zero on
 * any failed check.
 */
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { startRazorpayMock } = require("./razorpay-mock");

const ROOT = path.resolve(__dirname, "../../..");
require(path.join(ROOT, "apps/api/node_modules/dotenv")).config({ path: path.join(ROOT, ".env") });

const MOCK_PORT = 4299;
const API_PORT = 4199;
const API = `http://localhost:${API_PORT}`;
const ORIGIN = process.env.ADMIN_ORIGIN || "http://localhost:3000";
const KEY_SECRET = "mock_key_secret_for_tests";
const WEBHOOK_SECRET = "mock_webhook_secret_for_tests";

let pass = 0;
let fail = 0;
function check(label, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${label}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${label}${detail !== undefined ? `  -- ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  }
}

// ── tiny HTTP client with a cookie jar ──
const jar = {};
async function call(method, url, body, headers = {}) {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: {
      ...(body !== undefined && { "content-type": "application/json" }),
      ...(method !== "GET" && { origin: ORIGIN }),
      cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; "),
      ...headers,
    },
    body: body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
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
}

function sign(secret, payload) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

let eventSeq = 0;
async function webhook(eventName, { subscriptionId, paymentId, amountPaise, start, end }) {
  eventSeq += 1;
  const eventId = `evt_test_${Date.now()}_${eventSeq}`;
  const raw = JSON.stringify({
    event: eventName,
    payload: {
      subscription: { entity: { id: subscriptionId, current_start: start, current_end: end } },
      payment: { entity: { id: paymentId, amount: amountPaise, subscription_id: subscriptionId, status: "captured" } },
    },
  });
  const res = await call("POST", "/api/webhooks/razorpay", raw, {
    "x-razorpay-signature": sign(WEBHOOK_SECRET, raw),
    "x-razorpay-event-id": eventId,
    origin: "",
  });
  return { ...res, eventId, raw };
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
      RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
      RAZORPAY_API_URL: `http://localhost:${MOCK_PORT}/v1`,
      PLATFORM_STATE: "Maharashtra",
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

async function main() {
  const { server, calls } = await startRazorpayMock(MOCK_PORT);
  const api = await startApi();
  const { PrismaClient } = require(path.join(ROOT, "packages/database/node_modules/@prisma/client"));
  const prisma = new PrismaClient();
  const email = `billing-e2e-${Date.now()}@test.oyklane.dev`;
  let storeId;
  // Subscribing makes the API create Razorpay plans and save their ids on
  // the shared Plan rows. Snapshot them so the real plans never end up
  // pointing at mock plan ids after the test.
  const planIdsBefore = await prisma.plan.findMany({ select: { id: true, razorpayPlanId: true } });

  try {
    // ── Register a fresh store ──
    let r = await call("POST", "/api/auth/register", {
      name: "Billing Test",
      email,
      password: "correct-horse-battery",
      storeName: `Billing E2E ${Date.now()}`,
    });
    check("register a new store", r.status === 201, r.data);
    storeId = r.data?.store?.id;

    r = await call("GET", "/api/store/billing");
    const plans = Object.fromEntries((r.data.plans || []).map((p) => [p.name, p]));
    check("new store starts with no plan", r.data.billing?.subscriptionStatus === "no_plan", r.data.billing);
    check("both plans offered", Boolean(plans.Starter && plans.Premium), Object.keys(plans));

    // ── Subscribe to Starter (mandate) ──
    r = await call("POST", "/api/store/subscribe", { planId: plans.Starter.id });
    const subscriptionId = r.data.subscriptionId;
    check("subscribe creates a Razorpay subscription", r.status === 200 && /^sub_/.test(subscriptionId || ""), r.data);
    // A subscription Razorpay holds for some other store, genuinely signed.
    const otherStoreSub = await fetch(`http://localhost:${MOCK_PORT}/v1/subscriptions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Basic eDp5" },
      body: JSON.stringify({ plan_id: "plan_other", notes: { storeId: "some-other-store", planId: plans.Premium.id } }),
    }).then((res) => res.json());
    r = await call("POST", "/api/store/subscribe/verify", {
      razorpay_payment_id: "pay_foreign_1",
      razorpay_subscription_id: otherStoreSub.id,
      razorpay_signature: sign(KEY_SECRET, `pay_foreign_1|${otherStoreSub.id}`),
    });
    check("another store's mandate can't be claimed", r.status === 400, r.data);

    const payId = "pay_mandate_1";
    r = await call("POST", "/api/store/subscribe/verify", {
      planId: plans.Premium.id, // forged: the mandate was authorized for Starter
      razorpay_payment_id: payId,
      razorpay_subscription_id: subscriptionId,
      razorpay_signature: sign(KEY_SECRET, `${payId}|${subscriptionId}`),
    });
    check("mandate verified → free trial", r.status === 200 && r.data.store?.subscriptionStatus === "trialing", r.data);
    check(
      "plan comes from the Razorpay subscription, not the browser",
      r.data.store?.planId === plans.Starter.id,
      r.data.store?.planId
    );

    r = await call("POST", "/api/store/subscribe/verify", {
      planId: plans.Starter.id,
      razorpay_payment_id: payId,
      razorpay_subscription_id: subscriptionId,
      razorpay_signature: "0".repeat(64),
    });
    check("forged mandate signature rejected", r.status === 400, r.data);

    // ── Plan change during the trial applies immediately ──
    r = await call("POST", "/api/store/plan", { planId: plans.Premium.id });
    check("trial upgrade applies now", r.data.appliesAt === "now" && r.data.store?.planId === plans.Premium.id, r.data);
    let rz = calls.filter((c) => c.method === "PATCH" && c.path === `/v1/subscriptions/${subscriptionId}`);
    check("Razorpay told to switch plan now (trial)", rz.at(-1)?.body?.schedule_change_at === "now", rz.at(-1));
    r = await call("POST", "/api/store/plan", { planId: plans.Starter.id });
    check("trial downgrade also applies now", r.data.appliesAt === "now" && r.data.store?.planId === plans.Starter.id, r.data);
    r = await call("POST", "/api/store/plan", { planId: plans.Starter.id });
    check("switching to the current plan is refused", r.status === 400, r.data);

    // ── Commission on a paid order (Starter = 2.5%) ──
    r = await call("POST", "/api/orders", {
      paymentStatus: "paid",
      items: [{ title: "Test item", quantity: 2, price: 500 }],
    });
    const order1 = r.data.order;
    check("manual paid order created", r.status === 201 || r.status === 200, r.data);
    r = await call("GET", "/api/store/billing");
    check("2.5% commission accrued on ₹1000 order (₹25)", r.data.fees?.accrued?.amount === 25, r.data.fees);
    r = await call("POST", "/api/orders", { paymentStatus: "pending", items: [{ title: "Unpaid", quantity: 1, price: 999 }] });
    const pendingOrder = r.data.order;
    r = await call("GET", "/api/store/billing");
    check("unpaid order earns no commission", r.data.fees?.accrued?.amount === 25, r.data.fees);
    r = await call("PATCH", `/api/orders/${pendingOrder.id}/status`, { fulfillmentStatus: "cancelled" });
    r = await call("PATCH", `/api/orders/${pendingOrder.id}/status`, { paymentStatus: "paid" });
    r = await call("GET", "/api/store/billing");
    check("paid-but-cancelled order earns no commission", r.data.fees?.accrued?.amount === 25, r.data.fees);

    // ── Renewal 1: trial ends, first charge ──
    const day = 86400;
    const t0 = Math.floor(Date.now() / 1000);
    const w1 = await webhook("subscription.charged", {
      subscriptionId,
      paymentId: "pay_renewal_1",
      amountPaise: 99900,
      start: t0,
      end: t0 + 30 * day,
    });
    check("renewal webhook accepted", w1.status === 200 && w1.data.ok, w1.data);
    r = await call("GET", "/api/store/billing");
    check("store is now active (paying)", r.data.billing?.subscriptionStatus === "active", r.data.billing);
    check("billing period end recorded", Boolean(r.data.billing?.currentPeriodEnd), r.data.billing);
    check("first invoice issued", r.data.invoices?.length === 1 && Number(r.data.invoices[0].total) === 999, r.data.invoices);
    const addonCalls = calls.filter((c) => c.path === `/v1/subscriptions/${subscriptionId}/addons`);
    check("accrued ₹25 fee added to the next renewal (Razorpay add-on)", addonCalls.length === 1 && addonCalls[0].body.item.amount === 2500, addonCalls);
    check("fee now shows as scheduled", r.data.fees?.scheduled?.amount === 25 && r.data.fees?.accrued?.amount === 0, r.data.fees);

    // Replaying the same event id must not issue a second invoice.
    const replay = await call("POST", "/api/webhooks/razorpay", w1.raw, {
      "x-razorpay-signature": sign(WEBHOOK_SECRET, w1.raw),
      "x-razorpay-event-id": w1.eventId,
      origin: "",
    });
    r = await call("GET", "/api/store/billing");
    check("replayed webhook is ignored (still 1 invoice)", replay.data.duplicate === true && r.data.invoices.length === 1, replay.data);
    // Same payment under a NEW event id (Razorpay re-sent it) → still idempotent.
    await webhook("subscription.charged", { subscriptionId, paymentId: "pay_renewal_1", amountPaise: 99900, start: t0, end: t0 + 30 * day });
    r = await call("GET", "/api/store/billing");
    check("same payment in a new event doesn't duplicate the invoice", r.data.invoices.length === 1, r.data.invoices);

    const badSig = await call("POST", "/api/webhooks/razorpay", w1.raw, { "x-razorpay-signature": "deadbeef", origin: "" });
    check("webhook with a bad signature rejected", badSig.status === 400, badSig.data);

    // ── Renewal 2: the fee is collected and itemised ──
    await webhook("subscription.charged", {
      subscriptionId,
      paymentId: "pay_renewal_2",
      amountPaise: 99900 + 2500,
      start: t0 + 30 * day,
      end: t0 + 60 * day,
    });
    r = await call("GET", "/api/store/billing");
    check("second invoice issued", r.data.invoices?.length === 2, r.data.invoices);
    const inv2 = await call("GET", `/api/store/invoices/${r.data.invoices[0].id}`);
    const lines = inv2.data.invoice?.lines || [];
    check(
      "invoice itemises plan ₹999 + platform fees ₹25",
      lines.length === 2 && lines[0].amount === 999 && lines[1].amount === 25 && /#\d+/.test(lines[1].description),
      lines
    );
    const inv = inv2.data.invoice;
    check(
      "GST backed out of the inclusive total (₹1024 → ₹867.80 + ₹156.20)",
      Number(inv.total) === 1024 && Number(inv.taxableValue) === 867.8 && Number(inv.taxAmount) === 156.2,
      { total: inv.total, taxable: inv.taxableValue, tax: inv.taxAmount }
    );
    check("same-state buyer (no state set) → CGST + SGST", inv.taxType === "cgst_sgst", inv.taxType);
    check("fee marked paid", r.data.fees?.paid?.amount === 25 && r.data.fees?.scheduled?.amount === 0, r.data.fees);

    // ── Billing details + IGST ──
    r = await call("PATCH", "/api/store/billing/details", { gstin: "not-a-gstin" });
    check("invalid GSTIN rejected", r.status === 400, r.data);
    r = await call("PATCH", "/api/store/billing/details", {
      billingName: "Billing Test Pvt Ltd",
      gstin: "29abcde1234f1z5",
      billingAddress: "12 MG Road, Bengaluru 560001",
      billingState: "Karnataka",
    });
    check("billing details saved (GSTIN uppercased)", r.status === 200 && r.data.billing?.billingDetails?.gstin === "29ABCDE1234F1Z5", r.data);

    // ── Upgrade while paying: now; downgrade: at period end ──
    r = await call("POST", "/api/store/plan", { planId: plans.Premium.id });
    check("paid-period upgrade applies now", r.data.appliesAt === "now" && r.data.store?.planId === plans.Premium.id, r.data);
    rz = calls.filter((c) => c.method === "PATCH" && c.path === `/v1/subscriptions/${subscriptionId}`);
    check("…and Razorpay bills the new price from next renewal", rz.at(-1)?.body?.schedule_change_at === "cycle_end", rz.at(-1)?.body);
    r = await call("POST", "/api/store/plan", { planId: plans.Starter.id });
    check("paid-period downgrade is scheduled for period end", r.data.appliesAt === "period_end" && r.data.store?.pendingPlanId === plans.Starter.id && r.data.store?.planId === plans.Premium.id, r.data);
    r = await call("DELETE", "/api/store/plan/pending");
    check("scheduled downgrade can be cancelled", r.status === 200 && !r.data.store?.pendingPlanId, r.data);
    check("…and Razorpay's scheduled change is cancelled", calls.some((c) => c.path === `/v1/subscriptions/${subscriptionId}/cancel_scheduled_changes`));
    await call("POST", "/api/store/plan", { planId: plans.Starter.id });

    // Premium rate (1.5%) applies while on Premium.
    r = await call("POST", "/api/orders", { paymentStatus: "paid", items: [{ title: "Premium-period item", quantity: 1, price: 2000 }] });
    const order3 = r.data.order;
    r = await call("GET", "/api/store/billing");
    check("Premium order accrues 1.5% (₹30)", r.data.fees?.accrued?.amount === 30, r.data.fees);

    // Renewal 3 applies the downgrade and issues an IGST invoice.
    await webhook("subscription.charged", {
      subscriptionId,
      paymentId: "pay_renewal_3",
      amountPaise: 229900,
      start: t0 + 60 * day,
      end: t0 + 90 * day,
    });
    r = await call("GET", "/api/store/billing");
    const s3 = await call("GET", "/api/store");
    check("downgrade applied at renewal", s3.data.store?.planId === plans.Starter.id && !s3.data.store?.pendingPlanId, s3.data.store);
    const inv3 = await call("GET", `/api/store/invoices/${r.data.invoices[0].id}`);
    check("Karnataka buyer vs Maharashtra seller → IGST", inv3.data.invoice?.taxType === "igst", inv3.data.invoice?.taxType);
    check("invoice carries the buyer's GSTIN", inv3.data.invoice?.buyer?.gstin === "29ABCDE1234F1Z5", inv3.data.invoice?.buyer);

    // ── Refunds ──
    await call("PATCH", `/api/orders/${order3.id}/status`, { paymentStatus: "refunded" });
    r = await call("GET", "/api/store/billing");
    check("refund of a scheduled fee → credit on next cycle", r.data.fees?.accrued?.amount === -30 && r.data.fees?.scheduled?.amount === 30, r.data.fees);
    await call("PATCH", `/api/orders/${order1.id}/status`, { paymentStatus: "refunded" });
    r = await call("GET", "/api/store/billing");
    check("refund of an already-paid fee → credited too (−₹55 total)", r.data.fees?.accrued?.amount === -55, r.data.fees);

    // ── Other stores can't see this store's invoices ──
    const foreign = await prisma.platformInvoice.findFirst({ where: { storeId: { not: storeId } } });
    if (foreign) {
      r = await call("GET", `/api/store/invoices/${foreign.id}`);
      check("another store's invoice is a 404", r.status === 404, r.status);
    }

    // ── Checkout: a payment must belong to the order it confirms ──
    const product = await call("POST", "/api/products", {
      title: "Binding Test Product",
      status: "active",
      variants: [{ title: "Default", price: 100, inventoryQuantity: 10 }],
    });
    const handle = (await call("GET", "/api/store")).data.store.handle;
    const variantId = product.data.product?.variants?.[0]?.id;
    // Shoppers pay into the seller's own gateway account (Settings ▸ Payments).
    r = await call("PUT", "/api/payments/razorpay", { credentials: { keyId: "rzp_test_mock", keySecret: KEY_SECRET }, testMode: true });
    check("seller connects their own Razorpay account", r.status === 200, r.data);
    const placeRazorpayOrder = async (qty) => {
      const cart = await call("POST", `/api/storefront/${handle}/cart/add`, { variantId, quantity: qty });
      const checkout = await call("POST", `/api/storefront/${handle}/checkout`, {
        cartId: cart.data.cart.cartId,
        email: "shopper@test.oyklane.dev",
        phone: "9999999999",
        shippingName: "Shopper",
        shippingAddress1: "1 Test St",
        shippingCity: "Pune",
        shippingProvince: "MH",
        shippingZip: "411001",
        shippingCountry: "IN",
        paymentMethod: "razorpay",
      });
      return checkout.data;
    };
    const cheap = await placeRazorpayOrder(1);
    const pricey = await placeRazorpayOrder(5);
    check("Razorpay checkout creates orders", Boolean(cheap.razorpay?.orderId && pricey.razorpay?.orderId), { cheap, pricey });
    const cheapPay = "pay_cheap_1";
    const cheapSig = sign(KEY_SECRET, `${cheap.razorpay.orderId}|${cheapPay}`);
    r = await call("POST", "/api/storefront/checkout/razorpay/verify", {
      orderId: pricey.order.id,
      razorpay_order_id: cheap.razorpay.orderId,
      razorpay_payment_id: cheapPay,
      razorpay_signature: cheapSig,
    });
    check("cheap order's payment can't mark the expensive order paid", r.status === 400, r.data);
    r = await call("POST", "/api/storefront/checkout/razorpay/verify", {
      orderId: cheap.order.id,
      razorpay_order_id: cheap.razorpay.orderId,
      razorpay_payment_id: cheapPay,
      razorpay_signature: cheapSig,
    });
    check("the matching order is marked paid", r.status === 200, r.data);
    const commissionForCheap = await prisma.commissionEntry.findFirst({ where: { orderId: cheap.order.id } });
    check("online payment accrues commission (2.5% of ₹100 = ₹2.50)", Number(commissionForCheap?.amount) === 2.5, commissionForCheap);
    check("order numbers are sequential", pricey.order.orderNumber === cheap.order.orderNumber + 1, [cheap.order.orderNumber, pricey.order.orderNumber]);
  } catch (err) {
    fail += 1;
    console.log(`FAIL  unexpected error: ${err.stack || err}`);
    console.log(api.log().slice(-3000));
  } finally {
    if (storeId && process.env.KEEP_TEST_STORE === "1") {
      // For looking at the billing screens with real renewals and invoices.
      console.log(`      KEEP_TEST_STORE=1 — store kept. Sign in at the admin as ${email} / correct-horse-battery`);
      storeId = null;
    }
    if (storeId) {
      const owners = await prisma.storeUser.findMany({ where: { storeId }, select: { userId: true } });
      await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: { in: owners.map((o) => o.userId) }, email } }).catch(() => {});
      await prisma.customer.deleteMany({ where: { email: "shopper@test.oyklane.dev", storeId } }).catch(() => {});
      console.log("      (test store and owner deleted)");
    }
    for (const p of planIdsBefore) {
      await prisma.plan.update({ where: { id: p.id }, data: { razorpayPlanId: p.razorpayPlanId } }).catch(() => {});
    }
    console.log("      (plan Razorpay ids restored)");
    await prisma.$disconnect();
    api.child.kill();
    server.close();
  }
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();

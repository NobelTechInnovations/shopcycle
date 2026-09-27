#!/usr/bin/env node
/**
 * End-to-end test of the billing engine against a mock Razorpay, with a
 * test clock to move time:
 *
 *   trial → autopay (UPI, ₹1 check refunded) → ₹99 first month + fees +
 *   GST → free switch in the intro month → renewal fails → grace, retries
 *   → dashboard locked (storefront live) → unpaid cycles → suspended
 *   (storefront offline) → pay → restored → scheduled downgrade →
 *   prorated upgrade → monthly→yearly → yearly fee settlement →
 *   reminders → cancel / resume / expire → reactivation → a second store
 *   gets its own trial → staff limits → One-Click Checkout fee → super
 *   admin controls (in-process) → webhook idempotency and signatures.
 *
 *   node apps/api/test/e2e-billing.js
 *   KEEP_TEST_STORE=1 node apps/api/test/e2e-billing.js   (keep the stores)
 *
 * Starts its own Razorpay mock and API (port 4199) on the database in the
 * root .env, and deletes everything it created when done — pass or fail.
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
const MOCK = `http://localhost:${MOCK_PORT}`;
const DAY = 86400000;

// The database is shared with production. Its session pooler (:5432)
// allows only 15 clients in total, so tests go through Supabase's
// transaction pooler (:6543) instead, with a small footprint and time to
// connect.
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

// The super-admin controls are exercised in this process (no platform
// account is created in the shared database) — pointed at the same mock.
Object.assign(process.env, {
  NODE_ENV: "test",
  RAZORPAY_KEY_ID: "rzp_test_mock",
  RAZORPAY_KEY_SECRET: KEY_SECRET,
  RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
  RAZORPAY_API_URL: `${MOCK}/v1`,
  PLATFORM_STATE: "Maharashtra",
  BILLING_SANDBOX: "false",
});

let pass = 0;
let fail = 0;
function check(label, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${label}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${label}${detail !== undefined ? `  -- ${typeof detail === "string" ? detail : JSON.stringify(detail)?.slice(0, 900)}` : ""}`);
  }
}
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const near = (a, b, tol = 0.011) => Math.abs(Number(a) - Number(b)) < tol;
const within = (d, target, ms) => Math.abs(new Date(d).getTime() - new Date(target).getTime()) < ms;

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
      body: body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
      signal: AbortSignal.timeout(90000),
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
async function sf(method, url, body) {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(90000),
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

async function mock(method, url, body) {
  const res = await fetch(`${MOCK}${url}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return res.json();
}

const sign = (secret, payload) => crypto.createHmac("sha256", secret).update(payload).digest("hex");

let eventSeq = 0;
const eventIds = [];
async function webhook(event, payload, { eventId } = {}) {
  eventSeq += 1;
  const id = eventId || `evt_billing_e2e_${Date.now()}_${eventSeq}`;
  eventIds.push(id);
  const raw = JSON.stringify({ event, payload });
  const res = await fetch(`${API}/api/webhooks/razorpay`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-razorpay-signature": sign(WEBHOOK_SECRET, raw), "x-razorpay-event-id": id },
    body: raw,
  });
  return { status: res.status, data: await res.json().catch(() => null), eventId: id, raw };
}

async function startApi() {
  const child = spawn(process.execPath, [path.join(ROOT, "apps/api/src/server.js")], {
    cwd: path.join(ROOT, "apps/api"),
    env: {
      ...process.env,
      API_PORT: String(API_PORT),
      DATABASE_URL: API_DATABASE_URL,
      NODE_ENV: "test",
      BILLING_TEST_CLOCK: "true",
      BILLING_JOBS: "false",
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

async function main() {
  const rzp = await startRazorpayMock(MOCK_PORT);
  const api = await startApi();
  const { prisma } = require(path.join(ROOT, "packages/database/src/client"));
  const stamp = Date.now();
  const email = `billing-e2e-${stamp}@test.oyklane.dev`;
  const storeIds = [];
  const userEmails = [email];
  const owner = client();

  // Test clock: runs the engine for the signed-in store at `when`.
  const clock = async (when, call = owner) => (await call("POST", "/api/billing/_test/clock", { now: new Date(when).toISOString() })).data;
  const billing = async (call = owner) => (await call("GET", "/api/billing")).data;
  // The latest automatic charge the engine sent to the bank.
  const lastCharge = async (storeId) => prisma.billingPayment.findFirst({ where: { storeId, purpose: "charge" }, orderBy: { createdAt: "desc" } });
  async function bankAnswers(payment, status, reason) {
    const entity = await mock("POST", "/__settle", { payment_id: payment.providerPaymentId, status, reason });
    return webhook(status === "captured" ? "payment.captured" : "payment.failed", { payment: { entity } });
  }
  async function payCheckout(checkout, method, call = owner) {
    const paid = await mock("POST", "/__pay", { order_id: checkout.order_id, method });
    return call("POST", "/api/billing/checkout/verify", { orderId: checkout.order_id, paymentId: paid.payment_id, signature: sign(KEY_SECRET, `${checkout.order_id}|${paid.payment_id}`) });
  }

  try {
    // ── A new store starts its own trial ──────────────────────────────
    let r = await owner("POST", "/api/auth/register", { name: "Billing Test", email, password: "correct-horse-battery", storeName: `Billing E2E ${stamp}` });
    check("register a new store", r.status === 201, r.data);
    const store = r.data.store;
    storeIds.push(store.id);
    r = await owner("PATCH", "/api/billing/details", { billingName: "Billing E2E Pvt Ltd", gstin: "27AAPFU0939F1ZV", billingState: "Maharashtra", billingAddress: "1 Test Road, Pune" });
    check("billing details saved", r.status === 200 && r.data.billingDetails?.billingState === "Maharashtra", r.data);

    let b = await billing();
    const plans = Object.fromEntries((b.plans || []).map((p) => [p.key, p]));
    check("new store is TRIALING", b.subscription?.status === "TRIALING", b.subscription);
    check("trial is 3 days", within(b.subscription?.trialEndsAt, Date.now() + 3 * DAY, 5 * 60000), b.subscription?.trialEndsAt);
    check("trial starts on Growth", b.subscription?.plan?.key === "growth", b.subscription?.plan);
    check("₹99 intro offer available", b.subscription?.introAvailable === true && b.settings?.introPrice === 99, b.settings);
    check("Starter ₹199 / Growth ₹599 / Pro ₹1,299", plans.starter?.priceMonthly === 199 && plans.growth?.priceMonthly === 599 && plans.pro?.priceMonthly === 1299, Object.values(plans).map((p) => p.priceMonthly));
    check("yearly = monthly × 12 × 80%", plans.starter?.priceYearly === 1910.4 && plans.growth?.priceYearly === 5750.4 && plans.pro?.priceYearly === 12470.4, Object.values(plans).map((p) => p.priceYearly));
    check("commission 2% / 1.5% / 0.5%", plans.starter?.commissionPercent === 2 && plans.growth?.commissionPercent === 1.5 && plans.pro?.commissionPercent === 0.5);
    check("staff 2 / 10 / 30, no product limit", plans.starter?.staffLimit === 2 && plans.growth?.staffLimit === 10 && plans.pro?.staffLimit === 30 && plans.pro?.productLimit == null);
    check("GST shown separately: ₹99 → ₹116.82", plans.starter?.withTax?.intro === 116.82 && b.settings?.taxRate === 18, plans.starter?.withTax);
    check("dashboard open during the trial", b.access?.dashboard === true && b.access?.storefront === true, b.access);
    check("no mandate yet", b.mandate === null, b.mandate);
    r = await owner("GET", "/api/products");
    check("admin API works during the trial", r.status === 200, r.status);

    // ── Free switch during the trial ─────────────────────────────────
    r = await owner("POST", "/api/billing/plan/preview", { planId: plans.starter.id });
    check("switching plan in the trial is free", r.data.preview?.type === "free" && r.data.preview?.charge === null, r.data);
    r = await owner("POST", "/api/billing/plan", { planId: plans.starter.id });
    check("now on Starter", r.data.billing?.subscription?.plan?.key === "starter", r.data.billing?.subscription);

    // ── Staff limit (Starter: 2, owner not counted) ───────────────────
    r = await owner("POST", "/api/team/invite", { email: `staff1-${stamp}@test.oyklane.dev`, role: "staff" });
    const invite2 = await owner("POST", "/api/team/invite", { email: `staff2-${stamp}@test.oyklane.dev`, role: "staff" });
    check("two staff invites fit Starter", [200, 201].includes(r.status) && [200, 201].includes(invite2.status), [r.data, invite2.data]);
    r = await owner("POST", "/api/team/invite", { email: `staff3-${stamp}@test.oyklane.dev`, role: "staff" });
    check("third staff refused, pointing to a limit request", r.status === 400 && /request a higher limit/i.test(r.data.error), r.data);
    r = await owner("POST", "/api/billing/limit-request", { requested: 5, reason: "Seasonal team" });
    check("staff limit request filed", r.status === 201 && r.data.request?.status === "pending", r.data);
    const limitRequestId = r.data.request?.id;
    r = await owner("POST", "/api/billing/limit-request", { requested: 6 });
    check("only one pending request at a time", r.status === 409, r.data);
    // The platform approves it (billing/admin.js, as the super admin would).
    const admin = require(path.join(ROOT, "apps/api/src/modules/billing/admin"));
    const adminUser = (await prisma.user.findFirst({ where: { email } })).id; // stands in as the actor id
    await admin.decideLimitRequest(prisma, limitRequestId, { approve: true, value: 5, actorId: adminUser });
    r = await owner("POST", "/api/team/invite", { email: `staff3-${stamp}@test.oyklane.dev`, role: "staff" });
    check("approved request raises the staff limit to 5", [200, 201].includes(r.status), r.data);
    b = await billing();
    check("new limit shown, seller notified", b.staff?.limit === 5 && b.staff?.used === 3 && b.notifications?.some((n) => n.type === "limit_request"), b.staff);

    // ── Commission on checkout orders, One-Click Checkout +0.3% ──────
    r = await owner("POST", "/api/products", { title: "Billing Tee", status: "active", variants: [{ title: "M", sku: `BILL-${stamp}`, price: 1000, inventoryQuantity: 50 }] });
    check("product created (no product limit)", [200, 201].includes(r.status), r.data);
    const variantId = r.data.product?.variants?.[0]?.id;
    r = await owner("POST", "/api/apps/one-click-checkout/install", { settings: {} });
    check("One-Click Checkout app installed", r.status === 200 || r.status === 201, r.data);
    const shopper = { email: "billing.shopper@test.oyklane.dev", phone: "9876543210", shippingName: "Bill Shopper", shippingAddress1: "12 MG Road", shippingCity: "Pune", shippingProvince: "MH", shippingZip: "411001", shippingCountry: "IN" };
    async function checkoutOrder(qty, extra = {}) {
      const add = await sf("POST", `/api/storefront/${store.handle}/cart/add`, { variantId, quantity: qty });
      const out = await sf("POST", `/api/storefront/${store.handle}/checkout`, { cartId: add.data.cart?.cartId, ...shopper, paymentMethod: "cod", ...extra });
      return out.data.order;
    }
    const oneClickOrder = await checkoutOrder(1, { oneClick: true });
    let o = await prisma.order.findUnique({ where: { id: oneClickOrder.id } });
    check("order saves the plan rate (Starter 2%)", Number(o.feeCommissionRate) === 2 && o.feePlanId === plans.starter.id, o);
    check("order records One-Click Checkout (+0.3%)", o.oneClickCheckout === true && Number(o.feeOneClickRate) === 0.3, o);
    await owner("POST", `/api/orders/${oneClickOrder.id}/mark-paid`, {});
    let tx = await prisma.commissionTransaction.findFirst({ where: { orderId: oneClickOrder.id } });
    const base1 = Number(o.total);
    const fee1 = r2(r2(base1 * 0.02) + r2(base1 * 0.003));
    check(`commission 2% of ₹${base1}`, Number(tx?.commissionAmount) === r2(base1 * 0.02) && Number(tx?.commissionRate) === 2 && Number(tx?.orderAmount) === base1, tx);
    check("one-click fee 0.3% on top", Number(tx?.oneClickAmount) === r2(base1 * 0.003) && tx?.oneClickActive === true, tx);
    check("GST on the fee kept separate (18%)", Number(tx?.baseFee) === fee1 && Number(tx?.taxAmount) === r2(fee1 * 0.18) && Number(tx?.totalFee) === r2(fee1 + r2(fee1 * 0.18)), tx);
    const plainOrder = await checkoutOrder(1);
    o = await prisma.order.findUnique({ where: { id: plainOrder.id } });
    check("a normal checkout has no one-click fee", o.oneClickCheckout === false && Number(o.feeOneClickRate) === 0, o);
    await owner("POST", `/api/orders/${plainOrder.id}/mark-paid`, {});
    r = await owner("POST", "/api/orders", { paymentStatus: "paid", items: [{ title: "Phone order", quantity: 1, price: 500 }] });
    const manualId = r.data.order?.id;
    check("an order the seller enters by hand carries no fee", manualId && (await prisma.commissionTransaction.count({ where: { orderId: manualId } })) === 0);
    await owner("POST", `/api/orders/${plainOrder.id}/cancel`, { reason: "Test", restock: true, refund: false });
    tx = await prisma.commissionTransaction.findFirst({ where: { orderId: plainOrder.id } });
    check("cancelled before billing → fee voided", tx?.status === "void", tx);
    const month = await prisma.commissionSummary.findFirst({ where: { storeId: store.id } });
    check("monthly commission summary kept", month?.orders === 1 && Number(month?.baseFee) === fee1, month);
    b = await billing();
    check("fees wait for the next charge", b.fees?.accrued?.amount === fee1, b.fees);

    // ── Autopay during the trial (UPI, ₹1 check refunded) ─────────────
    r = await owner("POST", "/api/billing/checkout", { method: "upi" });
    check("autopay checkout opened", r.status === 200 && r.data.checkout?.order_id && r.data.checkout?.recurring === "1", r.data);
    check("nothing due yet → ₹1 check", r.data.amount === 1 && r.data.checkout?.amount === 100, r.data);
    const setup = r.data.checkout;
    const paid1 = await mock("POST", "/__pay", { order_id: setup.order_id, method: "upi" });
    r = await owner("POST", "/api/billing/checkout/verify", { orderId: setup.order_id, paymentId: paid1.payment_id, signature: "0".repeat(64) });
    check("forged checkout signature refused", r.status === 400, r.data);
    b = await billing();
    check("…and nothing changed", b.mandate === null || b.mandate.status === "created", b.mandate);
    r = await owner("POST", "/api/billing/checkout/verify", { orderId: setup.order_id, paymentId: paid1.payment_id, signature: sign(KEY_SECRET, `${setup.order_id}|${paid1.payment_id}`) });
    check("verified with Razorpay → autopay active", r.status === 200 && r.data.billing?.mandate?.status === "active", r.data);
    check("payment method shown masked", /UPI · se\*\*\*@okhdfc/.test(r.data.billing?.mandate?.label || ""), r.data.billing?.mandate);
    const mandateRow = await prisma.mandate.findFirst({ where: { storeId: store.id, status: "active" } });
    check("mandate keeps only Razorpay ids", mandateRow?.providerTokenId === paid1.token_id && mandateRow?.providerCustomerId?.startsWith("cust_") && mandateRow?.livemode === false, mandateRow);
    check("₹1 check refunded", rzp.calls.some((c) => c.path === `/v1/payments/${paid1.payment_id}/refund` && c.body.amount === 100));
    r = await owner("POST", "/api/billing/checkout", { method: "upi" });
    check("no second checkout while autopay is on and nothing is due", r.status === 409, r.data);

    // ── Trial ends → ₹99 first month + fees + GST on the mandate ─────
    const trialEnd = new Date(b.subscription.trialEndsAt);
    let c = await clock(trialEnd.getTime() + 60000);
    let charge = await lastCharge(store.id);
    check("first charge sent to the bank", charge?.status === "pending" && rzp.calls.some((x) => x.path === "/v1/payments/create/recurring"), charge);
    let cycle = await prisma.billingCycle.findUnique({ where: { id: charge.cycleId } });
    const introSub = r2(99 + fee1);
    const introTotal = r2(introSub + r2(introSub * 0.18));
    check(`₹99 + ₹${fee1} fees, GST 18% on top = ₹${introTotal}`, cycle?.kind === "intro" && Number(cycle.planAmount) === 99 && Number(cycle.feesAmount) === fee1 && Number(cycle.taxAmount) === r2(introSub * 0.18) && Number(cycle.total) === introTotal, cycle);
    check("dashboard stays open while the bank confirms", c.billing?.access?.dashboard === true, c.billing?.access);
    c = await clock(trialEnd.getTime() + 120000);
    check("running the engine again doesn't charge twice", (await prisma.billingPayment.count({ where: { storeId: store.id, purpose: "charge" } })) === 1);

    let w = await bankAnswers(charge, "captured");
    check("payment.captured webhook accepted", w.status === 200 && w.data?.ok, w.data);
    b = await billing();
    check("subscription ACTIVE", b.subscription?.status === "ACTIVE", b.subscription);
    check("first period runs a month from the trial's end", within(b.subscription?.currentPeriodStart, trialEnd, 1000) && within(b.subscription?.currentPeriodEnd, new Date(trialEnd).setUTCMonth(trialEnd.getUTCMonth() + 1), 2 * DAY), b.subscription);
    check("intro used", b.subscription?.introUsed === true && b.subscription?.introAvailable === false, b.subscription);
    r = await owner("GET", "/api/billing/invoices");
    check("one invoice issued", r.data.invoices?.length === 1 && r.data.invoices[0].total === introTotal, r.data);
    const inv = (await owner("GET", `/api/billing/invoices/${r.data.invoices[0].id}`)).data.invoice;
    check("invoice: CGST + SGST halves (same state)", inv?.taxType === "cgst_sgst" && near(Number(inv.cgst) + Number(inv.sgst), r2(introSub * 0.18)) && Number(inv.igst) === 0 && Number(inv.subtotal) === introSub, inv);
    check("invoice lines itemise the plan and the fees", inv?.lines?.length === 2 && /first month/.test(inv.lines[0].description) && /1 order/.test(inv.lines[1].description), inv?.lines);
    check("tax transaction recorded", (await prisma.taxTransaction.count({ where: { invoiceId: inv.id } })) === 1);
    tx = await prisma.commissionTransaction.findFirst({ where: { orderId: oneClickOrder.id } });
    check("fees marked paid on that invoice", tx?.status === "paid" && tx?.invoiceId === inv.id, tx);
    const again = await webhook("payment.captured", JSON.parse(w.raw).payload, { eventId: w.eventId });
    check("same webhook again is a duplicate", again.data?.duplicate === true, again.data);
    await webhook("payment.captured", JSON.parse(w.raw).payload);
    r = await owner("GET", "/api/billing/invoices");
    check("same payment in a new event → still one invoice", r.data.invoices?.length === 1, r.data.invoices?.length);
    const bad = await fetch(`${API}/api/webhooks/razorpay`, { method: "POST", headers: { "content-type": "application/json", "x-razorpay-signature": "deadbeef" }, body: w.raw });
    check("webhook with a bad signature rejected", bad.status === 400, bad.status);
    check("activation notice", b.notifications?.some((n) => n.type === "subscription_activated"), b.notifications?.map((n) => n.type));

    // ── In the ₹99 month a plan switch is still free ─────────────────
    r = await owner("POST", "/api/billing/plan", { planId: plans.pro.id });
    check("switch to Pro in the first month: free, immediate", r.data.result?.type === "free" && r.data.billing?.subscription?.plan?.key === "pro", r.data);

    // ── Renewal fails → grace → retry → dashboard locked ─────────────
    const periodEnd = new Date(b.subscription.currentPeriodEnd);
    await clock(periodEnd.getTime() + 60000);
    charge = await lastCharge(store.id);
    cycle = await prisma.billingCycle.findUnique({ where: { id: charge.cycleId } });
    check("renewal: Pro ₹1,299 + GST = ₹1,532.82", cycle?.kind === "regular" && Number(cycle.planAmount) === 1299 && Number(cycle.total) === 1532.82, cycle);
    w = await bankAnswers(charge, "failed", "Insufficient funds");
    b = await billing();
    check("failed payment → GRACE_PERIOD", b.subscription?.status === "GRACE_PERIOD" && b.subscription?.consecutiveFailures === 1, b.subscription);
    check("7-day grace", within(b.subscription?.graceEndsAt, Date.now() + 7 * DAY, 5 * 60000), b.subscription?.graceEndsAt);
    check("retry scheduled a day later", within(b.subscription?.nextRetryAt, Date.now() + DAY, 5 * 60000), b.subscription?.nextRetryAt);
    check("dashboard still open in grace", b.access?.dashboard === true && b.access?.reason === "grace", b.access);
    check("payment-failed notice with the reason", b.notifications?.some((n) => n.type === "payment_failed" && /Insufficient funds/.test(n.body)), b.notifications?.[0]);
    check("failure recorded", (await prisma.billingFailure.count({ where: { storeId: store.id, resolvedAt: null } })) === 1);
    const firstRetry = new Date(b.subscription.nextRetryAt);
    await clock(firstRetry.getTime() + 60000);
    const retryCharge = await lastCharge(store.id);
    check("automatic retry charged the same cycle", retryCharge.id !== charge.id && retryCharge.cycleId === charge.cycleId, retryCharge);
    await bankAnswers(retryCharge, "failed", "Insufficient funds");
    b = await billing();
    check("retry failed → still in grace, next retry later", b.subscription?.status === "GRACE_PERIOD" && new Date(b.subscription?.nextRetryAt) > firstRetry, b.subscription);
    check("still one failure counted (same cycle)", b.subscription?.consecutiveFailures === 1, b.subscription);

    await clock(new Date(b.subscription.graceEndsAt).getTime() + 60000);
    b = await billing();
    check("grace over → PAST_DUE", b.subscription?.status === "PAST_DUE" && b.subscription?.lockedAt, b.subscription);
    r = await owner("GET", "/api/products");
    check("dashboard locked (402)", r.status === 402 && r.data.code === "billing_locked", r.data);
    check("billing page still reachable", b.access?.dashboard === false && Boolean(b.due), b.access);
    r = await owner("GET", "/api/store");
    check("store basics still load for the billing page", r.status === 200, r.status);
    r = await sf("GET", `/api/storefront/${store.handle}/render/index`);
    check("storefront stays live while locked", r.status === 200, r.status);

    // ── More unpaid months → suspended (store offline) ────────────────
    await clock(new Date(b.subscription.dunningNextAt).getTime() + 60000);
    b = await billing();
    check("a month unpaid → 2 failures", b.subscription?.consecutiveFailures === 2 && b.subscription?.status === "PAST_DUE", b.subscription);
    const dunningCharge = await lastCharge(store.id);
    if (dunningCharge.status === "pending") await bankAnswers(dunningCharge, "failed", "Insufficient funds");
    b = await billing();
    await clock(new Date(b.subscription.dunningNextAt).getTime() + 60000);
    b = await billing();
    check("3 unpaid cycles → SUSPENDED", b.subscription?.status === "SUSPENDED" && b.subscription?.consecutiveFailures === 3, b.subscription);
    r = await sf("GET", `/api/storefront/${store.handle}/render/index`);
    check("storefront offline with a friendly message", r.status === 503 && /temporarily unavailable/i.test(r.data?.error), r.data);
    r = await sf("POST", `/api/storefront/${store.handle}/cart/add`, { variantId, quantity: 1 });
    check("checkout closed while suspended", r.status === 503, r.status);
    check("suspension notice", b.notifications?.some((n) => n.type === "store_suspended"), b.notifications?.map((n) => n.type));

    // ── Pay → back online, cycle re-anchored ─────────────────────────
    r = await owner("POST", "/api/billing/checkout", {});
    check("pay-now checkout for what's owed", r.status === 200 && r.data.amount === 1532.82 && !r.data.checkout?.recurring, r.data);
    r = await payCheckout(r.data.checkout, "upi");
    b = r.data.billing;
    check("paid → ACTIVE again", b?.subscription?.status === "ACTIVE" && b.subscription.consecutiveFailures === 0, b?.subscription);
    check("new period starts at payment", within(b?.subscription?.currentPeriodStart, Date.now(), 5 * 60000), b?.subscription);
    check("failures resolved", (await prisma.billingFailure.count({ where: { storeId: store.id, resolvedAt: null } })) === 0);
    r = await sf("GET", `/api/storefront/${store.handle}/render/index`);
    check("storefront back online", r.status === 200, r.status);
    r = await owner("GET", "/api/products");
    check("dashboard unlocked", r.status === 200, r.status);
    check("restored notice", b.notifications?.some((n) => n.type === "store_restored"), b.notifications?.map((n) => n.type));

    // ── Downgrade waits for the period end ──────────────────────────
    r = await owner("POST", "/api/billing/plan/preview", { planId: plans.starter.id });
    check("downgrade applies at period end", r.data.preview?.type === "downgrade" && r.data.preview?.appliesAt === "period_end", r.data.preview);
    await owner("POST", "/api/billing/plan", { planId: plans.starter.id });
    b = await billing();
    check("downgrade scheduled, still on Pro", b.subscription?.pendingPlan?.id === plans.starter.id && b.subscription?.plan?.key === "pro", b.subscription);
    r = await owner("DELETE", "/api/billing/plan/pending");
    check("scheduled change can be undone", r.data.billing?.subscription?.pendingPlanId === null, r.data.billing?.subscription);
    await owner("POST", "/api/billing/plan", { planId: plans.starter.id });
    b = await billing();
    await clock(new Date(b.subscription.currentPeriodEnd).getTime() + 60000);
    charge = await lastCharge(store.id);
    cycle = await prisma.billingCycle.findUnique({ where: { id: charge.cycleId } });
    check("renewal on Starter: ₹199 + GST = ₹234.82", Number(cycle?.planAmount) === 199 && Number(cycle?.total) === 234.82, cycle);
    await bankAnswers(charge, "captured");
    b = await billing();
    check("now on Starter", b.subscription?.plan?.key === "starter" && b.subscription?.status === "ACTIVE", b.subscription);

    // ── Upgrade now, prorated ────────────────────────────────────────
    r = await owner("POST", "/api/billing/plan/preview", { planId: plans.growth.id });
    const pv = r.data.preview;
    check("upgrade applies now with a prorated charge", pv?.type === "upgrade" && pv?.appliesAt === "now" && pv.charge?.subtotal > 0 && pv.charge?.credit > 0, pv);
    check("proration = new plan for the rest of the period − credit", near(pv.charge.subtotal, 599 * pv.charge.share - 199 * pv.charge.share, 0.02), pv.charge);
    r = await owner("POST", "/api/billing/plan", { planId: plans.growth.id });
    check("on Growth immediately", r.data.billing?.subscription?.plan?.key === "growth", r.data.billing?.subscription);
    charge = await lastCharge(store.id);
    cycle = await prisma.billingCycle.findUnique({ where: { id: charge.cycleId } });
    check("proration charged on the mandate", cycle?.kind === "proration" && near(cycle.total, pv.charge.total), cycle);
    await bankAnswers(charge, "captured");
    r = await owner("GET", "/api/billing/invoices");
    check("proration invoiced", r.data.invoices?.[0]?.kind === "proration", r.data.invoices?.[0]);

    // ── Monthly → yearly starts a yearly period now ───────────────────
    r = await owner("POST", "/api/billing/plan/preview", { planId: plans.growth.id, interval: "year" });
    const yv = r.data.preview;
    check("monthly → yearly is an upgrade with a new period", yv?.type === "upgrade" && yv?.newPeriod && near(yv.charge.planAmount, 5750.4), yv);
    check("credit for what was paid this month", yv.charge.credit > 0 && near(yv.charge.subtotal, 5750.4 - yv.charge.credit), yv.charge);
    r = await owner("POST", "/api/billing/plan", { planId: plans.growth.id, interval: "year" });
    b = r.data.billing;
    check("now yearly, period a year out", b?.subscription?.interval === "year" && within(b.subscription.currentPeriodEnd, Date.now() + 365 * DAY, 2 * DAY), b?.subscription);
    await bankAnswers(await lastCharge(store.id), "captured");

    // ── Yearly plans settle checkout fees monthly ─────────────────────
    const yearlyOrder = await checkoutOrder(2);
    await owner("POST", `/api/orders/${yearlyOrder.id}/mark-paid`, {});
    tx = await prisma.commissionTransaction.findFirst({ where: { orderId: yearlyOrder.id } });
    const base3 = Number((await prisma.order.findUnique({ where: { id: yearlyOrder.id } })).total);
    const fee3 = r2(base3 * 0.015);
    check("Growth rate 1.5%", Number(tx?.commissionAmount) === fee3 && Number(tx?.commissionRate) === 1.5, tx);
    b = await billing();
    await clock(new Date(b.subscription.currentPeriodStart).getTime() + 31 * DAY + 60000);
    charge = await lastCharge(store.id);
    cycle = await prisma.billingCycle.findUnique({ where: { id: charge.cycleId } });
    check("a month in: fees charged on their own (+ GST)", cycle?.kind === "fees" && Number(cycle.feesAmount) === fee3 && Number(cycle.total) === r2(fee3 + r2(fee3 * 0.18)), cycle);
    await bankAnswers(charge, "captured");
    r = await owner("GET", "/api/billing/invoices");
    check("fees invoiced", r.data.invoices?.[0]?.kind === "fees", r.data.invoices?.[0]);

    // ── Reminders before the renewal ──────────────────────────────────
    b = await billing();
    const renewAt = new Date(b.subscription.nextBillingAt);
    for (let i = 0; i < 3; i += 1) await clock(renewAt.getTime() - 3 * DAY + 3600000);
    b = await billing();
    check("3-day reminder before billing", b.notifications?.some((n) => n.type === "billing_reminder" && /3 days/.test(n.title)), b.notifications?.map((n) => n.title));
    const reminderEmail = await prisma.emailLog.findFirst({ where: { storeId: store.id, template: "billing_billing_reminder" } });
    check("reminder emailed to the owner", reminderEmail?.to === email, reminderEmail);

    // ── Cancel, resume, expire, reactivate ───────────────────────────
    r = await owner("POST", "/api/billing/cancel", { reason: "Testing" });
    check("cancel → CANCEL_SCHEDULED, plan runs to period end", r.data.billing?.subscription?.status === "CANCEL_SCHEDULED" && r.data.billing.subscription.autoRenew === false, r.data.billing?.subscription);
    r = await owner("POST", "/api/billing/resume");
    check("resume → ACTIVE", r.data.billing?.subscription?.status === "ACTIVE" && r.data.billing.subscription.autoRenew === true, r.data.billing?.subscription);
    await owner("POST", "/api/billing/cancel", {});
    b = await billing();
    await clock(new Date(b.subscription.currentPeriodEnd).getTime() + 60000);
    b = await billing();
    check("period over → EXPIRED with a grace period", b.subscription?.status === "EXPIRED" && b.access?.dashboard === true, [b.subscription?.status, b.access]);
    check("autopay cancelled with Razorpay", rzp.calls.some((x) => x.method === "DELETE" && x.path.includes(paid1.token_id)));
    check("expiry notice", b.notifications?.some((n) => n.type === "subscription_expired"));
    await clock(new Date(b.subscription.graceEndsAt).getTime() + 60000);
    r = await owner("GET", "/api/products");
    check("expired grace over → dashboard locked", r.status === 402, r.status);
    b = await billing();
    check("reactivation quote at the regular price", b.due?.kind === "reactivation" && b.due.planAmount === 5750.4, b.due);
    r = await owner("POST", "/api/billing/checkout", { planId: plans.growth.id, interval: "month", method: "card" });
    check("reactivating sets up autopay again (card), charging the first month", r.status === 200 && r.data.checkout?.recurring === "1" && r.data.amount === 706.82, r.data);
    r = await payCheckout(r.data.checkout, "card");
    b = r.data.billing;
    check("reactivated → ACTIVE, monthly, period from today", b?.subscription?.status === "ACTIVE" && b.subscription.interval === "month" && within(b.subscription.currentPeriodStart, Date.now(), 5 * 60000), b?.subscription);
    check("new card mandate, old one not reused", b?.mandate?.method === "card" && /Visa •••• 4242/.test(b.mandate.label) && (await prisma.mandate.count({ where: { storeId: store.id, status: "active" } })) === 1, b?.mandate);
    check("no duplicate subscription", (await prisma.subscription.count({ where: { storeId: store.id } })) === 1);

    // ── A second store by the same owner bills separately ─────────────
    r = await owner("POST", "/api/auth/stores", { name: `Billing E2E Two ${stamp}` });
    check("second store created", r.status === 201, r.data);
    const store2 = r.data.store;
    storeIds.push(store2.id);
    b = await billing();
    check("second store has its own trial and ₹99 offer", b.subscription?.status === "TRIALING" && b.subscription?.introAvailable === true, b.subscription);
    check("separate subscription per store", (await prisma.subscription.findUnique({ where: { storeId: store2.id } }))?.id !== (await prisma.subscription.findUnique({ where: { storeId: store.id } }))?.id);
    r = await owner("POST", "/api/billing/checkout/verify", { orderId: setup.order_id, paymentId: paid1.payment_id, signature: sign(KEY_SECRET, `${setup.order_id}|${paid1.payment_id}`) });
    check("another store's payment can't be claimed", r.status === 404, r.data);
    await owner("POST", "/api/auth/switch-store", { storeId: store.id });

    // ── Unknown webhooks are acknowledged and ignored ─────────────────
    w = await webhook("payment.captured", { payment: { entity: { id: "pay_not_ours", order_id: "order_not_ours", amount: 100, status: "captured" } } });
    check("a payment that isn't ours is ignored", w.status === 200, w.data);

    // ── Super admin controls ──────────────────────────────────────────
    const paidPayment = await prisma.billingPayment.findFirst({ where: { storeId: store.id, status: "captured", purpose: "mandate_setup" }, orderBy: { createdAt: "desc" } });
    const refund = await admin.refund(prisma, store.id, paidPayment.id, { amount: 100, reason: "Goodwill", actorId: adminUser });
    const refundedRow = await prisma.billingPayment.findUnique({ where: { id: paidPayment.id } });
    check("partial refund through Razorpay", refund.refunded === 100 && refundedRow.status === "partially_refunded" && Number(refundedRow.refundedAmount) === 100, refundedRow);

    await admin.setPromo(prisma, store.id, { price: 99, cycles: 2, note: "Diwali", actorId: adminUser });
    b = await billing();
    check("promotional price for the next 2 renewals", b.subscription?.promo?.price === 99 && b.subscription.promo.cyclesLeft === 2 && b.next?.planAmount === 99, [b.subscription?.promo, b.next]);

    await admin.grantAccess(prisma, store.id, { until: new Date(Date.now() + 2 * DAY).toISOString(), reason: "Support", actorId: adminUser });
    await admin.suspend(prisma, store.id, { reason: "Abuse check", actorId: adminUser });
    r = await sf("GET", `/api/storefront/${store.handle}/render/index`);
    check("temporary access keeps a suspended store open", r.status === 200, r.status);
    await admin.grantAccess(prisma, store.id, { until: null, actorId: adminUser });
    r = await sf("GET", `/api/storefront/${store.handle}/render/index`);
    check("admin suspend takes the store offline", r.status === 503, r.status);
    await admin.restore(prisma, store.id, { reason: "Cleared", actorId: adminUser });
    r = await sf("GET", `/api/storefront/${store.handle}/render/index`);
    b = await billing();
    check("admin restore brings it back", r.status === 200 && b.subscription?.status === "ACTIVE", [r.status, b.subscription?.status]);

    const sub2 = await prisma.subscription.findUnique({ where: { storeId: store2.id } });
    await admin.extendTrial(prisma, store2.id, { days: 5, reason: "Onboarding", actorId: adminUser });
    const sub2After = await prisma.subscription.findUnique({ where: { storeId: store2.id } });
    check("trial extended by 5 days", within(sub2After.trialEndsAt, new Date(sub2.trialEndsAt).getTime() + 5 * DAY, 1000), sub2After.trialEndsAt);
    await admin.changePlan(prisma, store2.id, { planId: plans.pro.id, reason: "Partner", actorId: adminUser });
    check("admin plan change", (await prisma.subscription.findUnique({ where: { storeId: store2.id } })).planId === plans.pro.id);
    const reminded = await admin.remind(prisma, store2.id, { actorId: adminUser });
    check("reminder triggered by hand", reminded.type === "trial_ending", reminded);

    const events = await prisma.subscriptionEvent.findMany({ where: { storeId: store.id, actorType: "admin" } });
    check("every admin action logged on the subscription", ["admin.suspended", "admin.restored", "admin.promo_set", "admin.access_granted"].every((t) => events.some((e) => e.type === t)), events.map((e) => e.type));

    let threw = null;
    try {
      await admin.saveSettings(prisma, { taxRate: 99 });
    } catch (err) {
      threw = err;
    }
    check("settings validated (tax rate 99% refused)", threw?.statusCode === 400, threw?.message);
    const ov = await admin.overview(prisma);
    check("platform overview: MRR, statuses, GST, payments", ov.mrr > 0 && ov.statuses.ACTIVE >= 1 && ov.gst.last30.tax > 0 && ov.revenue.last30 > 0, { mrr: ov.mrr, gst: ov.gst.last30 });
    const list = await admin.listSubscriptions(prisma, { q: `Billing E2E ${stamp}` });
    check("subscriptions searchable", list.subscriptions.some((s) => s.storeId === store.id), list.total);
    const detail = await admin.detail(prisma, store.id);
    check("subscription detail: cycles, payments, mandates, events", detail.cycles.length > 3 && detail.payments.length > 3 && detail.mandates.length >= 2 && detail.events.length > 10);
    r = await fetch(`${API}/api/super-admin/billing/overview`);
    check("super admin billing API needs a platform session", r.status === 401, r.status);
  } catch (err) {
    fail += 1;
    console.log(`FAIL  unexpected error: ${err.stack || err}`);
    console.log(api.log().split("\n").filter((l) => /"level":(40|50)|Error|error/.test(l)).slice(-15).join("\n").slice(-6000));
  } finally {
    if (process.env.KEEP_TEST_STORE === "1") {
      console.log(`      KEEP_TEST_STORE=1 — stores kept. Sign in at the admin as ${email} / correct-horse-battery`);
    } else {
      for (const id of storeIds) {
        await prisma.taxTransaction.deleteMany({ where: { storeId: id } }).catch(() => {});
        await prisma.store.delete({ where: { id } }).catch((e) => console.log("cleanup:", e.message));
      }
      await prisma.user.deleteMany({ where: { email: { in: userEmails } } }).catch(() => {});
      await prisma.customer.deleteMany({ where: { email: "billing.shopper@test.oyklane.dev" } }).catch(() => {});
      await prisma.paymentWebhookEvent.deleteMany({ where: { providerEventId: { in: eventIds } } }).catch(() => {});
      console.log("      (test stores, owner and webhook events deleted)");
    }
    await prisma.$disconnect();
    api.child.kill();
    rzp.server.close();
  }
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();

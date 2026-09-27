#!/usr/bin/env node
/**
 * Billing without Razorpay keys — the two ways a deployment can be missing
 * them, and the guard that keeps test mode out of production:
 *
 *   BILLING_SANDBOX=true   → autopay "sets up" at once; plans work end to end
 *   no keys, no sandbox    → merchants get a clear "not switched on" answer
 *   NODE_ENV=production +
 *   BILLING_SANDBOX=true   → the API refuses to start
 *
 *   node apps/api/test/e2e-billing-modes.js
 *
 * Uses the database in the root .env, creates throwaway stores, and deletes
 * them when done. Exits non-zero on any failed check.
 */
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "../../..");
require(path.join(ROOT, "apps/api/node_modules/dotenv")).config({ path: path.join(ROOT, ".env") });
// Tests never send real email/SMS or upload to a media CDN (this process and the APIs it starts).
Object.assign(process.env, { SMTP_HOST: "", EMAIL_PROVIDER: "log", SMS_PROVIDER: "log", WHATSAPP_PROVIDER: "log", MEDIA_STORAGE: "database" });

const ORIGIN = process.env.ADMIN_ORIGIN || "http://localhost:3000";
const NO_KEYS = { RAZORPAY_KEY_ID: "", RAZORPAY_KEY_SECRET: "", RAZORPAY_WEBHOOK_SECRET: "" };

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
    console.log(`FAIL  ${label}${detail !== undefined ? `  -- ${typeof detail === "string" ? detail : JSON.stringify(detail)?.slice(0, 900)}` : ""}`);
  }
}

function spawnApi(port, env) {
  const child = spawn(process.execPath, [path.join(ROOT, "apps/api/src/server.js")], {
    cwd: path.join(ROOT, "apps/api"),
    env: { ...process.env, DATABASE_URL: API_DATABASE_URL, API_PORT: String(port), NODE_ENV: "test", BILLING_JOBS: "false", ...NO_KEYS, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  const exited = new Promise((resolve) => child.on("exit", (code) => resolve(code)));
  return { child, exited, log: () => log };
}

async function startApi(port, env) {
  const api = spawnApi(port, env);
  for (let i = 0; i < 90; i += 1) {
    try {
      const r = await fetch(`http://localhost:${port}/health`);
      if (r.ok) return api;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  api.child.kill();
  throw new Error(`API did not start:\n${api.log().slice(-2000)}`);
}

function client(port) {
  const jar = {};
  return async function call(method, url, body) {
    const res = await fetch(`http://localhost:${port}${url}`, {
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

async function registerStore(call, label, created) {
  const stamp = Date.now();
  const email = `billing-modes-${label}-${stamp}@test.oyklane.dev`;
  const r = await call("POST", "/api/auth/register", {
    name: "Billing Modes",
    email,
    password: "correct-horse-battery",
    storeName: `Billing ${label} ${stamp}`,
  });
  if (r.data?.store?.id) created.push({ storeId: r.data.store.id, email });
  return r;
}

async function main() {
  const { PrismaClient } = require(path.join(ROOT, "packages/database/node_modules/@prisma/client"));
  const prisma = new PrismaClient();
  const created = [];
  const running = [];

  try {
    // ── Sandbox: autopay is approved at once, no Razorpay involved ──
    const sandbox = await startApi(4197, { BILLING_SANDBOX: "true" });
    running.push(sandbox);
    let call = client(4197);
    let r = await registerStore(call, "sandbox", created);
    check("sandbox: register a store", r.status === 201, r.data);
    const sandboxStoreId = r.data?.store?.id;

    r = await call("GET", "/api/billing");
    let b = r.data;
    check("sandbox: billing reports mode 'sandbox'", r.status === 200 && b.mode === "sandbox" && b.livemode === false, { mode: b.mode, livemode: b.livemode });
    check("sandbox: new store starts its own trial", b.subscription?.status === "TRIALING" && b.subscription?.trialEndsAt, b.subscription);
    check("sandbox: dashboard open during the trial", b.access?.dashboard === true, b.access);

    const current = b.subscription?.plan?.key;
    const target = (b.plans || []).find((p) => p.key && p.key !== current);
    r = await call("POST", "/api/billing/plan", { planId: target?.id });
    check(
      "sandbox: switching plans during the trial is free and immediate",
      r.status === 200 && r.data.result?.type === "free" && r.data.billing?.subscription?.plan?.key === target?.key,
      r.data.result || r.data
    );

    r = await call("POST", "/api/billing/checkout", { method: "upi" });
    check("sandbox: autopay setup completes without a checkout window", r.status === 200 && r.data.completed === true && !r.data.checkout, r.data);
    b = r.data.billing;
    check(
      "sandbox: mandate is active and marked test-mode",
      b?.mandate?.status === "active" && b.mandate.livemode === false && b.mandateUsable === true,
      b?.mandate
    );
    check("sandbox: still trialing after autopay setup", b?.subscription?.status === "TRIALING", b?.subscription);

    const setup = await prisma.billingPayment.findFirst({ where: { storeId: sandboxStoreId, purpose: "mandate_setup" }, orderBy: { createdAt: "desc" } });
    r = await call("POST", "/api/billing/checkout/verify", { orderId: setup?.providerOrderId || "order_missing", paymentId: "pay_forged", signature: "0".repeat(64) });
    check("sandbox: a forged checkout signature is refused", r.status === 400, r.data);

    r = await call("GET", "/api/billing/status");
    check("sandbox: status endpoint reports trial and autopay for the banner", r.status === 200 && r.data.status === "TRIALING" && r.data.autopay === true && r.data.access?.reason === "trial", r.data);
    sandbox.child.kill();

    // ── No keys, no sandbox: a clear answer instead of a failure ──
    const off = await startApi(4196, { BILLING_SANDBOX: "false" });
    running.push(off);
    call = client(4196);
    r = await registerStore(call, "off", created);
    check("unconfigured: register a store", r.status === 201, r.data);
    r = await call("GET", "/api/billing");
    check("unconfigured: billing reports mode 'unconfigured'", r.data?.mode === "unconfigured", r.data?.mode);
    check("unconfigured: developers get a setup hint", /RAZORPAY_KEY_ID/.test(r.data?.setupHint || ""), r.data?.setupHint);
    check("unconfigured: the trial still starts", r.data?.subscription?.status === "TRIALING", r.data?.subscription);
    r = await call("POST", "/api/billing/checkout", { method: "upi" });
    check(
      "unconfigured: autopay setup answers 503 with a merchant-readable message",
      r.status === 503 && /switched on/.test(r.data?.error || r.data?.message || ""),
      r.data
    );
    off.child.kill();

    // ── Production must never run in sandbox ──
    const prod = spawnApi(4195, { BILLING_SANDBOX: "true", NODE_ENV: "production" });
    running.push(prod);
    const code = await Promise.race([prod.exited, new Promise((r) => setTimeout(() => r("still running"), 15000))]);
    check("production refuses to start with BILLING_SANDBOX=true", code === 1 && /BILLING_SANDBOX/.test(prod.log()), {
      code,
      log: prod.log().slice(-300),
    });
  } catch (err) {
    fail += 1;
    console.log(`FAIL  unexpected error: ${err.stack || err}`);
  } finally {
    for (const api of running) api.child.kill();
    for (const { storeId, email } of created) {
      const owners = await prisma.storeUser.findMany({ where: { storeId }, select: { userId: true } });
      await prisma.taxTransaction.deleteMany({ where: { storeId } }).catch(() => {});
      await prisma.store.delete({ where: { id: storeId } }).catch((e) => console.log("cleanup:", e.message));
      await prisma.user.deleteMany({ where: { id: { in: owners.map((o) => o.userId) }, email } }).catch(() => {});
    }
    if (created.length) console.log(`      (${created.length} test stores and owners deleted)`);
    await prisma.$disconnect();
  }
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();

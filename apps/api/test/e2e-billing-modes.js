#!/usr/bin/env node
/**
 * Billing without Razorpay keys — the two ways a deployment can be missing
 * them, and the guard that keeps test mode out of production:
 *
 *   BILLING_SANDBOX=true   → choosing a plan starts the free trial directly
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

const ORIGIN = process.env.ADMIN_ORIGIN || "http://localhost:3000";
const NO_KEYS = { RAZORPAY_KEY_ID: "", RAZORPAY_KEY_SECRET: "", RAZORPAY_WEBHOOK_SECRET: "" };

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

function spawnApi(port, env) {
  const child = spawn(process.execPath, [path.join(ROOT, "apps/api/src/server.js")], {
    cwd: path.join(ROOT, "apps/api"),
    env: { ...process.env, API_PORT: String(port), NODE_ENV: "test", ...NO_KEYS, ...env },
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
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`http://localhost:${port}/health`);
      if (r.ok) return api;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  api.child.kill();
  throw new Error(`API did not start:\n${api.log()}`);
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
    // ── Sandbox: plans start without a mandate ──
    const sandbox = await startApi(4197, { BILLING_SANDBOX: "true" });
    running.push(sandbox);
    let call = client(4197);
    let r = await registerStore(call, "sandbox", created);
    check("sandbox: register a store", r.status === 201, r.data);
    r = await call("GET", "/api/store/billing");
    const plans = Object.fromEntries((r.data.plans || []).map((p) => [p.name, p]));
    check("sandbox: billing reports mode 'sandbox'", r.data.billing?.mode === "sandbox", r.data.billing);
    r = await call("POST", "/api/store/subscribe", { planId: plans.Starter.id });
    check("sandbox: choosing a plan starts the trial straight away", r.status === 200 && r.data.sandbox === true, r.data);
    r = await call("GET", "/api/store/billing");
    check(
      "sandbox: store is trialing on Starter",
      r.data.billing?.subscriptionStatus === "trialing" && r.data.plans && r.data.billing.trialEndsAt,
      r.data.billing
    );
    r = await call("POST", "/api/store/plan", { planId: plans.Premium.id });
    check("sandbox: upgrade during the trial applies now", r.status === 200 && r.data.appliesAt === "now", r.data);
    r = await call("POST", "/api/store/subscribe/verify", {
      razorpay_payment_id: "pay_x",
      razorpay_subscription_id: "sub_x",
      razorpay_signature: "0".repeat(64),
    });
    check("sandbox: mandate verification is refused (nothing to verify)", r.status === 400, r.data);
    sandbox.child.kill();

    // ── No keys, no sandbox: a clear answer instead of a failure ──
    const off = await startApi(4196, { BILLING_SANDBOX: "false" });
    running.push(off);
    call = client(4196);
    r = await registerStore(call, "off", created);
    check("unconfigured: register a store", r.status === 201, r.data);
    r = await call("GET", "/api/store/billing");
    check("unconfigured: billing reports mode 'unconfigured'", r.data.billing?.mode === "unconfigured", r.data.billing);
    r = await call("POST", "/api/store/subscribe", { planId: plans.Starter.id });
    check(
      "unconfigured: subscribing answers 503 with a merchant-readable message",
      r.status === 503 && /isn't switched on/.test(r.data?.error || ""),
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
      await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: { in: owners.map((o) => o.userId) }, email } }).catch(() => {});
    }
    if (created.length) console.log(`      (${created.length} test stores and owners deleted)`);
    await prisma.$disconnect();
  }
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();

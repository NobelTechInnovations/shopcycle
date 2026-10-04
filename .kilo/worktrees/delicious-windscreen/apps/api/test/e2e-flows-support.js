#!/usr/bin/env node
/**
 * End-to-end test of the Flow app (email automations) and seller support
 * (the Help assistant, help centre and tickets), against a real API:
 *
 *   Flow: install gate · recipes · validation · runs on a COD order ·
 *   placeholders filled and escaped · conditions stop a run · one run per
 *   order · waits resume · unpaid online orders ignored · test sends ·
 *   preview · off / uninstalled flows don't run
 *
 *   Support: help articles and search · streamed answers from a mock
 *   Claude that sees the store's facts and the matching articles · follow-
 *   ups · falling back to articles when the AI fails · tickets (open,
 *   emails, seller reply, team reply, resolve) · another store can't see
 *   them · sellers can't reach the super-admin side
 *
 *   node apps/api/test/e2e-flows-support.js
 *
 * Creates throwaway stores and deletes them when done, pass or fail.
 * Nothing real is contacted: email is "log", Claude is a local mock.
 */
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "../../..");
require(path.join(ROOT, "apps/api/node_modules/dotenv")).config({ path: path.join(ROOT, ".env") });
Object.assign(process.env, { SMTP_HOST: "", EMAIL_PROVIDER: "log", SMS_PROVIDER: "log", WHATSAPP_PROVIDER: "log", MEDIA_STORAGE: "database" });

const API_PORT = 4191;
const API = `http://localhost:${API_PORT}`;
const AI_PORT = 4291;
const AI = `http://localhost:${AI_PORT}`;
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
    console.log(`FAIL  ${label}${detail !== undefined ? `  -- ${typeof detail === "string" ? detail.slice(0, 600) : JSON.stringify(detail).slice(0, 600)}` : ""}`);
  }
}

function client() {
  const jar = {};
  return async function call(method, url, body, { raw = false } = {}) {
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
    if (raw) return { status: res.status, text, headers: res.headers };
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, data };
  };
}

async function sf(method, url, body) {
  const res = await fetch(`${API}${url}`, { method, headers: { ...(body !== undefined && { "content-type": "application/json" }) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text };
  }
}

/** Plays NVIDIA's OpenAI-compatible chat API: streams a fixed answer in
 * pieces, with thinking the seller must never see (reasoning_content and
 * an inline <think> block). */
function startAiMock() {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const json = JSON.parse(body || "{}");
      calls.push({ path: req.url, headers: req.headers, body: json });
      const last = json.messages?.[json.messages.length - 1]?.content || "";
      if (last.includes("FAIL-AI")) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "overloaded" } }));
        return;
      }
      res.writeHead(200, { "content-type": "text/event-stream" });
      const chunk = (delta) => res.write(`data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta }] })}\n\n`);
      chunk({ role: "assistant", reasoning_content: "The seller wants Razorpay. Secret reasoning." });
      chunk({ content: "<think>internal notes</think>" });
      for (const text of ["Go to **Settings ▸ Payments**", " and choose **Connect** on Razorpay.", " Paste your Key ID and Key Secret."]) chunk({ content: text });
      res.write("data: [DONE]\n\n");
      res.end();
    });
  });
  return new Promise((resolve) => server.listen(AI_PORT, () => resolve({ server, calls, answer: "Go to **Settings ▸ Payments** and choose **Connect** on Razorpay. Paste your Key ID and Key Secret." })));
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
      NVIDIA_API_URL: `${AI}/v1/chat/completions`,
      SUPPORT_AI_MODEL: "",
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
async function until(fn, ms = 60000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) return v;
    await wait(300);
  }
}

/** Reads the assistant's newline-delimited JSON stream. */
function parseStream(text) {
  const events = text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  return { events, start: events.find((e) => e.type === "start"), answer: events.filter((e) => e.type === "delta").map((e) => e.text).join(""), done: events.some((e) => e.type === "done") };
}

const SHIP = { phone: "9876543210", shippingAddress1: "12 MG Road", shippingCity: "Bengaluru", shippingProvince: "KA", shippingZip: "560001", shippingCountry: "IN" };

async function main() {
  const ai = await startAiMock();
  const api = await startApi();
  const { PrismaClient } = require(path.join(ROOT, "packages/database/node_modules/@prisma/client"));
  const prisma = new PrismaClient();
  const engine = require(path.join(ROOT, "apps/api/src/modules/flows/engine"));
  const tickets = require(path.join(ROOT, "apps/api/src/modules/support/tickets"));
  const stamp = Date.now();
  const created = [];
  const ticketIds = [];
  const owner = client();

  try {
    const ownerEmail = `flows-e2e-${stamp}@test.oyklane.dev`;
    let r = await owner("POST", "/api/auth/register", { name: "Flow Tester", email: ownerEmail, password: "correct-horse-battery", storeName: `Flows E2E ${stamp}`, plan: "growth" });
    check("register a store", r.status === 201, r.data);
    const store = r.data.store;
    created.push({ storeId: store.id, emails: [ownerEmail] });
    const H = store.handle;
    r = await owner("POST", "/api/products", { title: "Linen Shirt", status: "active", variants: [{ title: "Default", sku: `FLW-${stamp}`, price: 1000, inventoryQuantity: 100 }] });
    const variantId = r.data.product.variants[0].id;
    let n = 0;
    async function codOrder({ name = "Meera Iyer", qty = 1, email } = {}) {
      n += 1;
      const cart = await sf("POST", `/api/storefront/${H}/cart/add`, { variantId, quantity: qty });
      const res = await sf("POST", `/api/storefront/${H}/checkout`, { cartId: cart.data.cart.cartId, email: email || `buyer${n}-${stamp}@test.oyklane.dev`, ...SHIP, shippingName: name, paymentMethod: "cod" });
      return res.data.order;
    }

    // ══ Flow ══════════════════════════════════════════════════════════
    r = await owner("GET", "/api/flows");
    check("Flow needs the app installed", r.status === 402, r.data);
    r = await owner("GET", "/api/apps");
    const flowApp = r.data.apps.find((a) => a.key === "flow");
    check("Flow is in the app catalog, free, with its icon", flowApp && !flowApp.priceMonthly && flowApp.iconKey === "workflow", flowApp);
    r = await owner("POST", "/api/apps/flow/install", { settings: {} });
    check("install Flow", r.status === 200 || r.status === 201, r.data);
    r = await owner("GET", "/api/flows");
    check("empty list with the builder catalog (8 recipes, triggers, fields)", r.status === 200 && r.data.flows.length === 0 && r.data.catalog.recipes.length === 8 && r.data.catalog.triggers.order_placed && r.data.catalog.fields["order.total"], r.data);

    r = await owner("POST", "/api/flows", { recipe: "cod_confirmation" });
    check("create from a recipe — off until turned on", r.status === 201 && r.data.flow.enabled === false && r.data.flow.steps.length === 2 && r.data.flow.steps.every((s) => s.id), r.data);
    const codFlow = r.data.flow;
    r = await owner("PATCH", `/api/flows/${codFlow.id}`, { enabled: true });
    check("turn it on", r.status === 200 && r.data.flow.enabled, r.data);

    r = await owner("POST", "/api/flows", { name: "Bad", trigger: "order_placed", steps: [{ type: "send_email", body: "Hi" }] });
    check("an email step needs a subject", r.status === 400 && /subject/i.test(r.data.error), r.data);
    r = await owner("POST", "/api/flows", { name: "Bad", trigger: "order_placed", steps: [{ type: "wait", amount: 100, unit: "days" }] });
    check("waits are capped at 90 days", r.status === 400 && /90 days/.test(r.data.error), r.data);
    r = await owner("POST", "/api/flows", { name: "Bad", trigger: "customer_created", steps: [{ type: "condition", rules: [{ field: "order.total", op: "gte", value: 1 }] }] });
    check("conditions only use fields the trigger has", r.status === 400 && /condition/i.test(r.data.error), r.data);
    r = await owner("POST", "/api/flows", { name: "Bad", trigger: "nope", steps: [] });
    check("unknown trigger refused", r.status === 400, r.data);
    r = await owner("POST", "/api/flows", { name: "Only a wait", trigger: "order_placed", steps: [{ type: "wait", amount: 1, unit: "days" }] });
    const noEmail = r.data.flow;
    r = await owner("PATCH", `/api/flows/${noEmail.id}`, { enabled: true });
    check("a flow with no email step can't be turned on", r.status === 400 && /email step/i.test(r.data.error), r.data);
    await owner("DELETE", `/api/flows/${noEmail.id}`);

    r = await owner("POST", "/api/flows", {
      name: "Thanks over ₹500",
      trigger: "order_placed",
      steps: [
        { type: "condition", match: "all", rules: [{ field: "order.total", op: "gte", value: 500 }, { field: "order.payment_method", op: "is", value: "cod" }] },
        { type: "send_email", subject: "Thanks {{customer.first_name}} — order #{{order.number}}", heading: "Hi {{customer.first_name}}", body: "Your {{order.first_item}} is on the way soon.\n\nUse {{discount_code}} next time.", discountCode: "next10", buttonLabel: "Your order", buttonLink: "order", includeSummary: true },
      ],
    });
    check("create a custom flow (code upper-cased)", r.status === 201 && r.data.flow.steps[1].discountCode === "NEXT10", r.data);
    const customFlow = r.data.flow;
    await owner("PATCH", `/api/flows/${customFlow.id}`, { enabled: true });

    r = await owner("POST", "/api/flows", { name: "Big orders only", trigger: "order_placed", steps: [{ type: "condition", rules: [{ field: "order.total", op: "gte", value: 100000 }] }, { type: "notify_owner", subject: "Big one" }] });
    const bigFlow = r.data.flow;
    await owner("PATCH", `/api/flows/${bigFlow.id}`, { enabled: true });

    r = await owner("POST", "/api/flows", { name: "Later", trigger: "order_placed", steps: [{ type: "wait", amount: 1, unit: "minutes" }, { type: "send_email", subject: "A minute later", body: "Hello {{customer.name}}" }] });
    const waitFlow = r.data.flow;
    await owner("PATCH", `/api/flows/${waitFlow.id}`, { enabled: true });

    const order = await codOrder({ name: "Meera <i>Iyer</i>" });
    check("COD order placed", order && order.orderNumber, order);
    await until(async () => {
      const rows = await prisma.flowRun.findMany({ where: { storeId: store.id, subjectId: order.id } });
      return rows.length === 4 && rows.every((x) => x.status !== "running");
    });
    const runs = await prisma.flowRun.findMany({ where: { storeId: store.id, subjectId: order.id } });
    const runOf = (flow) => runs?.find((x) => x.flowId === flow.id);
    check("one run per enabled flow for the order", runs?.length === 4, runs?.map((x) => [x.flowId, x.status, x.error, x.log]));
    check("COD recipe ran to the end", runOf(codFlow)?.status === "done", runOf(codFlow));
    check("custom flow ran to the end", runOf(customFlow)?.status === "done", runOf(customFlow));
    check("big-order flow stopped at its condition", runOf(bigFlow)?.status === "stopped" && runOf(bigFlow).log.some((e) => e.result === "not_met"), runOf(bigFlow));
    check("wait flow is waiting about a minute", runOf(waitFlow)?.status === "waiting" && Math.abs(new Date(runOf(waitFlow).nextRunAt) - Date.now() - 60000) < 30000, runOf(waitFlow));

    const mails = await prisma.emailLog.findMany({ where: { storeId: store.id, template: "flow", refId: order.id } });
    const codMail = mails.find((m) => /keep/i.test(m.subject));
    const customMail = mails.find((m) => /^Thanks/.test(m.subject));
    check("COD confirmation emailed with the total and order number", codMail && codMail.subject.includes(`#${order.orderNumber}`) && /₹/.test(codMail.subject), mails.map((m) => m.subject));
    check("placeholders filled in the subject", customMail?.subject === `Thanks Meera — order #${order.orderNumber}`, mails.map((m) => m.subject));
    check("shopper's name escaped in the email, discount code shown, order summary included", customMail && !customMail.html.includes("<i>Iyer") && customMail.html.includes("NEXT10") && customMail.html.includes("Linen Shirt") && customMail.html.includes("/orders/"), customMail?.html?.slice(0, 400));
    check("no owner note for the stopped flow", !(await prisma.emailLog.findFirst({ where: { storeId: store.id, template: "flow_owner_note", refId: order.id } })));
    const timeline = await prisma.orderEvent.findMany({ where: { orderId: order.id, kind: "email" } });
    check("flow emails show on the order's timeline", timeline.some((e) => e.message.includes('Flow "Thanks over ₹500"')), timeline.map((e) => e.message));
    r = await owner("GET", "/api/flows");
    const listed = r.data.flows.find((f) => f.id === customFlow.id);
    check("counters: runs and emails sent", listed.runsCount === 1 && listed.emailsSent === 1 && r.data.stats.active === 4, { listed, stats: r.data.stats });

    // The same order paid later (cash collected) doesn't run the flows again.
    r = await owner("POST", `/api/orders/${order.id}/mark-paid`, {});
    check("mark the COD order paid", r.status === 200 || r.status === 204, r.data);
    await wait(6000);
    check("order.paid after order.created doesn't start a second run", (await prisma.flowRun.count({ where: { storeId: store.id, subjectId: order.id } })) === 4);

    // The wait is over → the jobs tick resumes it (scoped to this store).
    await prisma.flowRun.update({ where: { id: runOf(waitFlow).id }, data: { nextRunAt: new Date(Date.now() - 1000) } });
    const resumed = await engine.processDue(prisma, { storeId: store.id });
    const after = await prisma.flowRun.findUnique({ where: { id: runOf(waitFlow).id } });
    check("waiting run resumed and finished", resumed >= 1 && after.status === "done", after);
    check("…and its email went out after the wait", Boolean(await prisma.emailLog.findFirst({ where: { storeId: store.id, template: "flow", refId: order.id, subject: "A minute later" } })));

    // An online order still waiting for its payment isn't an order yet.
    const pendingOrder = await codOrder();
    await until(async () => (await prisma.flowRun.count({ where: { subjectId: pendingOrder.id, status: { not: "running" } } })) >= 4);
    await prisma.order.update({ where: { id: pendingOrder.id }, data: { paymentMethod: "razorpay", paymentStatus: "pending" } });
    await prisma.flowRun.deleteMany({ where: { subjectId: pendingOrder.id } });
    const started = await engine.onEvent(prisma, store.id, "order.created", { id: pendingOrder.id });
    check("unpaid online order starts no flows", started === 0);

    // Test send and preview
    r = await owner("POST", `/api/flows/${customFlow.id}/test`, { to: `tester-${stamp}@test.oyklane.dev` });
    check("send a test", r.status === 200 && r.data.sent === 1, r.data);
    const testMail = await prisma.emailLog.findFirst({ where: { to: `tester-${stamp}@test.oyklane.dev` } });
    check("test email uses sample values", testMail && testMail.subject.startsWith("[Test] Thanks Ananya") && testMail.html.includes("NEXT10"), testMail?.subject);
    r = await owner("POST", "/api/flows/preview", { trigger: "checkout_abandoned", step: { type: "send_email", subject: "Your {{cart.first_item}}", body: "Come back {{customer.first_name}}", buttonLink: "recover", buttonLabel: "Back" } });
    check("preview renders with sample values", r.status === 200 && r.data.subject === "Your Pure Linen Shirt" && r.data.html.includes("Come back Ananya"), r.data);

    // Abandoned checkout and customer triggers (events sent directly — the
    // real sweep covers every store in the shared database).
    r = await owner("POST", "/api/flows", { recipe: "abandoned_follow_up" });
    const abFlow = r.data.flow;
    await owner("PATCH", `/api/flows/${abFlow.id}`, { enabled: true });
    const cart = await sf("POST", `/api/storefront/${H}/cart/add`, { variantId, quantity: 2 });
    const cartId = cart.data.cart.cartId;
    r = await sf("POST", `/api/storefront/${H}/checkout/contact`, { cartId, email: `leaver-${stamp}@test.oyklane.dev`, name: "Ravi Kumar" });
    check("checkout contact captured", r.status === 200 && r.data.captured, r.data);
    await engine.onEvent(prisma, store.id, "checkout.abandoned", { id: cartId });
    let abRun = await prisma.flowRun.findFirst({ where: { flowId: abFlow.id } });
    check("abandoned-checkout flow waits a day", abRun?.status === "waiting", abRun);
    await prisma.flowRun.update({ where: { id: abRun.id }, data: { nextRunAt: new Date(Date.now() - 1000) } });
    await engine.processDue(prisma, { storeId: store.id });
    abRun = await prisma.flowRun.findUnique({ where: { id: abRun.id } });
    const abMail = await prisma.emailLog.findFirst({ where: { storeId: store.id, template: "flow", refId: cartId } });
    check("…then emails the recovery link with the cart", abRun.status === "done" && abMail && abMail.to === `leaver-${stamp}@test.oyklane.dev` && abMail.html.includes("/cart/recover/") && abMail.html.includes("Linen Shirt"), { run: abRun, subject: abMail?.subject });

    r = await owner("POST", "/api/flows", { recipe: "welcome" });
    const welcome = r.data.flow;
    await owner("PATCH", `/api/flows/${welcome.id}`, { enabled: true });
    const optedOut = await prisma.customer.create({ data: { storeId: store.id, name: "No Mail", email: `nomail-${stamp}@test.oyklane.dev`, acceptsEmailMarketing: false } });
    const optedIn = await prisma.customer.create({ data: { storeId: store.id, name: "Yes Mail", email: `yesmail-${stamp}@test.oyklane.dev`, acceptsEmailMarketing: true } });
    await engine.onEvent(prisma, store.id, "customer.created", { id: optedOut.id });
    await engine.onEvent(prisma, store.id, "customer.created", { id: optedIn.id });
    check("welcome email only to customers who accept marketing", !(await prisma.emailLog.findFirst({ where: { refId: optedOut.id } })) && Boolean(await prisma.emailLog.findFirst({ where: { refId: optedIn.id, subject: { startsWith: "Welcome to" } } })));

    // Off, then uninstalled
    await owner("PATCH", `/api/flows/${customFlow.id}`, { enabled: false });
    const o2 = await codOrder();
    await until(async () => (await prisma.flowRun.count({ where: { subjectId: o2.id, status: { not: "running" } } })) >= 3);
    check("a flow that's off doesn't run", !(await prisma.flowRun.findFirst({ where: { flowId: customFlow.id, subjectId: o2.id } })));
    r = await owner("POST", "/api/apps/flow/uninstall");
    check("uninstall Flow", r.status === 200 || r.status === 204, r.data);
    const o3 = await codOrder();
    await wait(8000);
    check("no runs once the app is removed", (await prisma.flowRun.count({ where: { subjectId: o3.id } })) === 0);
    r = await owner("GET", "/api/flows");
    check("the panel is closed without the app", r.status === 402, r.data);
    await owner("POST", "/api/apps/flow/install", { settings: {} });
    r = await owner("DELETE", `/api/flows/${bigFlow.id}`);
    check("delete a flow", r.status === 204 && !(await prisma.flow.findUnique({ where: { id: bigFlow.id } })));

    // ══ Support ═══════════════════════════════════════════════════════
    r = await owner("GET", "/api/support/config");
    check("Help config: assistant on, suggestions and ticket categories", r.status === 200 && r.data.ai === true && r.data.suggestions.length > 0 && r.data.categories.length > 0, r.data);
    const categories = r.data.categories;
    r = await owner("GET", "/api/support/articles");
    check("help centre has the starter articles", r.status === 200 && r.data.articles.length >= 20, r.data.articles?.length);
    r = await owner("GET", "/api/support/articles?q=razorpay keys");
    check("search finds the payments article first", r.data.articles[0]?.slug === "connect-payments", r.data.articles.map((x) => x.slug));
    r = await owner("GET", "/api/support/articles?q=dns cname godaddy");
    check("…and the domain article for DNS words", r.data.articles[0]?.slug === "custom-domain", r.data.articles.map((x) => x.slug));
    r = await owner("GET", "/api/support/articles/custom-domain");
    check("open an article with related ones", r.status === 200 && r.data.article.body.includes("Settings ▸ Domains") && Array.isArray(r.data.related), r.data);

    r = await owner("POST", "/api/support/ask", { question: "How do I connect Razorpay?" }, { raw: true });
    let s = parseStream(r.text);
    check("answer streams as newline-delimited JSON", r.status === 200 && /ndjson/.test(r.headers.get("content-type")) && s.start && s.done, r.text.slice(0, 300));
    check("the streamed answer is the AI's, in pieces — its thinking never shown", s.answer === ai.answer && !/Secret reasoning|internal notes|<think>/.test(r.text), s.answer);
    check("matching articles come with it", s.start.articles.some((x) => x.slug === "connect-payments"), s.start.articles);
    const call = ai.calls[ai.calls.length - 1];
    const system = call.body.messages?.[0]?.content || "";
    check("NVIDIA called with the key, Nemotron 3 Ultra, streaming, thinking off", call.path === "/v1/chat/completions" && call.headers.authorization === "Bearer nvapi-test-key" && call.body.model === "nvidia/nemotron-3-ultra-550b-a55b" && call.body.stream === true && call.body.chat_template_kwargs?.enable_thinking === false, { h: call.headers.authorization, model: call.body.model });
    check("the prompt knows the store (no gateway yet) and has the article", call.body.messages[0].role === "system" && system.includes(store.name) && /Online payment gateways: none connected/.test(system) && system.includes("Connect a payment gateway") && system.includes("Flow"), system.slice(0, 500));
    const chatId = s.start.chatId;

    r = await owner("POST", "/api/support/ask", { question: "and PayU?", chatId }, { raw: true });
    s = parseStream(r.text);
    const follow = ai.calls[ai.calls.length - 1].body.messages;
    check("follow-up sends the conversation, alternating turns", follow.length === 4 && follow[0].role === "system" && follow[1].role === "user" && follow[2].role === "assistant" && follow[3].content === "and PayU?", follow.map((m) => m.role));

    r = await owner("POST", "/api/support/ask", { question: "FAIL-AI how do I add a product with sizes?" }, { raw: true });
    s = parseStream(r.text);
    check("when the AI fails, the answer comes from the help centre", s.done && /help centre says/.test(s.answer) && s.answer.includes("/admin/support/articles/"), s.answer.slice(0, 200));

    r = await owner("POST", `/api/support/chats/${chatId}/feedback`, { resolved: true });
    check("mark a conversation solved", r.status === 200 && (await prisma.supportChat.findUnique({ where: { id: chatId } })).resolved === true);

    r = await owner("POST", "/api/support/tickets", { subject: "Hi", body: "short" });
    check("a ticket needs a real subject", r.status === 400, r.data);
    r = await owner("POST", "/api/support/tickets", { subject: "Razorpay keys rejected", body: "I pasted my live keys and it says invalid.", category: categories[1].key, priority: "high", chatId });
    check("open a ticket with the conversation attached", r.status === 201 && /^#\d{4,}$/.test(r.data.ticket.ref) && r.data.ticket.status === "open" && r.data.ticket.priority === "high", r.data);
    const ticket = r.data.ticket;
    ticketIds.push(ticket.id);
    const chat = await prisma.supportChat.findUnique({ where: { id: chatId } });
    check("the conversation is linked and marked not solved", chat.ticketId === ticket.id && chat.resolved === false, chat);
    const opened = await prisma.emailLog.findFirst({ where: { template: "support_ticket_opened", refId: ticket.id } });
    check("seller gets a 'we've got your request' email", opened && opened.to === ownerEmail && opened.subject.includes(ticket.ref), opened?.subject);
    const inboxMail = await prisma.emailLog.findFirst({ where: { template: "support_ticket_inbox", refId: ticket.id } });
    check("the support inbox gets the ticket with the transcript (when an inbox is set)", !inboxMail || (inboxMail.html.includes("Razorpay keys rejected") && inboxMail.html.includes("conversation with the assistant")), inboxMail?.subject);

    r = await owner("GET", "/api/support/tickets");
    check("seller sees their ticket", r.data.tickets.some((t) => t.id === ticket.id));
    r = await owner("POST", `/api/support/tickets/${ticket.id}/messages`, { body: "Here's a screenshot description: error 401." });
    check("seller replies — back to open", r.status === 200 && r.data.ticket.messages.length === 2 && r.data.ticket.status === "open", r.data);

    const answered = await tickets.teamReply(prisma, { id: null, name: "Priya Support" }, ticket.id, { body: "Your live keys need live mode switched on — try again." });
    check("team reply waits on the seller", answered.status === "waiting" && answered.messages[2].author === "support" && answered.messages[2].authorName.startsWith("Priya"), answered);
    const replyMail = await prisma.emailLog.findFirst({ where: { template: "support_ticket_reply", refId: ticket.id } });
    check("the reply is emailed to the seller with a link back", replyMail && replyMail.to === ownerEmail && replyMail.html.includes("live mode") && replyMail.html.includes(`/admin/support/tickets/${ticket.id}`), replyMail?.subject);
    r = await owner("POST", `/api/support/tickets/${ticket.id}/resolve`);
    check("seller marks it solved", r.data.ticket.status === "resolved" && r.data.ticket.messages.some((m) => m.author === "system"), r.data);

    // Another store can't see it; sellers can't reach the super-admin side.
    const other = client();
    const otherEmail = `flows-e2e-other-${stamp}@test.oyklane.dev`;
    r = await other("POST", "/api/auth/register", { name: "Other", email: otherEmail, password: "correct-horse-battery", storeName: `Flows Other ${stamp}`, plan: "starter" });
    created.push({ storeId: r.data.store.id, emails: [otherEmail] });
    r = await other("GET", `/api/support/tickets/${ticket.id}`);
    check("another store can't open the ticket", r.status === 404, r.data);
    r = await other("POST", `/api/support/tickets/${ticket.id}/messages`, { body: "hi" });
    check("…or reply on it", r.status === 404, r.data);
    r = await owner("GET", "/api/super-admin/support/tickets");
    check("sellers can't use the super-admin support API", r.status === 401 || r.status === 403, r.data);
  } catch (err) {
    check("no unexpected error", false, err.stack || String(err));
  } finally {
    for (const id of ticketIds) await prisma.emailLog.deleteMany({ where: { refType: "support_ticket", refId: id } }).catch(() => {});
    for (const { storeId, emails } of created) {
      await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
      await prisma.user.deleteMany({ where: { email: { in: emails } } }).catch(() => {});
    }
    await prisma.emailLog.deleteMany({ where: { to: { endsWith: "@test.oyklane.dev" } } }).catch(() => {});
    console.log("      (test stores, users, flows, tickets and their emails deleted)");
    await prisma.$disconnect();
    api.child.kill();
    ai.server.close();
  }
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();

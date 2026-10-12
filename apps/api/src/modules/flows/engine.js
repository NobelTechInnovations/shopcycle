const { env } = require("../../config/env");
const { sendEmail } = require("../../lib/mailer");
const { storefrontUrl } = require("../../lib/storefront-url");
const templates = require("../../emails/templates");
const notify = require("../orders/notify");
const { addOrderEvent } = require("../orders/events");
const { PROVIDER_KEYS } = require("../orders/placed");
const webhooks = require("../developer/webhooks");
const { TRIGGERS, UNIT_MS, STEP_TYPES } = require("./catalog");
const context = require("./context");
const { toE164 } = require("../../lib/phone");

/**
 * Runs Flows. An event (order placed, shipped, ...) starts one run per
 * matching flow and subject; the run goes step by step until a Wait, which
 * parks it (status "waiting", nextRunAt) for the jobs tick to pick up
 * again. A condition that isn't met stops the run — that's the whole
 * branching model, and it's what makes a flow readable top to bottom.
 */

const APP_KEY = "flow";
const MAX_LOG = 60;
const STUCK_MS = 15 * 60 * 1000;

const BY_EVENT = {};
for (const [key, t] of Object.entries(TRIGGERS)) for (const e of t.events) (BY_EVENT[e] ||= []).push(key);

async function installed(prisma, storeId) {
  return Boolean(await prisma.storeApp.findFirst({ where: { storeId, app: { key: APP_KEY } }, select: { id: true } }));
}

function test(rule, facts) {
  const v = facts[rule.field];
  const text = String(v ?? "").toLowerCase();
  const want = String(rule.value ?? "").toLowerCase();
  switch (rule.op) {
    case "gt": return Number(v) > Number(rule.value);
    case "gte": return Number(v) >= Number(rule.value);
    case "lt": return Number(v) < Number(rule.value);
    case "lte": return Number(v) <= Number(rule.value);
    case "eq": return Number(v) === Number(rule.value);
    case "neq": return Number(v) !== Number(rule.value);
    case "is": return text === want;
    case "is_not": return text !== want;
    case "contains": return text.includes(want);
    case "not_contains": return !text.includes(want);
    case "is_empty": return !text.trim();
    case "not_empty": return Boolean(text.trim());
    case "is_true": return v === true;
    case "is_false": return !v;
    default: return false;
  }
}

function evaluate(step, facts) {
  const results = step.rules.map((r) => test(r, facts));
  return step.match === "any" ? results.some(Boolean) : results.every(Boolean);
}

const entry = (step, result, detail) => ({ at: new Date().toISOString(), stepId: step?.id || null, type: step?.type || "run", result, detail: detail ? String(detail).slice(0, 300) : undefined });

async function buttonUrl(prisma, store, step, ctx) {
  if (step.buttonLink === "custom") return step.buttonUrl;
  if (step.buttonLink === "store") return storefrontUrl(store, "/");
  if (step.buttonLink === "order" && ctx.order?.id) return notify.statusUrlFor(prisma, store, ctx.order);
  if (step.buttonLink === "recover" && ctx.cartRow?.recoveryToken) return storefrontUrl(store, `/cart/recover/${ctx.cartRow.recoveryToken}`);
  return null;
}

/** Renders a send_email step — for real, for the builder's preview, or a test send. */
async function renderEmail(prisma, store, step, ctx) {
  const url = ctx.sample ? (step.buttonLink ? storefrontUrl(store, "/") : null) : await buttonUrl(prisma, store, step, ctx);
  const summary = step.includeSummary
    ? ctx.order
      ? { order: ctx.order }
      : ctx.cart
        ? { cartItems: ctx.cart.items.map((i) => ({ title: i.title, quantity: i.quantity, total: i.lineTotal })), cartTotal: ctx.cart.total, currency: store.currency }
        : {}
    : {};
  return templates.flowEmail({
    store,
    vars: ctx.vars,
    subject: step.subject,
    heading: step.heading,
    text: step.body,
    discountCode: step.discountCode,
    buttonLabel: step.buttonLabel,
    buttonUrl: url,
    icon: step.icon || null,
    banner: step.banner || null,
    ...summary,
  });
}

async function runEmailStep(prisma, store, flow, run, step, ctx, log) {
  // Test mode: every email goes to the seller's test address instead.
  const settings = flow.settings && typeof flow.settings === "object" ? flow.settings : {};
  const to = settings.testMode ? settings.testEmail : ctx.email;
  if (!to) return { result: "skipped", detail: settings.testMode ? "Test mode is on but there's no test email" : "No email address to send to" };
  const rendered = await renderEmail(prisma, store, step, ctx);
  const subject = `${settings.testMode ? "[Test] " : ""}${rendered.subject}`;
  const { html } = rendered;
  const sent = await sendEmail(prisma, {
    to,
    subject,
    html,
    template: "flow",
    storeId: store.id,
    fromName: store.name,
    replyTo: store.supportEmail || undefined,
    refType: run.subjectType,
    refId: run.subjectId,
    log,
  });
  if (sent.status === "failed") return { result: "failed", detail: `Couldn't email ${to}` };
  await prisma.flow.update({ where: { id: flow.id }, data: { emailsSent: { increment: 1 } } });
  if (run.subjectType === "order" && !settings.testMode) {
    await addOrderEvent(prisma, run.subjectId, { kind: "email", message: `Flow "${flow.name}" emailed "${subject}" to ${to}`, meta: { template: "flow", flowId: flow.id, emailLogId: sent.id } }).catch(() => {});
  }
  return { result: "sent", detail: `"${subject}" to ${to}${settings.testMode ? " (test mode)" : ""}` };
}

async function runOwnerStep(prisma, store, flow, run, step, ctx, log) {
  const base = env.ADMIN_ORIGIN.replace(/\/$/, "");
  const adminUrl =
    run.subjectType === "order" ? `${base}/admin/orders/${run.subjectId}` : run.subjectType === "customer" ? `${base}/admin/customers/${run.subjectId}` : `${base}/admin/orders/abandoned`;
  const note = templates.flowOwnerNote({ store, vars: ctx.vars, subject: step.subject, text: step.body, adminUrl });
  const inboxes = await notify.storeInboxes(prisma, store);
  for (const to of inboxes) {
    await sendEmail(prisma, { to, ...note, template: "flow_owner_note", storeId: store.id, refType: run.subjectType, refId: run.subjectId, log });
  }
  return { result: "sent", detail: `"${note.subject}" to ${inboxes.length} inbox${inboxes.length === 1 ? "" : "es"}` };
}

const flowSettings = (flow) => (flow.settings && typeof flow.settings === "object" ? flow.settings : {});

/** Minutes past midnight in the store's time zone. */
function localMinutes(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timeZone || "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === "hour")?.value || 0) % 24;
  return h * 60 + Number(parts.find((p) => p.type === "minute")?.value || 0);
}
const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** When quiet hours are on and it's inside them, when they end; else null. */
function quietUntil(settings, store, now = new Date()) {
  const q = settings.quietHours;
  if (!q?.enabled) return null;
  const cur = localMinutes(now, store.timezone);
  const from = toMin(q.from);
  const to = toMin(q.to);
  const inside = from <= to ? cur >= from && cur < to : cur >= from || cur < to;
  if (!inside) return null;
  const wait = (to - cur + 24 * 60) % (24 * 60) || 24 * 60;
  return new Date(now.getTime() + wait * 60 * 1000);
}

/** Sends a WhatsApp step: an approved template to the customer's number,
 * with every rule checked first — and the reason recorded when skipped. */
async function runWhatsappStep(prisma, store, flow, run, step, ctx) {
  const whatsapp = require("../whatsapp/service");
  const cloud = require("../whatsapp/cloud");
  const settings = flowSettings(flow);
  const conn = await cloud.connectionOrThrow(prisma, store.id).catch(() => null);
  if (!conn) return { result: "skipped", detail: "WhatsApp isn't connected (Apps ▸ WhatsApp)" };
  let phone = toE164(ctx.phone);
  if (settings.testMode) {
    phone = toE164(settings.testPhone);
    if (!phone) return { result: "skipped", detail: "Test mode is on but there's no test number" };
  }
  if (!phone) return { result: "skipped", detail: "No valid mobile number for this customer" };
  if (!settings.testMode) {
    if (await whatsapp.optedOut(prisma, store.id, phone)) return { result: "skipped", detail: "The customer opted out of WhatsApp messages" };
    if (step.category === "MARKETING" && !ctx.customer?.acceptsWhatsappMarketing) return { result: "skipped", detail: "Marketing template, and the customer hasn't agreed to WhatsApp marketing" };
    if (settings.maxPerCustomerDays > 0) {
      const since = new Date(Date.now() - settings.maxPerCustomerDays * 24 * 3600 * 1000);
      const recent = await prisma.whatsappMessage.count({ where: { storeId: store.id, toPhone: phone, source: "flow", direction: "outbound", status: { not: "failed" }, createdAt: { gte: since } } });
      if (recent) return { result: "skipped", detail: `Already messaged by a flow in the last ${settings.maxPerCustomerDays} day(s)` };
    }
  }
  const all = await whatsapp.templates(prisma, store);
  const tpl = all.find((t) => t.name === step.templateName && t.language === step.language) || all.find((t) => t.name === step.templateName);
  if (!tpl) return { result: "failed", detail: `Template "${step.templateName}" doesn't exist in your WhatsApp account` };
  if (tpl.status !== "APPROVED") return { result: "failed", detail: `Template "${tpl.name}" isn't approved (${String(tpl.status).toLowerCase()})` };
  if (tpl.category === "MARKETING" && !settings.testMode && !ctx.customer?.acceptsWhatsappMarketing) return { result: "skipped", detail: "Meta lists this template as Marketing, and the customer hasn't agreed to WhatsApp marketing" };
  const value = (v) => (v?.source === "text" ? v.value : v?.source ? ctx.vars[v.source] ?? "" : "");
  const body = (step.variables || []).map(value);
  const missing = body.slice(0, tpl.bodyVariables).findIndex((x) => !String(x).trim());
  if (missing >= 0) return { result: "skipped", detail: `No value for {{${missing + 1}}} (${step.variables[missing]?.source || "not set"})` };
  let components;
  try {
    components = whatsapp.templateComponents(tpl, { body, headerMediaUrl: step.headerMediaUrl || undefined, buttonUrl: step.button ? value(step.button) : undefined });
  } catch (err) {
    return { result: "failed", detail: err.message };
  }
  const res = await whatsapp.deliver(prisma, store, {
    conn,
    phone,
    dedupeKey: `flow:${run.id}:${step.id}`,
    payload: { type: "template", template: { name: tpl.name, language: { code: tpl.language }, components } },
    record: { kind: "template", messageType: "template", templateName: tpl.name, templateLanguage: tpl.language, body: `${settings.testMode ? "[Test] " : ""}${whatsapp.renderTemplateText(tpl, body)}`, source: "flow", flowRunId: run.id, customerId: ctx.customer?.id || null },
  }).catch((err) => ({ error: err }));
  if (res.duplicate) return { result: "skipped", detail: "Already sent for this run" };
  if (res.error) return { result: "failed", detail: res.error.message };
  await prisma.flow.update({ where: { id: flow.id }, data: { whatsappSent: { increment: 1 } } });
  if (run.subjectType === "order" && !settings.testMode) {
    await addOrderEvent(prisma, run.subjectId, { kind: "whatsapp", message: `Flow "${flow.name}" sent WhatsApp "${tpl.name}" to +${phone}`, meta: { flowId: flow.id, template: tpl.name } }).catch(() => {});
  }
  return { result: "sent", detail: `"${tpl.name}" to +${phone}${settings.testMode ? " (test mode)" : ""}` };
}

/** Runs a flow run from its current step until a Wait, a stop or the end.
 * `shared` lets the flows started by one event load the order (customer,
 * checkout) once between them; `installChecked` skips a check the caller
 * just made. */
async function advance(prisma, runId, { log, shared, installChecked = false } = {}) {
  const run = await prisma.flowRun.findUnique({ where: { id: runId }, include: { flow: { include: { store: true } } } });
  if (!run || run.status !== "running") return run;
  const { flow } = run;
  const store = flow.store;
  const steps = Array.isArray(flow.steps) ? flow.steps : [];
  const entries = Array.isArray(run.log) ? run.log.slice(-MAX_LOG) : [];
  const save = (data) => prisma.flowRun.update({ where: { id: run.id }, data: { log: entries.slice(-MAX_LOG), ...data } });
  const finish = (status, error = null) => save({ status, stepId: null, nextRunAt: null, error });

  try {
    if (!flow.enabled) return finish("stopped", "The flow was turned off.");
    if (store.status !== "active") return finish("stopped", "The store isn't active.");
    if (!installChecked && !(await installed(prisma, store.id))) return finish("stopped", "The Flow app was removed.");
    let index = run.stepId ? steps.findIndex((s) => s.id === run.stepId) : steps.length;
    if (index < 0) return finish("stopped", "The next step was removed from the flow.");

    let ctx = null;
    for (; index < steps.length; index += 1) {
      const step = steps[index];
      if (step.type === "wait") {
        const until = new Date(Date.now() + step.amount * UNIT_MS[step.unit]);
        const next = steps[index + 1];
        entries.push(entry(step, "waiting", `${step.amount} ${step.amount === 1 ? step.unit.replace(/s$/, "") : step.unit}`));
        if (!next) return finish("done");
        return save({ status: "waiting", stepId: next.id, nextRunAt: until });
      }
      if (!ctx) {
        ctx = shared?.ctx || (await context.load(prisma, store, run.subjectType, run.subjectId, { since: run.createdAt }));
        if (shared) shared.ctx = ctx;
      }
      if (!ctx) {
        entries.push(entry(step, "stopped", `The ${run.subjectType === "cart" ? "checkout" : run.subjectType} no longer exists`));
        return finish("stopped");
      }
      if (step.type === "condition") {
        const ok = evaluate(step, ctx.facts);
        entries.push(entry(step, ok ? "passed" : "not_met", ok ? null : step.otherwise === "skip" ? "Skipped the next step" : step.otherwise === "goto" ? "Jumped ahead" : null));
        if (!ok) {
          if (step.otherwise === "skip") {
            index += 1;
            continue;
          }
          if (step.otherwise === "goto") {
            const target = steps.findIndex((x) => x.id === step.gotoStepId);
            // Only forward, so a flow can never loop.
            if (target > index) {
              index = target - 1;
              continue;
            }
          }
          return finish("stopped");
        }
      } else if (step.type === "send_whatsapp") {
        const until = quietUntil(flowSettings(flow), store);
        if (until) {
          entries.push(entry(step, "waiting", "Quiet hours — sends when they end"));
          return save({ status: "waiting", stepId: step.id, nextRunAt: until });
        }
        const r = await runWhatsappStep(prisma, store, flow, run, step, ctx);
        entries.push(entry(step, r.result, r.detail));
      } else if (step.type === "send_email") {
        const r = await runEmailStep(prisma, store, flow, run, step, ctx, log);
        entries.push(entry(step, r.result, r.detail));
      } else if (step.type === "notify_owner") {
        const r = await runOwnerStep(prisma, store, flow, run, step, ctx, log);
        entries.push(entry(step, r.result, r.detail));
      }
    }
    return finish("done");
  } catch (err) {
    log?.warn({ err, runId }, "flows: run failed");
    entries.push(entry(null, "failed", err.message));
    return finish("failed", String(err.message || err).slice(0, 500));
  }
}

/** Starts a flow for one subject — once: a repeat of the same event (an
 * order paid after it was created, a second shipment) finds the run
 * already there and does nothing. */
async function start(prisma, flow, subjectType, subjectId, { log, shared, installChecked } = {}) {
  let run;
  try {
    run = await prisma.flowRun.create({
      data: { flowId: flow.id, storeId: flow.storeId, subjectType, subjectId, status: "running", stepId: flow.steps?.[0]?.id || null },
    });
  } catch (err) {
    if (err.code === "P2002") return null;
    throw err;
  }
  await prisma.flow.update({ where: { id: flow.id }, data: { runsCount: { increment: 1 }, lastRunAt: new Date() } });
  return advance(prisma, run.id, { log, shared, installChecked });
}

/** webhooks.emit's listener — every store event passes through here. */
async function onEvent(prisma, storeId, event, subject, { log } = {}) {
  const triggers = BY_EVENT[event];
  if (!triggers || !subject?.id) return 0;
  const flows = await prisma.flow.findMany({ where: { storeId, enabled: true, trigger: { in: triggers } } });
  if (!flows.length || !(await installed(prisma, storeId))) return 0;
  let pending = false;
  if (TRIGGERS[triggers[0]].subject === "order") {
    // An online order still waiting for its payment isn't an order yet
    // (orders/placed.js) — except to "Payment pending" flows, which are
    // only for those.
    const order = await prisma.order.findFirst({ where: { id: subject.id, storeId }, select: { paymentMethod: true, paymentStatus: true, paymentReference: true } });
    if (!order) return 0;
    pending = (PROVIDER_KEYS.includes(order.paymentMethod) || order.paymentMethod === "upi_qr") && order.paymentStatus === "pending" && !(order.paymentMethod === "upi_qr" && order.paymentReference);
  }
  let started = 0;
  const shared = { ctx: null };
  for (const flow of flows) {
    if (Boolean(TRIGGERS[flow.trigger].pendingOnly) !== pending && TRIGGERS[flow.trigger].subject === "order") continue;
    const run = await start(prisma, flow, TRIGGERS[flow.trigger].subject, subject.id, { log, shared, installChecked: true }).catch((err) =>
      log?.warn({ err, flowId: flow.id }, "flows: couldn't start")
    );
    if (run) started += 1;
  }
  return started;
}

/** Jobs tick: runs whose Wait is over. Each is claimed before it runs, so
 * two API processes never run the same one. */
async function processDue(prisma, { log, limit = 25, storeId } = {}) {
  const scope = storeId ? { storeId } : {};
  await prisma.flowRun.updateMany({
    where: { ...scope, status: "running", updatedAt: { lt: new Date(Date.now() - STUCK_MS) } },
    data: { status: "waiting", nextRunAt: new Date() },
  });
  const due = await prisma.flowRun.findMany({ where: { ...scope, status: "waiting", nextRunAt: { lte: new Date() } }, orderBy: { nextRunAt: "asc" }, take: limit, select: { id: true } });
  let ran = 0;
  for (const { id } of due) {
    const { count } = await prisma.flowRun.updateMany({ where: { id, status: "waiting" }, data: { status: "running" } });
    if (count !== 1) continue;
    await advance(prisma, id, { log });
    ran += 1;
  }
  return ran;
}

let registered = false;
function register(log) {
  if (registered) return;
  registered = true;
  webhooks.onEvent((prisma, storeId, event, subject) => onEvent(prisma, storeId, event, subject, { log }));
}

/** The builder's live preview, with made-up values. */
async function preview(prisma, store, trigger, step) {
  const ctx = context.sample(store, TRIGGERS[trigger].subject);
  if (step.type === "notify_owner") return templates.flowOwnerNote({ store, vars: ctx.vars, subject: step.subject, text: step.body, adminUrl: env.ADMIN_ORIGIN });
  return renderEmail(prisma, store, step, ctx);
}

/** "Send me a test": every email step, with made-up values, to one address. */
async function sendTest(prisma, store, flow, to, { log } = {}) {
  const ctx = context.sample(store, TRIGGERS[flow.trigger].subject);
  let sent = 0;
  for (const step of flow.steps) {
    if (!["send_email", "notify_owner"].includes(step.type)) continue;
    const email = await preview(prisma, store, flow.trigger, step);
    await sendEmail(prisma, { to, subject: `[Test] ${email.subject}`, html: email.html, template: "flow_test", storeId: store.id, fromName: store.name, log });
    sent += 1;
  }
  return sent;
}

module.exports = { APP_KEY, STEP_TYPES, onEvent, start, advance, processDue, register, preview, sendTest, evaluate, installed, quietUntil };

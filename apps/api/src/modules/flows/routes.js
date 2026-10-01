const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const appsService = require("../apps/service");
const { throttle } = require("../../lib/throttle");
const catalog = require("./catalog");
const engine = require("./engine");
const templates = require("../../emails/templates");
const { ICON_CHOICES, iconUrl } = require("../../emails/assets");
const { mergeSettings } = require("../../lib/store-settings");

/**
 * /api/flows — the Flow app's own panel (Apps ▸ Flow): the store's
 * automations, the recipes they start from, and each flow's recent runs.
 * Only for stores with the app installed.
 */

const RUN_SELECT = { id: true, subjectType: true, subjectId: true, status: true, stepId: true, nextRunAt: true, log: true, error: true, createdAt: true, updatedAt: true };

function shape(flow) {
  return {
    id: flow.id,
    name: flow.name,
    trigger: flow.trigger,
    steps: flow.steps,
    enabled: flow.enabled,
    templateKey: flow.templateKey,
    runsCount: flow.runsCount,
    emailsSent: flow.emailsSent,
    lastRunAt: flow.lastRunAt,
    createdAt: flow.createdAt,
    updatedAt: flow.updatedAt,
  };
}

async function findFlow(prisma, storeId, id) {
  const flow = await prisma.flow.findFirst({ where: { id, storeId } });
  if (!flow) throw new HttpError(404, "Flow not found");
  return flow;
}

async function flowsRoutes(fastify) {
  const { prisma } = fastify;
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  fastify.addHook("preHandler", fastify.requireActiveSubscription);
  fastify.addHook("preHandler", async (request) => appsService.assertInstalled(prisma, request.store.id, engine.APP_KEY));

  fastify.get("/", async (request) => {
    const flows = await prisma.flow.findMany({ where: { storeId: request.store.id }, orderBy: { createdAt: "desc" } });
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [runs30, waiting] = await Promise.all([
      prisma.flowRun.count({ where: { storeId: request.store.id, createdAt: { gte: since } } }),
      prisma.flowRun.count({ where: { storeId: request.store.id, status: "waiting" } }),
    ]);
    return {
      flows: flows.map(shape),
      stats: { active: flows.filter((f) => f.enabled).length, runs30, waiting, emailsSent: flows.reduce((n, f) => n + f.emailsSent, 0) },
      catalog: catalog.builderCatalog(),
    };
  });

  fastify.post("/", async (request, reply) => {
    const body = request.body || {};
    const count = await prisma.flow.count({ where: { storeId: request.store.id } });
    if (count >= 50) throw new HttpError(400, "A store can have up to 50 flows.");
    const data = body.recipe
      ? catalog.recipe(String(body.recipe))
      : (() => {
          const base = catalog.cleanFlow(body);
          return { ...base, steps: catalog.cleanSteps(body.steps || [], base.trigger) };
        })();
    const flow = await prisma.flow.create({ data: { storeId: request.store.id, enabled: false, ...data } });
    reply.code(201);
    return { flow: shape(flow) };
  });

  // ── Email design: logo, colour and layout for every email the store
  // sends (order emails and flows alike), in store.settings.emailDesign.

  const designSchema = z.object({
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour"),
    logoUrl: z.string().trim().max(1000).optional().nullable(),
    logoWidth: z.coerce.number().int().min(60).max(240).default(120),
    style: z.enum(templates.STYLES).default("classic"),
  });

  async function themeLogo(storeId) {
    const theme = await prisma.theme.findFirst({ where: { storeId, isActive: true }, select: { settingsData: true } });
    const logo = theme?.settingsData?.sections?.header?.settings?.logo;
    return typeof logo === "string" && /^https:\/\//.test(logo) ? logo : null;
  }

  /** Two sample emails in a design: an order confirmation and a flow email. */
  function samples(store, design) {
    const s = { ...store, settings: { ...(store.settings || {}), emailDesign: design } };
    const order = {
      orderNumber: 1043, currency: store.currency || "INR", subtotal: 2299, discount: 0, shipping: 0, tax: 0, total: 2299,
      paymentMethod: "cod", paymentStatus: "pending", shippingName: "Ananya Sharma",
      shippingAddress1: "12, MG Road", shippingCity: "Pune", shippingProvince: "Maharashtra", shippingZip: "411001",
      items: [{ title: "Pure linen shirt", quantity: 1, total: 1499 }, { title: "Cotton kurta", quantity: 1, total: 800 }],
    };
    return {
      order: templates.orderConfirmation({ store: s, order, statusUrl: "#" }).html,
      flow: templates.flowEmail({
        store: s,
        vars: { "customer.first_name": "Ananya", "store.name": store.name },
        subject: "A thank-you from {{store.name}}",
        heading: "Thanks for shopping with us, {{customer.first_name}}!",
        text: "We loved packing your order. Here's 10% off your next one — just use {{discount_code}} at checkout.",
        discountCode: "THANKYOU10",
        buttonLabel: "Shop again",
        buttonUrl: "#",
        icon: "gift",
      }).html,
    };
  }

  fastify.get("/email-design", async (request) => {
    const saved = request.store.settings?.emailDesign || null;
    const design = templates.makeDesign(saved || { logoUrl: await themeLogo(request.store.id) });
    return {
      design: { accent: design.accent, logoUrl: design.logoUrl, logoWidth: design.logoWidth, style: design.style },
      saved: Boolean(saved),
      themeLogo: await themeLogo(request.store.id),
      icons: ICON_CHOICES.map((key) => ({ key, url: iconUrl(key) })),
      styles: templates.STYLES,
      preview: samples(request.store, design),
    };
  });

  fastify.post("/email-design/preview", async (request) => {
    const design = designSchema.parse(request.body || {});
    return { preview: samples(request.store, templates.makeDesign(design)) };
  });

  fastify.put("/email-design", async (request) => {
    const input = designSchema.parse(request.body || {});
    if (input.logoUrl && !/^https:\/\//i.test(input.logoUrl)) throw new HttpError(400, "The logo needs to be an https:// image — upload it from Files.");
    const design = templates.makeDesign(input);
    const emailDesign = { accent: design.accent, logoUrl: design.logoUrl, logoWidth: design.logoWidth, style: design.style };
    await prisma.store.update({ where: { id: request.store.id }, data: { settings: mergeSettings(request.store, { emailDesign }) } });
    return { design: emailDesign };
  });

  fastify.get("/:id", async (request) => {
    const flow = await findFlow(prisma, request.store.id, request.params.id);
    const runs = await prisma.flowRun.findMany({ where: { flowId: flow.id }, orderBy: { createdAt: "desc" }, take: 30, select: RUN_SELECT });
    // What each run was for, in words the seller recognises.
    const ids = (type) => runs.filter((r) => r.subjectType === type).map((r) => r.subjectId);
    const [orders, customers, carts] = await Promise.all([
      prisma.order.findMany({ where: { storeId: request.store.id, id: { in: ids("order") } }, select: { id: true, orderNumber: true, shippingName: true, email: true } }),
      prisma.customer.findMany({ where: { storeId: request.store.id, id: { in: ids("customer") } }, select: { id: true, name: true, email: true } }),
      prisma.cartSession.findMany({ where: { storeId: request.store.id, cartId: { in: ids("cart") } }, select: { cartId: true, email: true, customerName: true } }),
    ]);
    const label = {};
    for (const o of orders) label[o.id] = { title: `Order #${o.orderNumber}`, detail: o.shippingName || o.email || "", href: `/admin/orders/${o.id}` };
    for (const c of customers) label[c.id] = { title: c.name || c.email, detail: c.email, href: `/admin/customers/${c.id}` };
    for (const c of carts) label[c.cartId] = { title: `Checkout by ${c.customerName || c.email}`, detail: c.email || "", href: "/admin/orders/abandoned" };
    return { flow: shape(flow), runs: runs.map((r) => ({ ...r, subject: label[r.subjectId] || { title: "No longer available", detail: "", href: null } })), catalog: catalog.builderCatalog() };
  });

  fastify.patch("/:id", async (request) => {
    const flow = await findFlow(prisma, request.store.id, request.params.id);
    const body = request.body || {};
    const data = catalog.cleanFlow(body, { partial: true });
    const trigger = data.trigger || flow.trigger;
    if (body.steps !== undefined || data.trigger) data.steps = catalog.cleanSteps(body.steps !== undefined ? body.steps : flow.steps, trigger);
    const steps = data.steps || flow.steps;
    if (data.enabled && !steps.some((s) => s.type === "send_email" || s.type === "notify_owner")) {
      throw new HttpError(400, "Add an email step before turning the flow on.");
    }
    const updated = await prisma.flow.update({ where: { id: flow.id }, data });
    // Turned off: runs waiting on it stop at their next step (engine.advance).
    return { flow: shape(updated) };
  });

  fastify.delete("/:id", async (request, reply) => {
    const flow = await findFlow(prisma, request.store.id, request.params.id);
    await prisma.flow.delete({ where: { id: flow.id } });
    reply.code(204);
  });

  fastify.post("/preview", async (request) => {
    const { trigger, step } = z.object({ trigger: z.string(), step: z.record(z.string(), z.any()) }).parse(request.body || {});
    if (!catalog.TRIGGERS[trigger]) throw new HttpError(400, "Unknown trigger");
    const [clean] = catalog.cleanSteps([step], trigger);
    return engine.preview(prisma, request.store, trigger, clean);
  });

  fastify.post("/:id/test", async (request) => {
    const { to } = z.object({ to: z.string().trim().email() }).parse(request.body || {});
    await throttle(fastify, `flow-test:${request.store.id}`, { max: 20, windowSeconds: 60 * 60, message: "That's a lot of test emails — try again in a little while." });
    const flow = await findFlow(prisma, request.store.id, request.params.id);
    const sent = await engine.sendTest(prisma, request.store, flow, to, { log: request.log });
    if (!sent) throw new HttpError(400, "This flow has no email steps to test.");
    return { sent, to };
  });
}

module.exports = flowsRoutes;

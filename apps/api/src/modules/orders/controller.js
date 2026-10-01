const { z } = require("zod");
const {
  createOrderSchema,
  updateOrderStatusSchema,
  listOrdersQuerySchema,
} = require("@shopcycle/validation");
const service = require("./service");
const operations = require("./operations");
const { createRefund } = require("./refunds");
const returns = require("./returns");
const notify = require("./notify");
const { issueInvoice, buildInvoice } = require("./invoice");
const { COURIERS } = require("./couriers");
const { actorNameFrom } = require("./events");
const { listAbandonedCheckouts } = require("../checkout/abandoned");

const { HttpError } = require("@shopcycle/utils");
const customerInsights = require("../customers/insights");

const ctx = (request) => ({ actorName: actorNameFrom(request), log: request.log });

/** Refunds send money out of the business — owners and admins only. */
function assertCanRefund(request) {
  if (request.storeRole === "staff") throw new HttpError(403, "Only the store owner or an admin can issue refunds.");
}

const selection = z
  .array(z.object({ orderItemId: z.string().min(1), quantity: z.coerce.number().int().min(0) }))
  .max(200)
  .default([]);

const fulfillSchema = z.object({
  items: selection,
  courier: z.string().trim().max(60).optional().nullable(),
  trackingNumber: z.string().trim().max(80).optional().nullable(),
  trackingUrl: z
    .string()
    .trim()
    .max(500)
    .regex(/^https?:\/\//i, "Tracking link must start with http:// or https://")
    .optional()
    .nullable()
    .or(z.literal("")),
  notify: z.boolean().default(true),
});

const fulfillmentActionSchema = z.object({
  action: z.enum(["delivered", "cancel"]),
  notify: z.boolean().default(true),
});

const refundSchema = z.object({
  items: selection,
  amount: z.coerce.number().positive("Enter an amount to refund").max(10_000_000),
  reason: z.string().trim().max(200).optional().nullable(),
  restock: z.boolean().default(false),
  notify: z.boolean().default(true),
  returnId: z.string().optional(),
});

const cancelSchema = z.object({
  reason: z.string().trim().max(200).optional().nullable(),
  restock: z.boolean().default(true),
  refund: z.boolean().default(true),
  notify: z.boolean().default(true),
});

const noteSchema = z.object({ note: z.string().trim().min(1, "Write something first").max(2000) });

const createReturnSchema = z.object({
  items: selection,
  reason: z.string().trim().max(200).optional().nullable(),
});

const returnActionSchema = z.object({
  action: z.enum(["approve", "decline", "receive", "close"]),
  merchantNote: z.string().trim().max(1000).optional().nullable(),
  restock: z.boolean().default(true),
  notify: z.boolean().default(true),
});

const abandonedQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

async function listHandler(request, reply) {
  const query = listOrdersQuerySchema.parse(request.query);
  const result = await service.listOrders(request.server.prisma, request.store.id, query);
  reply.send(result);
}

async function getHandler(request, reply) {
  const order = await service.getOrder(request.server.prisma, request.store, request.params.id);
  reply.send({ order });
}

async function createHandler(request, reply) {
  const body = createOrderSchema.parse(request.body);
  const order = await service.createOrder(request.server.prisma, request.store.id, body, ctx(request));
  reply.code(201).send({ order });
}

async function updateStatusHandler(request, reply) {
  const body = updateOrderStatusSchema.parse(request.body);
  const order = await service.updateOrderStatus(request.server.prisma, request.store, request.params.id, body, ctx(request));
  reply.send({ order });
}

async function couriersHandler(request, reply) {
  reply.send({ couriers: COURIERS });
}

async function fulfillHandler(request, reply) {
  const body = fulfillSchema.parse(request.body);
  const fulfillment = await operations.createFulfillment(request.server.prisma, request.store, request.params.id, body, ctx(request));
  reply.code(201).send({ fulfillment });
}

async function fulfillmentActionHandler(request, reply) {
  const body = fulfillmentActionSchema.parse(request.body);
  const fulfillment = await operations.updateFulfillment(
    request.server.prisma,
    request.store,
    request.params.id,
    request.params.fulfillmentId,
    body.action,
    { ...ctx(request), notify: body.notify }
  );
  reply.send({ fulfillment });
}

async function markPaidHandler(request, reply) {
  await operations.markPaid(request.server.prisma, request.store, request.params.id, ctx(request));
  reply.send({ ok: true });
}

async function cancelHandler(request, reply) {
  const body = cancelSchema.parse(request.body || {});
  if (body.refund) assertCanRefund(request);
  await operations.cancelOrder(request.server.prisma, request.store, request.params.id, body, ctx(request));
  reply.send({ ok: true });
}

async function refundHandler(request, reply) {
  assertCanRefund(request);
  const body = refundSchema.parse(request.body);
  const { prisma } = request.server;
  const refund = await createRefund(prisma, request.store, request.params.id, body, ctx(request));
  if (body.returnId) {
    const order = await operations.loadOrder(prisma, request.store.id, request.params.id);
    if (order.returns.some((r) => r.id === body.returnId)) await returns.attachRefund(prisma, body.returnId, refund.id);
  }
  reply.code(201).send({ refund });
}

async function noteHandler(request, reply) {
  const { note } = noteSchema.parse(request.body);
  const event = await operations.addNote(request.server.prisma, request.store, request.params.id, note, ctx(request));
  reply.code(201).send({ event });
}

async function resendConfirmationHandler(request, reply) {
  const { prisma } = request.server;
  const order = await operations.loadOrder(prisma, request.store.id, request.params.id);
  const result = await notify.resendOrderConfirmation(prisma, request.store, order, request.log);
  reply.send({ status: result?.status || "skipped" });
}

async function createReturnHandler(request, reply) {
  const body = createReturnSchema.parse(request.body);
  const { prisma } = request.server;
  const order = await operations.loadOrder(prisma, request.store.id, request.params.id);
  const ret = await returns.requestReturn(prisma, request.store, order, body, { byShopper: false, ...ctx(request) });
  reply.code(201).send({ return: ret });
}

async function returnActionHandler(request, reply) {
  const body = returnActionSchema.parse(request.body);
  const ret = await returns.updateReturn(
    request.server.prisma,
    request.store,
    request.params.id,
    request.params.returnId,
    body,
    ctx(request)
  );
  reply.send({ return: ret });
}

async function issueInvoiceHandler(request, reply) {
  const { prisma } = request.server;
  const order = await operations.loadOrder(prisma, request.store.id, request.params.id);
  const updated = await issueInvoice(prisma, request.store, order);
  reply.send({ invoiceNumber: updated.invoiceNumber });
}

/** Invoice data for the admin (the printable page itself is the shopper's
 * /orders/<token>/invoice, which the admin opens in a new tab). */
async function getInvoiceHandler(request, reply) {
  const { prisma } = request.server;
  const order = await operations.loadOrder(prisma, request.store.id, request.params.id);
  if (!order.invoiceNumber) {
    reply.code(404).send({ error: "No invoice has been issued for this order yet." });
    return;
  }
  const { money, ...invoice } = buildInvoice(request.store, order);
  reply.send({ invoice, statusUrl: await notify.statusUrlFor(prisma, request.store, order) });
}

async function statusLinkHandler(request, reply) {
  const { prisma } = request.server;
  const order = await operations.loadOrder(prisma, request.store.id, request.params.id);
  reply.send({ url: await notify.statusUrlFor(prisma, request.store, order) });
}

async function abandonedHandler(request, reply) {
  const query = abandonedQuery.parse(request.query);
  reply.send(await listAbandonedCheckouts(request.server.prisma, request.store, query));
}

async function returnsListHandler(request, reply) {
  const status = z.enum(["open", "all"]).default("open").parse(request.query.status);
  const where = { storeId: request.store.id, ...(status === "open" && { status: { in: ["requested", "approved", "received"] } }) };
  const rows = await request.server.prisma.returnRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { order: { select: { id: true, orderNumber: true, shippingName: true, email: true, total: true, currency: true } } },
  });
  reply.send({ returns: rows });
}

/** GET /api/orders/:id/insights — the shopper's history, to decide whether to ship. */
async function insightsHandler(request, reply) {
  reply.send({ insights: await customerInsights.forOrder(request.server.prisma, request.store.id, request.params.id) });
}

module.exports = {
  insightsHandler,
  listHandler,
  getHandler,
  createHandler,
  updateStatusHandler,
  couriersHandler,
  fulfillHandler,
  fulfillmentActionHandler,
  markPaidHandler,
  cancelHandler,
  refundHandler,
  noteHandler,
  resendConfirmationHandler,
  createReturnHandler,
  returnActionHandler,
  issueInvoiceHandler,
  getInvoiceHandler,
  statusLinkHandler,
  abandonedHandler,
  returnsListHandler,
};

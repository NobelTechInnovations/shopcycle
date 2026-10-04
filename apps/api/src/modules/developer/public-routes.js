const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const { createProductSchema, updateProductSchema } = require("@shopcycle/validation");
const serialize = require("./serializers");
const keys = require("./api-keys");
const webhooks = require("./webhooks");
const productsService = require("../products/service");
const operations = require("../orders/operations");
const { adjustStock, setStock } = require("../../lib/inventory");

/**
 * The public API, /api/v1 — for a seller's own integrations, authenticated
 * with an API key (Settings ▸ API & webhooks) and limited by its scopes.
 * Lists are paginated: ?page=1&limit=50 (max 100), newest first, with
 * { data, page, limit, total } in the response.
 */
const pageQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  updated_since: z.string().datetime({ offset: true }).optional(),
});
const since = (q) => (q.updated_since ? { updatedAt: { gte: new Date(q.updated_since) } } : {});
const paged = (data, q, total) => ({ data, page: q.page, limit: q.limit, total });

async function publicApiRoutes(fastify) {
  // Per key, not per IP: integrations often share servers.
  const limit = { rateLimit: { max: 240, timeWindow: "1 minute", keyGenerator: (req) => String(req.headers.authorization || req.headers["x-oyklane-key"] || req.ip) } };
  const scope = (s) => ({ config: limit, preHandler: keys.requireScope(fastify, s) });
  const db = fastify.prisma;

  fastify.get("/shop", scope(null), async (request) => {
    const s = request.store;
    return { data: { id: s.id, name: s.name, handle: s.handle, currency: s.currency, timezone: s.timezone, domain: s.domainVerifiedAt ? s.domain : null } };
  });

  // ── Products ──
  fastify.get("/products", scope("read_products"), async (request) => {
    const q = pageQuery.extend({ status: z.enum(["active", "draft", "archived"]).optional() }).parse(request.query);
    const where = { storeId: request.store.id, ...(q.status && { status: q.status }), ...since(q) };
    const [rows, total] = await Promise.all([
      db.product.findMany({ where, include: webhooks.PRODUCT_INCLUDE, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.limit, take: q.limit }),
      db.product.count({ where }),
    ]);
    return paged(rows.map(serialize.product), q, total);
  });

  fastify.get("/products/:id", scope("read_products"), async (request) => {
    const p = await db.product.findFirst({ where: { id: request.params.id, storeId: request.store.id }, include: webhooks.PRODUCT_INCLUDE });
    if (!p) throw new HttpError(404, "Product not found");
    return { data: serialize.product(p) };
  });

  fastify.post("/products", scope("write_products"), async (request, reply) => {
    const body = createProductSchema.parse(request.body);
    const store = await db.store.findUnique({ where: { id: request.store.id }, include: { plan: true } });
    const created = await productsService.createProduct(db, store, body, { actorName: `API · ${request.apiKey.name}` });
    const p = await db.product.findUnique({ where: { id: created.id }, include: webhooks.PRODUCT_INCLUDE });
    webhooks.emit(db, store.id, "product.created", { id: p.id });
    reply.code(201).send({ data: serialize.product(p) });
  });

  fastify.patch("/products/:id", scope("write_products"), async (request) => {
    const body = updateProductSchema.parse(request.body);
    await productsService.updateProduct(db, request.store.id, request.params.id, body, { actorName: `API · ${request.apiKey.name}` });
    const p = await db.product.findUnique({ where: { id: request.params.id }, include: webhooks.PRODUCT_INCLUDE });
    webhooks.emit(db, request.store.id, "product.updated", { id: p.id });
    return { data: serialize.product(p) };
  });

  fastify.delete("/products/:id", scope("write_products"), async (request) => {
    const p = await db.product.findFirst({ where: { id: request.params.id, storeId: request.store.id }, select: { id: true, title: true } });
    await productsService.deleteProduct(db, request.store.id, request.params.id);
    webhooks.emit(db, request.store.id, "product.deleted", p);
    return { data: { id: request.params.id, deleted: true } };
  });

  // ── Inventory ──
  fastify.get("/inventory", scope("read_inventory"), async (request) => {
    const q = pageQuery.parse(request.query);
    const where = { product: { storeId: request.store.id }, ...since(q) };
    const [rows, total] = await Promise.all([
      db.productVariant.findMany({
        where,
        select: { id: true, sku: true, title: true, inventoryQuantity: true, updatedAt: true, product: { select: { id: true, title: true } } },
        orderBy: { updatedAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      db.productVariant.count({ where }),
    ]);
    return paged(
      rows.map((v) => ({ variant_id: v.id, sku: v.sku, title: v.title, product_id: v.product.id, product_title: v.product.title, quantity: v.inventoryQuantity, updated_at: v.updatedAt })),
      q,
      total
    );
  });

  fastify.post("/inventory/adjust", scope("write_inventory"), async (request) => {
    const body = z
      .object({
        variant_id: z.string().min(1),
        mode: z.enum(["add", "set"]).default("add"),
        quantity: z.coerce.number().int().min(-1_000_000).max(1_000_000),
        reason: z.enum(["received", "correction", "damaged", "returned", "other"]).default("correction"),
        note: z.string().max(200).optional(),
      })
      .parse(request.body);
    const variant = await db.productVariant.findFirst({ where: { id: body.variant_id, product: { storeId: request.store.id } } });
    if (!variant) throw new HttpError(404, "Variant not found");
    const actorName = `API · ${request.apiKey.name}`;
    await db.$transaction((tx) =>
      body.mode === "set"
        ? setStock(tx, { storeId: request.store.id, variantId: variant.id, quantity: body.quantity, reason: body.reason, note: body.note, actorName })
        : adjustStock(tx, { storeId: request.store.id, variantId: variant.id, delta: body.quantity, reason: body.reason, note: body.note, actorName })
    );
    const after = await db.productVariant.findUnique({ where: { id: variant.id } });
    return { data: { variant_id: after.id, quantity: after.inventoryQuantity } };
  });

  // ── Orders ──
  fastify.get("/orders", scope("read_orders"), async (request) => {
    const q = pageQuery
      .extend({
        payment_status: z.enum(["pending", "paid", "partially_refunded", "refunded"]).optional(),
        fulfillment_status: z.string().max(40).optional(),
        created_since: z.string().datetime({ offset: true }).optional(),
      })
      .parse(request.query);
    const where = {
      storeId: request.store.id,
      ...(q.payment_status && { paymentStatus: q.payment_status }),
      ...(q.fulfillment_status && { fulfillmentStatus: q.fulfillment_status }),
      ...(q.created_since && { createdAt: { gte: new Date(q.created_since) } }),
      ...since(q),
    };
    const [rows, total] = await Promise.all([
      db.order.findMany({ where, include: webhooks.ORDER_INCLUDE, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.limit, take: q.limit }),
      db.order.count({ where }),
    ]);
    return paged(rows.map(serialize.order), q, total);
  });

  fastify.get("/orders/:id", scope("read_orders"), async (request) => {
    const o = await db.order.findFirst({ where: { id: request.params.id, storeId: request.store.id }, include: webhooks.ORDER_INCLUDE });
    if (!o) throw new HttpError(404, "Order not found");
    return { data: serialize.order(o) };
  });

  fastify.post("/orders/:id/fulfillments", scope("write_orders"), async (request, reply) => {
    const body = z
      .object({
        items: z.array(z.object({ line_item_id: z.string().min(1), quantity: z.coerce.number().int().min(1) })).max(200).default([]),
        courier: z.string().trim().max(60).optional(),
        tracking_number: z.string().trim().max(80).optional(),
        tracking_url: z.string().trim().url().max(500).optional(),
        notify_customer: z.boolean().default(true),
      })
      .parse(request.body);
    const store = await db.store.findUnique({ where: { id: request.store.id } });
    await operations.createFulfillment(
      db,
      store,
      request.params.id,
      {
        items: body.items.map((i) => ({ orderItemId: i.line_item_id, quantity: i.quantity })),
        courier: body.courier || null,
        trackingNumber: body.tracking_number || null,
        trackingUrl: body.tracking_url || null,
        notify: body.notify_customer,
      },
      { actorName: `API · ${request.apiKey.name}`, log: request.log }
    );
    const o = await db.order.findUnique({ where: { id: request.params.id }, include: webhooks.ORDER_INCLUDE });
    reply.code(201).send({ data: serialize.order(o) });
  });

  // ── Customers ──
  fastify.get("/customers", scope("read_customers"), async (request) => {
    const q = pageQuery.extend({ email: z.string().max(200).optional() }).parse(request.query);
    const where = { storeId: request.store.id, ...(q.email && { email: { equals: q.email, mode: "insensitive" } }), ...since(q) };
    const [rows, total] = await Promise.all([
      db.customer.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.limit, take: q.limit }),
      db.customer.count({ where }),
    ]);
    return paged(rows.map(serialize.customer), q, total);
  });

  fastify.get("/customers/:id", scope("read_customers"), async (request) => {
    const c = await db.customer.findFirst({ where: { id: request.params.id, storeId: request.store.id } });
    if (!c) throw new HttpError(404, "Customer not found");
    return { data: serialize.customer(c) };
  });
}

module.exports = publicApiRoutes;

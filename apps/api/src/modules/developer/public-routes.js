const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const { createProductSchema, updateProductSchema } = require("@shopcycle/validation");
const serialize = require("./serializers");
const keys = require("./api-keys");
const webhooks = require("./webhooks");
const productsService = require("../products/service");
const operations = require("../orders/operations");
const { adjustStock, setStock } = require("../../lib/inventory");
const { env } = require("../../config/env");
const imports = require("./imports");
const { toE164 } = require("../../lib/phone");

// A unique externalId already used by another record.
const clash = (err, what) => {
  if (err?.code === "P2002") throw new HttpError(409, `Another ${what} already has that externalId`);
  throw err;
};
const extQuery = z.string().trim().max(120).optional();

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
    const q = pageQuery
      .extend({ status: z.enum(["active", "draft", "archived"]).optional(), q: z.string().trim().max(120).optional(), external_id: extQuery, handle: z.string().trim().max(200).optional(), sku: z.string().trim().max(120).optional() })
      .parse(request.query);
    const where = {
      storeId: request.store.id,
      ...(q.status && { status: q.status }),
      ...(q.external_id && { externalId: q.external_id }),
      ...(q.handle && { slug: q.handle }),
      ...(q.sku && { variants: { some: { sku: { equals: q.sku, mode: "insensitive" } } } }),
      // ?q= matches the title or any variant's SKU.
      ...(q.q && { OR: [{ title: { contains: q.q, mode: "insensitive" } }, { variants: { some: { sku: { contains: q.q, mode: "insensitive" } } } }] }),
      ...since(q),
    };
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

  // Imports: externalId makes it safe to run twice — a product that
  // already has it comes back unchanged (created: false). `category` by
  // name is found or made; image URLs are copied into the store's Files
  // unless copyImages is false. snake_case names work too.
  fastify.post("/products", scope("write_products"), async (request, reply) => {
    const { handle, category, copyImages = true, ...rest } = imports.productBody(request.body);
    const body = createProductSchema.parse(rest);
    const storeId = request.store.id;
    if (body.externalId) {
      const found = await db.product.findUnique({ where: { storeId_externalId: { storeId, externalId: body.externalId } }, include: webhooks.PRODUCT_INCLUDE });
      if (found) return reply.code(200).send({ data: serialize.product(found), created: false });
    }
    if (category && !body.categoryId) body.categoryId = await imports.categoryIdFor(db, storeId, category);
    let warnings = [];
    if (copyImages !== false && body.images.length) ({ images: body.images, warnings } = await imports.copyImages(db, storeId, body.images, env.API_PUBLIC_URL));
    const store = await db.store.findUnique({ where: { id: storeId }, include: { plan: true } });
    const created = await productsService.createProduct(db, store, body, { actorName: `API · ${request.apiKey.name}` }).catch((e) => clash(e, "product"));
    if (handle) await db.product.update({ where: { id: created.id }, data: { slug: await productsService.uniqueSlug(db, storeId, String(handle), created.id) } });
    const p = await db.product.findUnique({ where: { id: created.id }, include: webhooks.PRODUCT_INCLUDE });
    webhooks.emit(db, store.id, "product.created", { id: p.id });
    reply.code(201).send({ data: serialize.product(p), created: true, ...(warnings.length && { warnings }) });
  });

  fastify.patch("/products/:id", scope("write_products"), async (request) => {
    const { handle, category, copyImages = true, ...rest } = imports.productBody(request.body);
    const body = updateProductSchema.parse(rest);
    const storeId = request.store.id;
    if (category && !body.categoryId) body.categoryId = await imports.categoryIdFor(db, storeId, category);
    if (copyImages !== false && body.images?.length) body.images = (await imports.copyImages(db, storeId, body.images, env.API_PUBLIC_URL)).images;
    await productsService.updateProduct(db, storeId, request.params.id, body, { actorName: `API · ${request.apiKey.name}` }).catch((e) => clash(e, "product"));
    if (handle) await db.product.update({ where: { id: request.params.id }, data: { slug: await productsService.uniqueSlug(db, storeId, String(handle), request.params.id) } });
    const p = await db.product.findUnique({ where: { id: request.params.id }, include: webhooks.PRODUCT_INCLUDE });
    webhooks.emit(db, storeId, "product.updated", { id: p.id });
    return { data: serialize.product(p) };
  });

  // ── Categories & collections (the catalogue) ──
  fastify.get("/categories", scope("read_products"), async (request) => {
    const q = pageQuery.extend({ external_id: extQuery, name: z.string().trim().max(120).optional() }).parse(request.query);
    const where = { storeId: request.store.id, ...(q.external_id && { externalId: q.external_id }), ...(q.name && { title: { equals: q.name, mode: "insensitive" } }), ...since(q) };
    const [rows, total] = await Promise.all([
      db.category.findMany({ where, include: { _count: { select: { products: true } } }, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.limit, take: q.limit }),
      db.category.count({ where }),
    ]);
    return paged(rows.map(serialize.category), q, total);
  });

  fastify.post("/categories", scope("write_products"), async (request, reply) => {
    const { category, created, warnings } = await imports.upsertCategory(db, request.store.id, request.body, { apiBase: env.API_PUBLIC_URL });
    reply.code(created ? 201 : 200).send({ data: serialize.category(category), created, ...(warnings.length && { warnings }) });
  });

  fastify.get("/collections", scope("read_products"), async (request) => {
    const q = pageQuery.extend({ external_id: extQuery }).parse(request.query);
    const where = { storeId: request.store.id, ...(q.external_id && { externalId: q.external_id }), ...since(q) };
    const [rows, total] = await Promise.all([
      db.collection.findMany({ where, include: { products: { select: { productId: true }, orderBy: { position: "asc" } } }, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.limit, take: q.limit }),
      db.collection.count({ where }),
    ]);
    return paged(rows.map(serialize.collection), q, total);
  });

  fastify.post("/collections", scope("write_products"), async (request, reply) => {
    const { collection, created, warnings } = await imports.upsertCollection(db, request.store.id, request.body, { apiBase: env.API_PUBLIC_URL });
    const c = await db.collection.findUnique({ where: { id: collection.id }, include: { products: { select: { productId: true }, orderBy: { position: "asc" } } } });
    reply.code(created ? 201 : 200).send({ data: serialize.collection(c), created, ...(warnings.length && { warnings }) });
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
        external_id: extQuery,
      })
      .parse(request.query);
    const where = {
      storeId: request.store.id,
      ...(q.external_id && { externalId: q.external_id }),
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

  // A past order from another platform (e.g. Shopify), recorded as it was:
  // no payment, stock change, emails, WhatsApp, webhooks or commission.
  // Once per externalId.
  fastify.post("/orders/import", scope("import_orders"), async (request, reply) => {
    const { orderId, created, warnings } = await imports.importOrder(db, request.store, request.body);
    const o = await db.order.findUnique({ where: { id: orderId }, include: webhooks.ORDER_INCLUDE });
    reply.code(created ? 201 : 200).send({ data: serialize.order(o), created, ...(warnings.length && { warnings }) });
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
    const q = pageQuery.extend({ email: z.string().max(200).optional(), phone: z.string().max(30).optional(), external_id: extQuery }).parse(request.query);
    const e164 = q.phone ? toE164(q.phone) : null;
    if (q.phone && !e164) return paged([], q, 0);
    const where = {
      storeId: request.store.id,
      ...(q.email && { email: { equals: q.email, mode: "insensitive" } }),
      ...(q.external_id && { externalId: q.external_id }),
      ...(e164 && { phone: { endsWith: e164.slice(-10) } }),
      ...since(q),
    };
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

  // Create — or, when a customer already matches (externalId, then email,
  // then phone), fill in only what it's missing and return it.
  fastify.post("/customers", scope("write_customers"), async (request, reply) => {
    const { customer, created } = await imports.upsertCustomer(db, request.store.id, request.body);
    if (created) webhooks.emit(db, request.store.id, "customer.created", { id: customer.id });
    reply.code(created ? 201 : 200).send({ data: serialize.customer(customer), created });
  });

  fastify.patch("/customers/:id", scope("write_customers"), async (request) => ({ data: serialize.customer(await imports.updateCustomer(db, request.store.id, request.params.id, request.body)) }));

  // ── Discounts ──
  fastify.get("/discounts", scope("read_discounts"), async (request) => {
    const q = pageQuery.extend({ external_id: extQuery, code: z.string().trim().max(60).optional() }).parse(request.query);
    const where = { storeId: request.store.id, ...(q.external_id && { externalId: q.external_id }), ...(q.code && { code: { equals: q.code, mode: "insensitive" } }), ...since(q) };
    const [rows, total] = await Promise.all([db.discount.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.limit, take: q.limit }), db.discount.count({ where })]);
    return paged(rows.map(serialize.discount), q, total);
  });

  // By externalId, then code; else made with the admin's discount rules.
  // Imported codes stay off product pages unless showOnStore is true.
  fastify.post("/discounts", scope("write_discounts"), async (request, reply) => {
    const { discount, created } = await imports.upsertDiscount(db, request.store.id, request.body);
    reply.code(created ? 201 : 200).send({ data: serialize.discount(discount), created });
  });
}

module.exports = publicApiRoutes;

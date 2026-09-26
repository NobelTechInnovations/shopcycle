const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const { adjustStock, setStock } = require("../../lib/inventory");
const { storeSettings } = require("../../lib/store-settings");

/**
 * Products ▸ Inventory: every variant's stock, adjustments with a reason,
 * and the history behind each number (InventoryAdjustment).
 */

const listQuery = z.object({
  q: z.string().trim().max(120).optional(),
  filter: z.enum(["all", "low", "out"]).default("all"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

// Reasons staff can choose; "sold", "returned" and "order_cancelled" are
// written by orders themselves.
const MANUAL_REASONS = ["received", "correction", "damaged", "returned"];

const adjustSchema = z.object({
  variantId: z.string().min(1),
  mode: z.enum(["add", "set"]),
  // "add" takes a signed change (+12 received, −2 damaged); "set" an exact count.
  quantity: z.coerce.number().int().min(-100000).max(100000),
  reason: z.enum(MANUAL_REASONS),
  note: z.string().trim().max(200).optional().nullable(),
});

async function inventoryRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  fastify.addHook("preHandler", fastify.requireActiveSubscription);

  fastify.get("/", async (request, reply) => {
    const { q, filter, page, pageSize } = listQuery.parse(request.query);
    const threshold = storeSettings(request.store).lowStockThreshold;
    const where = {
      product: { storeId: request.store.id, status: { not: "archived" } },
      ...(q && {
        OR: [
          { product: { title: { contains: q, mode: "insensitive" } } },
          { title: { contains: q, mode: "insensitive" } },
          { sku: { contains: q, mode: "insensitive" } },
        ],
      }),
      ...(filter === "low" && { inventoryQuantity: { gt: 0, lte: threshold } }),
      ...(filter === "out" && { inventoryQuantity: { lte: 0 } }),
    };

    const [variants, total, low, out] = await Promise.all([
      fastify.prisma.productVariant.findMany({
        where,
        include: { product: { select: { id: true, title: true, status: true, images: { orderBy: { position: "asc" }, take: 1 } } } },
        orderBy: [{ inventoryQuantity: "asc" }, { updatedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      fastify.prisma.productVariant.count({ where }),
      fastify.prisma.productVariant.count({
        where: { product: { storeId: request.store.id, status: { not: "archived" } }, inventoryQuantity: { gt: 0, lte: threshold } },
      }),
      fastify.prisma.productVariant.count({
        where: { product: { storeId: request.store.id, status: { not: "archived" } }, inventoryQuantity: { lte: 0 } },
      }),
    ]);

    reply.send({
      variants: variants.map((v) => ({
        id: v.id,
        title: v.title,
        sku: v.sku,
        inventoryQuantity: v.inventoryQuantity,
        price: v.price,
        productId: v.product.id,
        productTitle: v.product.title,
        productStatus: v.product.status,
        image: v.product.images[0]?.url || null,
      })),
      total,
      counts: { low, out },
      threshold,
    });
  });

  fastify.post("/adjust", async (request, reply) => {
    const body = adjustSchema.parse(request.body);
    const actorName = request.authUser?.name || null;
    const storeId = request.store.id;
    const adjustment = await fastify.prisma.$transaction((tx) =>
      body.mode === "set"
        ? setStock(tx, { storeId, variantId: body.variantId, quantity: body.quantity, reason: body.reason, note: body.note, actorName })
        : adjustStock(tx, { storeId, variantId: body.variantId, delta: body.quantity, reason: body.reason, note: body.note, actorName })
    );
    if (!adjustment && body.mode === "add") {
      if (body.quantity === 0) throw new HttpError(400, "Enter how many units to add or remove.");
      throw new HttpError(404, "Variant not found");
    }
    const variant = await fastify.prisma.productVariant.findUnique({ where: { id: body.variantId }, select: { inventoryQuantity: true } });
    reply.send({ adjustment, inventoryQuantity: variant.inventoryQuantity });
  });

  fastify.get("/:variantId/history", async (request, reply) => {
    const variant = await fastify.prisma.productVariant.findFirst({
      where: { id: request.params.variantId, product: { storeId: request.store.id } },
      include: { product: { select: { title: true } } },
    });
    if (!variant) throw new HttpError(404, "Variant not found");
    const history = await fastify.prisma.inventoryAdjustment.findMany({
      where: { variantId: variant.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const orderIds = [...new Set(history.map((h) => h.orderId).filter(Boolean))];
    const orders = orderIds.length
      ? await fastify.prisma.order.findMany({ where: { id: { in: orderIds }, storeId: request.store.id }, select: { id: true, orderNumber: true } })
      : [];
    const numbers = Object.fromEntries(orders.map((o) => [o.id, o.orderNumber]));
    reply.send({
      variant: { id: variant.id, title: variant.title, sku: variant.sku, productTitle: variant.product.title, inventoryQuantity: variant.inventoryQuantity },
      history: history.map((h) => ({ ...h, orderNumber: h.orderId ? numbers[h.orderId] || null : null })),
    });
  });
}

module.exports = inventoryRoutes;

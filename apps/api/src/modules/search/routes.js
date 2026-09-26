const { z } = require("zod");

/**
 * The admin's search box (Cmd/Ctrl+K): one query across the store's
 * products (title or SKU), orders (number, email or name), customers,
 * collections, discounts, pages and blog posts. A handful of each —
 * it's for jumping to something, not browsing.
 */

const querySchema = z.object({ q: z.string().trim().max(80).default("") });
const has = (q) => ({ contains: q, mode: "insensitive" });

async function searchRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  fastify.addHook("preHandler", fastify.requireActiveSubscription);

  fastify.get("/", async (request) => {
    const { q } = querySchema.parse(request.query);
    if (!q) return { products: [], orders: [], customers: [], collections: [], discounts: [], pages: [], articles: [] };
    const storeId = request.store.id;
    const number = q.replace(/^#/, "");
    const byNumber = /^\d{1,9}$/.test(number) ? [{ orderNumber: Number(number) }] : [];
    const db = fastify.prisma;

    const [products, orders, customers, collections, discounts, pages, articles] = await Promise.all([
      db.product.findMany({
        where: { storeId, OR: [{ title: has(q) }, { variants: { some: { sku: has(q) } } }] },
        select: { id: true, title: true, status: true, images: { select: { url: true }, orderBy: { position: "asc" }, take: 1 } },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      db.order.findMany({
        where: { storeId, OR: [...byNumber, { email: has(q) }, { shippingName: has(q) }, { phone: has(q) }] },
        select: { id: true, orderNumber: true, total: true, currency: true, shippingName: true, email: true, paymentStatus: true, fulfillmentStatus: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      db.customer.findMany({
        where: { storeId, OR: [{ name: has(q) }, { email: has(q) }, { phone: has(q) }] },
        select: { id: true, name: true, email: true },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      db.collection.findMany({ where: { storeId, title: has(q) }, select: { id: true, title: true, status: true }, take: 4 }),
      db.discount.findMany({ where: { storeId, code: has(q) }, select: { id: true, code: true, status: true }, take: 4 }),
      db.page.findMany({ where: { storeId, title: has(q) }, select: { id: true, title: true, status: true }, take: 3 }),
      db.article.findMany({ where: { storeId, title: has(q) }, select: { id: true, title: true, status: true }, take: 3 }),
    ]);

    return {
      products: products.map((p) => ({ id: p.id, title: p.title, status: p.status, image: p.images[0]?.url || null })),
      orders: orders.map((o) => ({ ...o, total: Number(o.total) })),
      customers,
      collections,
      discounts,
      pages,
      articles,
    };
  });
}

module.exports = searchRoutes;

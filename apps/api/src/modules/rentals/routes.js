const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const appsService = require("../apps/service");
const service = require("./service");
const notify = require("./notify");

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const money = z.union([z.number(), z.string()]).transform((v) => (v === "" ? 0 : Number(v))).pipe(z.number().min(0).max(10000000));

const productConfigSchema = z.object({
  enabled: z.boolean().default(true),
  pricePerDay: money,
  tiers: z.array(z.object({ days: z.coerce.number().int().min(2).max(365), price: money })).max(6).default([]),
  minDays: z.coerce.number().int().min(1).max(365).default(1),
  maxDays: z.coerce.number().int().min(1).max(365).default(30),
  deposit: money.default(0),
  units: z.coerce.number().int().min(1).max(999).default(1),
  bufferDays: z.coerce.number().int().min(0).max(30).default(1),
  leadDays: z.coerce.number().int().min(0).max(60).default(1),
});

const settingsSchema = z.object({
  checkoutMode: z.enum(["cart", "request"]),
  handover: z.enum(["delivery", "store_pickup", "both"]),
  returns: z.enum(["collect", "drop_off", "both"]),
  pickupAddress: z.string().max(400).optional().default(""),
  depositCollection: z.enum(["checkout", "on_delivery"]),
  lateFeePerDay: money.default(0),
  bookingWindowDays: z.coerce.number().int().min(14).max(730).default(180),
  terms: z.string().max(2000).optional().default(""),
});

const manualSchema = z.object({
  kind: z.enum(["booking", "block"]).default("booking"),
  productId: z.string().min(1),
  variantId: z.string().optional().nullable(),
  start: day,
  end: day,
  quantity: z.coerce.number().int().min(1).max(99).default(1),
  customerName: z.string().max(120).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  handover: z.enum(["delivery", "store_pickup"]).optional(),
  returnMethod: z.enum(["collect", "drop_off"]).optional(),
  rentalTotal: z.union([z.number(), z.string()]).optional().nullable(),
  deposit: z.union([z.number(), z.string()]).optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
  force: z.boolean().optional(),
});

/**
 * /api/rentals — the Rentals app's own pages: the day's handovers and
 * returns, every booking, the calendar, each product's rental rules, and
 * the app's settings. Only for stores with the app installed.
 */
async function rentalRoutes(fastify) {
  const { prisma } = fastify;
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  fastify.addHook("preHandler", fastify.requireActiveSubscription);
  fastify.addHook("preHandler", async (request) => appsService.assertInstalled(prisma, request.store.id, service.APP_KEY));

  fastify.get("/overview", async (request) => service.overview(prisma, request.store.id));

  fastify.get("/settings", async (request) => ({ settings: (await service.installedSettings(prisma, request.store.id)) || service.settingsFor({}) }));

  fastify.put("/settings", async (request) => {
    const settings = service.settingsFor(settingsSchema.parse(request.body || {}));
    const install = await prisma.storeApp.findFirst({ where: { storeId: request.store.id, app: { key: service.APP_KEY } } });
    await prisma.storeApp.update({ where: { id: install.id }, data: { settings } });
    return { settings };
  });

  fastify.get("/products", async (request) => ({ products: await service.listProducts(prisma, request.store.id) }));

  fastify.get("/products/:productId", async (request) => ({
    rental: await service.getProductConfig(prisma, request.store.id, request.params.productId),
    settings: (await service.installedSettings(prisma, request.store.id)) || service.settingsFor({}),
  }));

  fastify.put("/products/:productId", async (request) => ({
    rental: await service.saveProductConfig(prisma, request.store.id, request.params.productId, productConfigSchema.parse(request.body || {})),
  }));

  fastify.delete("/products/:productId", async (request, reply) => {
    await service.removeProductConfig(prisma, request.store.id, request.params.productId);
    reply.code(204);
  });

  fastify.get("/bookings", async (request) => {
    const q = z
      .object({
        status: z.string().max(20).optional(),
        from: z.string().max(10).optional(),
        to: z.string().max(10).optional(),
        q: z.string().max(80).optional(),
        productId: z.string().max(40).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(request.query || {});
    return service.list(prisma, request.store.id, q);
  });

  fastify.get("/bookings/:id", async (request) => ({ booking: await service.getBooking(prisma, request.store.id, request.params.id) }));

  fastify.post("/bookings", async (request, reply) => {
    const booking = await service.createManual(prisma, request.store.id, manualSchema.parse(request.body || {}));
    reply.code(201);
    return { booking };
  });

  fastify.post("/bookings/:id/:action", async (request) => {
    const { action } = request.params;
    if (!["confirm", "out", "returned", "cancel", "deposit", "edit"].includes(action)) throw new HttpError(404, "Unknown action");
    const booking = await service.act(prisma, request.store.id, request.params.id, action, request.body || {});
    if (action === "confirm") await notify.requestConfirmed(prisma, request.store, booking, request.log).catch(() => {});
    return { booking };
  });

  fastify.get("/calendar", async (request) => service.calendar(prisma, request.store.id, String(request.query?.month || "")));
}

module.exports = rentalRoutes;

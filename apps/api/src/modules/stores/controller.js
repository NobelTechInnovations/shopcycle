const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");

const updateStoreSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  currency: z.string().min(3).max(3).optional(),
  timezone: z.string().optional(),
  // A bare host, e.g. "shop.example.com" — no scheme/path. Empty string
  // clears it (Prisma's @unique on a nullable column tolerates any number
  // of nulls, but not two rows sharing "" — so an empty string is coerced
  // to null here rather than passed straight through).
  domain: z
    .string()
    .regex(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i, "Enter a valid domain")
    .optional()
    .or(z.literal(""))
    .nullable(),
});

const switchPlanSchema = z.object({
  planId: z.string().min(1),
});

async function getStoreHandler(request, reply) {
  reply.send({ store: request.store, role: request.storeRole });
}

async function updateStoreHandler(request, reply) {
  const body = updateStoreSchema.parse(request.body);
  if ("domain" in body) body.domain = body.domain || null;

  try {
    const store = await request.server.prisma.store.update({
      where: { id: request.store.id },
      data: body,
    });
    reply.send({ store });
  } catch (err) {
    if (err.code === "P2002") throw new HttpError(409, "That domain is already in use by another store");
    throw err;
  }
}

async function listPlansHandler(request, reply) {
  const plans = await request.server.prisma.plan.findMany({ orderBy: { priceMonthly: "asc" } });
  reply.send({ plans });
}

async function switchPlanHandler(request, reply) {
  const { planId } = switchPlanSchema.parse(request.body);
  const plan = await request.server.prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new HttpError(404, "Plan not found");

  const productCount = await request.server.prisma.product.count({ where: { storeId: request.store.id } });
  if (productCount > plan.productLimit) {
    throw new HttpError(
      400,
      `This plan allows up to ${plan.productLimit} products — you currently have ${productCount}. Remove some products first.`
    );
  }
  const staffCount = await request.server.prisma.storeUser.count({ where: { storeId: request.store.id } });
  if (staffCount > plan.staffLimit) {
    throw new HttpError(
      400,
      `This plan allows up to ${plan.staffLimit} staff accounts — you currently have ${staffCount}. Remove some team members first.`
    );
  }

  const store = await request.server.prisma.store.update({
    where: { id: request.store.id },
    data: { planId },
    include: { plan: true },
  });
  reply.send({ store });
}

module.exports = { getStoreHandler, updateStoreHandler, listPlansHandler, switchPlanHandler };

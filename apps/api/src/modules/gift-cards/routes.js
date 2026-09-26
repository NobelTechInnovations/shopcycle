const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const { actorNameFrom } = require("../orders/events");
const service = require("./service");

/** Products ▸ Gift cards in the admin. Issuing a card or changing its
 * balance creates store credit, so staff can look but not change. */

const listQuery = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(["all", "active", "disabled"]).default("all"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

const expiresAt = z
  .string()
  .datetime({ offset: true })
  .refine((v) => new Date(v) > new Date(), "Pick an expiry date in the future")
  .optional()
  .nullable()
  .or(z.literal(""));

const issueSchema = z.object({
  amount: z.coerce.number().positive("Enter an amount").max(1_000_000, "That's more than a gift card can hold"),
  expiresAt,
  recipientName: z.string().trim().max(120).optional().nullable(),
  recipientEmail: z.string().trim().email("Enter a valid email").max(200).optional().nullable().or(z.literal("")),
  message: z.string().trim().max(500).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  sendEmail: z.boolean().default(false),
});

const updateSchema = z.object({
  status: z.enum(["active", "disabled"]).optional(),
  expiresAt: z.string().datetime({ offset: true }).optional().nullable().or(z.literal("")),
  adjustment: z.coerce.number().min(-1_000_000).max(1_000_000).optional(),
  note: z.string().trim().max(500).optional().nullable(),
});

function requireManager(request) {
  if (request.storeRole === "staff") throw new HttpError(403, "Only the store owner or an admin can issue or change gift cards.");
}

async function giftCardRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  fastify.addHook("preHandler", fastify.requireActiveSubscription);

  fastify.get("/", async (request) => service.list(fastify.prisma, request.store.id, listQuery.parse(request.query)));

  fastify.get("/:id", async (request) => ({ giftCard: await service.get(fastify.prisma, request.store.id, request.params.id) }));

  fastify.post("/", async (request, reply) => {
    requireManager(request);
    const body = issueSchema.parse(request.body);
    const result = await service.issue(fastify.prisma, request.store, body, { actorName: actorNameFrom(request), log: request.log });
    // The full code is in this response only — it's never stored or shown again.
    reply.header("cache-control", "no-store");
    reply.code(201).send(result);
  });

  fastify.patch("/:id", async (request) => {
    requireManager(request);
    const body = updateSchema.parse(request.body);
    return { giftCard: await service.update(fastify.prisma, request.store.id, request.params.id, body, { actorName: actorNameFrom(request) }) };
  });
}

module.exports = giftCardRoutes;

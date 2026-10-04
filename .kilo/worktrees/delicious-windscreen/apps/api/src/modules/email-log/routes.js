const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const { emailConfigured } = require("../../lib/mailer");

/**
 * The email log (EmailLog). Two views:
 *   /store     — a merchant's own store's emails (Settings ▸ Notifications)
 *   /platform  — every email, for the platform console
 * A message's full HTML is only kept when no email provider is configured
 * (local dev), so the "open" endpoints are how those emails get read.
 */

const listQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
  q: z.string().trim().max(200).optional(),
});

/** Emails whose content is a secret for the recipient alone. */
const PRIVATE_TEMPLATES = new Set(["sign_in_code", "gift_card"]);

const SUMMARY = {
  id: true,
  to: true,
  subject: true,
  template: true,
  status: true,
  provider: true,
  error: true,
  refType: true,
  refId: true,
  createdAt: true,
  storeId: true,
};

async function list(prisma, where, { page, pageSize, q }) {
  const filter = {
    ...where,
    ...(q && { OR: [{ to: { contains: q, mode: "insensitive" } }, { subject: { contains: q, mode: "insensitive" } }] }),
  };
  const [emails, total] = await Promise.all([
    prisma.emailLog.findMany({ where: filter, select: SUMMARY, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.emailLog.count({ where: filter }),
  ]);
  return { emails, total, page, pageSize, providerConfigured: emailConfigured() };
}

async function emailLogRoutes(fastify) {
  fastify.register(async (store) => {
    store.addHook("preHandler", fastify.authenticate);
    store.addHook("preHandler", fastify.loadStoreContext);

    store.get("/store", async (request, reply) => {
      reply.send(await list(fastify.prisma, { storeId: request.store.id }, listQuery.parse(request.query)));
    });

    store.get("/store/:id", async (request, reply) => {
      const email = await fastify.prisma.emailLog.findFirst({ where: { id: request.params.id, storeId: request.store.id } });
      if (!email) throw new HttpError(404, "Email not found");
      // A shopper's sign-in code would let staff sign in as them.
      if (PRIVATE_TEMPLATES.has(email.template)) email.html = null;
      reply.send({ email });
    });
  });

  fastify.register(async (platform) => {
    platform.addHook("preHandler", fastify.authenticateSuperAdmin);
    platform.addHook("preHandler", fastify.requireSuperAdmin);

    platform.get("/platform", async (request, reply) => {
      reply.send(await list(fastify.prisma, {}, listQuery.parse(request.query)));
    });

    platform.get("/platform/:id", async (request, reply) => {
      const email = await fastify.prisma.emailLog.findUnique({ where: { id: request.params.id } });
      if (!email) throw new HttpError(404, "Email not found");
      reply.send({ email });
    });
  });
}

module.exports = emailLogRoutes;

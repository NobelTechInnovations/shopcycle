const { z } = require("zod");
const service = require("./service");

/** Content ▸ Blog posts in the admin. */

const listQuery = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(["all", "draft", "published"]).default("all"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const articleSchema = z.object({
  title: z.string().trim().min(1, "Give the post a title").max(200),
  slug: z
    .string()
    .trim()
    .max(120)
    .regex(/^[a-z0-9-]*$/, "Use lowercase letters, numbers and dashes")
    .optional()
    .or(z.literal("")),
  excerpt: z.string().trim().max(500).optional().nullable(),
  body: z.string().max(200_000).optional().nullable(),
  image: z.string().trim().max(1000).optional().nullable(),
  imageAlt: z.string().trim().max(200).optional().nullable(),
  author: z.string().trim().max(120).optional().nullable(),
  tags: z.string().trim().max(500).optional().nullable(),
  status: z.enum(["draft", "published"]).default("draft"),
  publishedAt: z.string().datetime({ offset: true }).optional().nullable().or(z.literal("")),
  seoTitle: z.string().trim().max(200).optional().nullable(),
  seoDescription: z.string().trim().max(320).optional().nullable(),
});

async function blogRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  fastify.addHook("preHandler", fastify.requireActiveSubscription);

  fastify.get("/", async (request) => {
    const query = listQuery.parse(request.query);
    return service.listForAdmin(fastify.prisma, request.store.id, query);
  });

  fastify.get("/:id", async (request) => ({ article: await service.getForAdmin(fastify.prisma, request.store.id, request.params.id) }));

  fastify.post("/", async (request, reply) => {
    const body = articleSchema.parse(request.body);
    reply.code(201).send({ article: await service.createArticle(fastify.prisma, request.store.id, body) });
  });

  fastify.patch("/:id", async (request) => {
    const body = articleSchema.parse(request.body);
    return { article: await service.updateArticle(fastify.prisma, request.store.id, request.params.id, body) };
  });

  fastify.delete("/:id", async (request) => {
    await service.deleteArticle(fastify.prisma, request.store.id, request.params.id);
    return { ok: true };
  });
}

module.exports = blogRoutes;

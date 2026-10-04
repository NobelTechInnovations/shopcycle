const fp = require("fastify-plugin");
const { prisma } = require("@shopcycle/database");

/** Decorates the Fastify instance with a shared Prisma client. */
async function prismaPlugin(fastify) {
  fastify.decorate("prisma", prisma);
  fastify.addHook("onClose", async () => {
    await prisma.$disconnect();
  });
}

module.exports = fp(prismaPlugin, { name: "prisma" });

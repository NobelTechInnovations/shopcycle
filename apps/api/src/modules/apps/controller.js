const { installAppSchema } = require("@shopcycle/validation");
const service = require("./service");

async function listHandler(request, reply) {
  const apps = await service.listForStore(request.server.prisma, request.store.id);
  reply.send({ apps });
}

async function installHandler(request, reply) {
  const { settings } = installAppSchema.parse(request.body);
  const app = await service.installApp(request.server.prisma, request.store.id, request.params.key, settings);
  reply.send({ app });
}

async function uninstallHandler(request, reply) {
  await service.uninstallApp(request.server.prisma, request.store.id, request.params.key);
  reply.code(204).send();
}

module.exports = { listHandler, installHandler, uninstallHandler };

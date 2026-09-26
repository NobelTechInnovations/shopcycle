const service = require("./service");

async function overviewHandler(request, reply) {
  const data = await service.getOverview(request.server.prisma, request.store, request.currentUser);
  reply.send(data);
}

module.exports = { overviewHandler };

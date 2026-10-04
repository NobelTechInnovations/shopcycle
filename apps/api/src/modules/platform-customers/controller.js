const { HttpError } = require("@shopcycle/utils");
const service = require("./service");

async function searchHandler(request, reply) {
  const result = await service.search(request.server.prisma, {
    q: request.query.q,
    page: Number(request.query.page) || 1,
  });
  reply.send(result);
}

async function getHandler(request, reply) {
  const customer = await service.getById(request.server.prisma, request.params.id);
  if (!customer) throw new HttpError(404, "Not found");
  reply.send({ customer });
}

module.exports = { searchHandler, getHandler };

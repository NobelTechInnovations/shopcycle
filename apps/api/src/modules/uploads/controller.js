const { HttpError } = require("@shopcycle/utils");
const service = require("./service");

async function uploadHandler(request, reply) {
  const data = await request.file();
  if (!data) throw new HttpError(400, "No file provided");
  const buffer = await data.toBuffer();
  const file = await service.saveUpload(request.server.prisma, request.store.id, {
    filename: data.filename,
    mimetype: data.mimetype,
    buffer,
  });
  reply.code(201).send({ file });
}

async function listHandler(request, reply) {
  const page = Number(request.query.page) || 1;
  const pageSize = Math.min(Number(request.query.pageSize) || 40, 100);
  const [files, total] = await service.listFiles(request.server.prisma, request.store.id, { page, pageSize });
  reply.send({ files, total, page, pageSize });
}

async function deleteHandler(request, reply) {
  await service.deleteFile(request.server.prisma, request.store.id, request.params.id);
  reply.code(204).send();
}

module.exports = { uploadHandler, listHandler, deleteHandler };

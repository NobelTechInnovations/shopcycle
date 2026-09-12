const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const service = require("./service");

const sendSchema = z
  .object({
    customerId: z.string().optional(),
    toPhone: z.string().min(6),
    kind: z.enum(["template", "text"]),
    templateName: z.string().optional(),
    templateLanguage: z.string().optional(),
    body: z.string().max(4096).optional(),
  })
  .refine((v) => v.kind !== "template" || v.templateName, { message: "templateName is required for a template message" })
  .refine((v) => v.kind !== "text" || v.body, { message: "body is required for a text message" });

async function sendHandler(request, reply) {
  const input = sendSchema.parse(request.body);
  if (input.customerId) {
    const customer = await request.server.prisma.customer.findFirst({
      where: { id: input.customerId, storeId: request.store.id },
    });
    if (!customer) throw new HttpError(404, "Customer not found");
  }
  const message = await service.sendMessage(request.server.prisma, request.store, input);
  reply.code(201).send({ message });
}

async function templatesHandler(request, reply) {
  const templates = await service.listTemplates(request.server.prisma, request.store);
  reply.send({ templates });
}

async function listHandler(request, reply) {
  const messages = await service.listMessages(request.server.prisma, request.store.id, {
    customerId: request.query.customerId,
    page: Number(request.query.page) || 1,
  });
  reply.send({ messages });
}

module.exports = { sendHandler, templatesHandler, listHandler };

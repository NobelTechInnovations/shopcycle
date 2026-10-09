const controller = require("./controller");

async function themeRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  fastify.addHook("preHandler", fastify.requireActiveSubscription);

  fastify.get("/", controller.listHandler);
  fastify.get("/templates", controller.templatesHandler);
  // Which products / pages / collections use a template.
  fastify.post("/templates/assign", controller.assignTemplateHandler);
  fastify.post("/install", controller.installHandler);
  fastify.get("/:id", controller.getHandler);
  fastify.post("/:id/activate", controller.activateHandler);
  fastify.post("/:id/duplicate", controller.duplicateHandler);
  fastify.delete("/:id", controller.deleteHandler);
  fastify.patch("/:id/settings", controller.updateSettingsHandler);
  // Editing theme code is part of Growth and Pro ("theme_advanced"). The
  // visual editor saves only JSON (templates, settings), which every plan
  // can do.
  const codeGate = fastify.requirePlanFeature("theme_advanced");
  const codeUnlessJson = {
    preHandler: async (request, reply) => {
      if (/\.json$/i.test(String(request.body?.path || ""))) return;
      return codeGate(request, reply);
    },
  };
  // A paid Oyklane Store theme's code is protected (its JSON — layouts
  // and settings — is the seller's to change).
  const unlocked = (jsonOk) => async (request, reply) => {
    const theme = await request.server.prisma.theme.findFirst({ where: { id: request.params.id, storeId: request.store.id }, select: { locked: true } });
    if (!theme?.locked) return;
    if (jsonOk && /\.json$/i.test(String(request.body?.path || ""))) return;
    return reply.code(403).send({ error: "This theme is from the Oyklane Store and its code is protected. You can still change everything in Customize." });
  };
  fastify.patch("/:id/files", { preHandler: [unlocked(true), codeUnlessJson.preHandler] }, controller.upsertFileHandler);
  fastify.post("/:id/files", { preHandler: [unlocked(false), codeGate] }, controller.createFileHandler);
  fastify.delete("/:id/files/:fileId", { preHandler: [unlocked(false), codeGate] }, controller.deleteFileHandler);
  fastify.patch("/:id/files/:fileId/rename", { preHandler: [unlocked(false), codeGate] }, controller.renameFileHandler);
  fastify.get("/:id/files/:fileId/revisions", { preHandler: unlocked(false) }, controller.listRevisionsHandler);
  fastify.post("/:id/files/:fileId/revisions/:revisionId/restore", { preHandler: [unlocked(false), codeGate] }, controller.restoreRevisionHandler);
  fastify.post("/:id/render-draft", controller.renderDraftHandler);
  // Extra templates (product.rental) are JSON layouts — every plan.
  fastify.post("/:id/templates", controller.createTemplateHandler);
  fastify.delete("/:id/templates/:name", controller.deleteTemplateHandler);
}

module.exports = themeRoutes;

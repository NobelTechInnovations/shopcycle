const controller = require("./controller");

async function themeRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  fastify.addHook("preHandler", fastify.requireActiveSubscription);

  fastify.get("/", controller.listHandler);
  fastify.get("/templates", controller.templatesHandler);
  fastify.post("/install", controller.installHandler);
  fastify.get("/:id", controller.getHandler);
  fastify.post("/:id/activate", controller.activateHandler);
  fastify.delete("/:id", controller.deleteHandler);
  fastify.patch("/:id/settings", controller.updateSettingsHandler);
  // Editing theme code is part of Growth and Pro ("theme_advanced"). The
  // visual editor saves only JSON (templates, settings), which every plan
  // can do.
  const codeGate = fastify.requirePlanFeature("theme_advanced");
  const codeOnly = { preHandler: codeGate };
  const codeUnlessJson = {
    preHandler: async (request, reply) => {
      if (/\.json$/i.test(String(request.body?.path || ""))) return;
      return codeGate(request, reply);
    },
  };
  fastify.patch("/:id/files", codeUnlessJson, controller.upsertFileHandler);
  fastify.post("/:id/files", codeOnly, controller.createFileHandler);
  fastify.delete("/:id/files/:fileId", codeOnly, controller.deleteFileHandler);
  fastify.patch("/:id/files/:fileId/rename", codeOnly, controller.renameFileHandler);
  fastify.get("/:id/files/:fileId/revisions", controller.listRevisionsHandler);
  fastify.post("/:id/files/:fileId/revisions/:revisionId/restore", codeOnly, controller.restoreRevisionHandler);
  fastify.post("/:id/render-draft", controller.renderDraftHandler);
  // Extra templates (product.rental) are JSON layouts — every plan.
  fastify.post("/:id/templates", controller.createTemplateHandler);
  fastify.delete("/:id/templates/:name", controller.deleteTemplateHandler);
}

module.exports = themeRoutes;

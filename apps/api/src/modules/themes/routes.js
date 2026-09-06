const controller = require("./controller");

async function themeRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);

  fastify.get("/", controller.listHandler);
  fastify.post("/install", controller.installHandler);
  fastify.get("/:id", controller.getHandler);
  fastify.post("/:id/activate", controller.activateHandler);
  fastify.patch("/:id/settings", controller.updateSettingsHandler);
  fastify.patch("/:id/files", controller.upsertFileHandler);
  fastify.post("/:id/files", controller.createFileHandler);
  fastify.delete("/:id/files/:fileId", controller.deleteFileHandler);
  fastify.patch("/:id/files/:fileId/rename", controller.renameFileHandler);
  fastify.get("/:id/files/:fileId/revisions", controller.listRevisionsHandler);
  fastify.post("/:id/files/:fileId/revisions/:revisionId/restore", controller.restoreRevisionHandler);
  fastify.post("/:id/render-draft", controller.renderDraftHandler);
}

module.exports = themeRoutes;

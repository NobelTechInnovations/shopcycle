const controller = require("./controller");

async function teamRoutes(fastify) {
  // Accepting an invite happens before the person has a session.
  fastify.post("/accept-invite", controller.acceptInvitationHandler);

  fastify.register(async function authed(scoped) {
    scoped.addHook("preHandler", fastify.authenticate);
    scoped.addHook("preHandler", fastify.loadStoreContext);
    scoped.addHook("preHandler", fastify.requireActiveSubscription);

    scoped.get("/", controller.listHandler);
    scoped.post("/invite", controller.inviteHandler);
    scoped.patch("/:id", controller.updateRoleHandler);
    scoped.delete("/:id", controller.removeHandler);
    scoped.delete("/invitations/:id", controller.cancelInvitationHandler);
  });
}

module.exports = teamRoutes;

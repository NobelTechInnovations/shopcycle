const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const service = require("./service");
const partners = require("./partners");
const storeSide = require("./store");

/** /api/market/public — what oyklanestore.com shows to anyone. */
async function publicRoutes(fastify) {
  const db = fastify.prisma;
  fastify.get("/browse", async (request) => service.browse(db, request.query));
  fastify.get("/:kind/:slug", async (request) => service.detail(db, request.params.kind, request.params.slug));
}

/** /api/market/media/:id — listing icons and screenshots. */
async function mediaRoutes(fastify) {
  fastify.get("/:id", async (request, reply) => {
    const row = await service.media(fastify.prisma, request.params.id);
    reply.header("content-type", row.mimeType).header("cache-control", "public, max-age=31536000, immutable").header("x-content-type-options", "nosniff");
    return reply.send(Buffer.from(row.data));
  });
}

/** /api/partners — developer accounts (Bearer token from the Oyklane Store's server). */
async function partnerRoutes(fastify) {
  const db = fastify.prisma;
  const strict = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };
  fastify.post("/register", strict, async (request, reply) => reply.code(201).send(await partners.register(fastify, request.body)));
  fastify.post("/login", strict, async (request) => partners.login(fastify, request.body));

  fastify.register(async (signedIn) => {
    signedIn.addHook("preHandler", partners.authenticatePartner(fastify));
    signedIn.get("/me", async (request) => ({ partner: partners.publicPartner(request.partner) }));
    signedIn.patch("/me", async (request) => ({ partner: await partners.updateProfile(db, request.partner, request.body) }));
    signedIn.post("/sign-out-everywhere", async (request) => {
      await partners.signOutEverywhere(db, request.partner);
      return { ok: true };
    });
    signedIn.get("/overview", async (request) => {
      await storeSide.syncAppEarnings(db).catch(() => 0);
      return service.partnerOverview(db, request.partner);
    });
    signedIn.post("/listings", async (request, reply) => reply.code(201).send({ listing: await service.createListing(db, request.partner, request.body) }));
    signedIn.patch("/listings/:id", async (request) => ({ listing: await service.updateListing(db, request.partner, request.params.id, request.body) }));
    signedIn.get("/listings/:id/versions", async (request) => service.listVersions(db, request.partner, request.params.id));
    signedIn.post("/listings/:id/versions", async (request, reply) => {
      let fields = request.body || {};
      let zip = null;
      if (request.isMultipart()) {
        const file = await request.file();
        if (!file) throw new HttpError(400, "Upload the theme as a .zip file.");
        zip = await file.toBuffer();
        fields = Object.fromEntries(Object.entries(file.fields || {}).filter(([, v]) => v && v.type === "field").map(([k, v]) => [k, v.value]));
      }
      reply.code(201).send({ version: await service.addVersion(db, request.partner, request.params.id, { fields, zip }) });
    });
    signedIn.post("/listings/:id/submit", async (request) => service.submit(db, request.partner, request.params.id));
    signedIn.get("/listings/:id/secret", async (request) => service.appSecret(db, request.partner, request.params.id));
    signedIn.post("/listings/:id/secret", async (request) => service.appSecret(db, request.partner, request.params.id, { rotate: true }));
    signedIn.post("/media", async (request) => {
      const file = await request.file();
      if (!file) throw new HttpError(400, "Choose an image.");
      return service.uploadMedia(db, request.partner, await file.toBuffer());
    });
  });
}

/** /api/market/store — the seller's admin: buy and install. */
async function storeRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  const db = fastify.prisma;
  const ctx = (request) => ({ role: request.storeRole, user: request.currentUser || request.authUser });

  fastify.get("/purchases", async (request) => ({ purchases: await storeSide.purchases(db, request.store) }));
  fastify.get("/apps/:key/open", async (request) => ({ url: await storeSide.openAppUrl(db, request.store, request.params.key) }));
  fastify.post("/themes/:slug/buy", async (request) => storeSide.buy(db, request.store, request.params.slug, ctx(request)));
  fastify.post("/verify", async (request) => {
    const body = z.object({ orderId: z.string().min(1), paymentId: z.string().min(1), signature: z.string().min(1) }).parse(request.body || {});
    return storeSide.verify(db, request.store, body);
  });
  fastify.post("/themes/:slug/install", { preHandler: fastify.requireActiveSubscription }, async (request) => storeSide.installTheme(db, request.store, request.params.slug, ctx(request)));
  fastify.get("/:kind/:slug", async (request) => storeSide.forStore(db, request.store, request.params.kind, request.params.slug));
}

/** /api/super-admin/market — review, developers, payouts (super-admin hooks and audit apply). */
async function adminRoutes(fastify) {
  const db = fastify.prisma;
  fastify.get("/", async () => {
    await storeSide.syncAppEarnings(db).catch(() => 0);
    return service.reviewQueue(db);
  });
  fastify.post("/versions/:id/decide", async (request) => {
    const body = z.object({ approve: z.boolean(), note: z.string().trim().max(2000).optional() }).parse(request.body || {});
    return service.decide(db, request.params.id, body);
  });
  fastify.post("/listings/:id/status", async (request) => service.setListingStatus(db, request.params.id, z.object({ status: z.string() }).parse(request.body || {}).status));
  fastify.post("/partners/:id/payout", async (request) => service.recordPayout(db, request.params.id, z.object({ reference: z.string().trim().max(120).optional() }).parse(request.body || {})));
  fastify.post("/partners/:id/status", async (request) => {
    const { status } = z.object({ status: z.enum(["active", "suspended"]) }).parse(request.body || {});
    await db.partner.update({ where: { id: request.params.id }, data: { status, tokenVersion: { increment: 1 } } });
    return { ok: true };
  });
}

module.exports = { publicRoutes, mediaRoutes, partnerRoutes, storeRoutes, adminRoutes };

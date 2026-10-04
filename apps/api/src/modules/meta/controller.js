const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const metaService = require("./service");
const repository = require("./repository");
const facebookAccount = require("../accounts/facebook");

/** Never send the raw access token to the browser — everything else about
 * the connection (who it's connected as, what's selected) is fine to show. */
function serializeConnection(connection) {
  if (!connection) return null;
  const { accessToken, ...rest } = connection;
  return rest;
}

async function statusHandler(request, reply) {
  const connection = await repository.findByStore(request.server.prisma, request.store.id);
  reply.send({ configured: metaService.metaConfigured(), connection: serializeConnection(connection) });
}

// The store's one Facebook login (accounts/facebook.js) — the same one the
// Instagram feed, the catalog and the pixel use.
async function authorizeUrlHandler(request, reply) {
  reply.send({ url: facebookAccount.authorizeUrl() });
}

const exchangeSchema = z.object({ code: z.string().min(1) });

async function exchangeHandler(request, reply) {
  const { code } = exchangeSchema.parse(request.body);
  await facebookAccount.connect(request.server.prisma, request.store.id, code);
  const connection = await repository.findByStore(request.server.prisma, request.store.id);
  reply.send({ connection: serializeConnection(connection) });
}

async function assetsHandler(request, reply) {
  const connection = await repository.findByStore(request.server.prisma, request.store.id);
  if (!connection) throw new HttpError(400, "Connect Facebook first.");
  const assets = await metaService.listConnectableAssets(connection.accessToken);
  reply.send(assets);
}

const selectSchema = z.object({
  adAccountId: z.string().optional(),
  adAccountName: z.string().optional(),
  pageId: z.string().optional(),
  pageName: z.string().optional(),
  wabaId: z.string().optional(),
  wabaName: z.string().optional(),
  phoneNumberId: z.string().optional(),
  phoneNumberLabel: z.string().optional(),
});

async function selectAssetsHandler(request, reply) {
  const body = selectSchema.parse(request.body);
  const existing = await repository.findByStore(request.server.prisma, request.store.id);
  if (!existing) throw new HttpError(400, "Connect Facebook first.");
  const connection = await repository.upsert(request.server.prisma, request.store.id, body);
  reply.send({ connection: serializeConnection(connection) });
}

async function disconnectHandler(request, reply) {
  await repository.remove(request.server.prisma, request.store.id);
  reply.code(204).send();
}

module.exports = {
  statusHandler,
  authorizeUrlHandler,
  exchangeHandler,
  assetsHandler,
  selectAssetsHandler,
  disconnectHandler,
};

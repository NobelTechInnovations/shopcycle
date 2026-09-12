const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const metaService = require("./service");
const repository = require("./repository");

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

async function authorizeUrlHandler(request, reply) {
  if (!metaService.metaConfigured()) {
    throw new HttpError(400, "Meta isn't configured on this platform yet — ask the platform admin to set it up.");
  }
  reply.send({ url: metaService.buildAuthorizeUrl() });
}

const exchangeSchema = z.object({ code: z.string().min(1) });

async function exchangeHandler(request, reply) {
  const { code } = exchangeSchema.parse(request.body);
  const { accessToken, expiresAt } = await metaService.exchangeCodeForLongLivedToken(code);
  const profile = await metaService.fetchProfile(accessToken);

  const connection = await repository.upsert(request.server.prisma, request.store.id, {
    accessToken,
    tokenExpiresAt: expiresAt,
    facebookUserId: profile.id,
    facebookUserName: profile.name,
  });
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

const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const metaService = require("./service");
const repository = require("./repository");
const facebookAccount = require("../accounts/facebook");

/** Never send the raw access token to the browser — everything else about
 * the connection (who it's connected as, what's selected) is fine to show. */
function serializeConnection(connection) {
  if (!connection) return null;
  const { accessToken, waAccessToken, ...rest } = connection;
  return { ...rest, whatsappSignup: Boolean(waAccessToken) };
}

const platformWhatsapp = () => require("../whatsapp/platform");

async function statusHandler(request, reply) {
  const connection = await repository.findByStore(request.server.prisma, request.store.id);
  const out = serializeConnection(connection);
  // A store that picked Oyklane's shared number has to pick its own.
  if (out) out.platformNumber = await platformWhatsapp().isPlatformAccount(request.server.prisma, connection);
  reply.send({ configured: metaService.metaConfigured(), connection: out });
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
  // Oyklane's own WhatsApp account shows up for Oyklane's admins — it's
  // shared by every store, so it can't be picked as a store's own.
  for (const w of assets.wabas || []) w.platform = await platformWhatsapp().isPlatformAccount(request.server.prisma, { wabaId: w.id });
  reply.send(assets);
}

const selectSchema = z.object({
  adAccountId: z.string().optional(),
  adAccountName: z.string().optional(),
  pageId: z.string().optional(),
  pageName: z.string().optional(),
  instagramAccountId: z.string().nullable().optional(),
  instagramUsername: z.string().nullable().optional(),
  wabaId: z.string().optional(),
  wabaName: z.string().optional(),
  phoneNumberId: z.string().optional(),
  phoneNumberLabel: z.string().optional(),
});

async function selectAssetsHandler(request, reply) {
  const body = selectSchema.parse(request.body);
  const existing = await repository.findByStore(request.server.prisma, request.store.id);
  if (!existing) throw new HttpError(400, "Connect Facebook first.");
  if (await platformWhatsapp().isPlatformAccount(request.server.prisma, body)) {
    throw new HttpError(400, "That's Oyklane's shared WhatsApp number — every store already sends order updates and sign-in codes from it. Pick your own WhatsApp number.");
  }
  const connection = await repository.update(request.server.prisma, request.store.id, body);
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

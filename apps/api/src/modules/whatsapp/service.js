const { HttpError } = require("@shopcycle/utils");
const metaService = require("../meta/service");
const metaRepository = require("../meta/repository");
const { normalizePhone } = require("../../lib/phone");

async function getReadyConnection(prisma, storeId) {
  const connection = await metaRepository.findByStore(prisma, storeId);
  if (!connection) throw new HttpError(400, "Connect Facebook first (Apps ▸ WhatsApp ▸ Connect).");
  if (!connection.phoneNumberId) {
    throw new HttpError(400, "Select a WhatsApp number first (Apps ▸ WhatsApp ▸ Connect).");
  }
  return connection;
}

/** `kind: "template"` opens a fresh 24-hour customer-service window using
 * a template Meta has already approved for this WABA (required — Meta
 * rejects free-form text to a customer who hasn't messaged in the last 24h).
 * `kind: "text"` only works inside a window one of those already opened
 * (or the customer messaged first) — both are real, distinct Graph API
 * message payload shapes, not something this platform can paper over. */
async function sendMessage(prisma, store, { customerId, toPhone, kind, templateName, templateLanguage, body }) {
  const connection = await getReadyConnection(prisma, store.id);
  const to = normalizePhone(toPhone);

  const payload =
    kind === "template"
      ? {
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: { name: templateName, language: { code: templateLanguage || "en_US" } },
        }
      : { messaging_product: "whatsapp", to, type: "text", text: { body } };

  const result = await metaService.graphRequest(`/${connection.phoneNumberId}/messages`, {
    method: "POST",
    token: connection.accessToken,
    body: payload,
  });

  return prisma.whatsappMessage.create({
    data: {
      storeId: store.id,
      customerId: customerId || null,
      toPhone: to,
      direction: "outbound",
      kind,
      body: kind === "template" ? `[template: ${templateName}]` : body,
      providerMessageId: result.messages?.[0]?.id || null,
    },
  });
}

/** Meta-approved templates for the connected WABA — a merchant can only
 * send `kind: "template"` messages using one of these (see sendMessage's
 * doc comment); this platform doesn't create or submit new templates for
 * review, only lists what's already approved in Meta Business Manager. */
async function listTemplates(prisma, store) {
  const connection = await getReadyConnection(prisma, store.id);
  if (!connection.wabaId) return [];
  const result = await metaService.graphRequest(`/${connection.wabaId}/message_templates`, {
    token: connection.accessToken,
    params: { fields: "name,language,status,category", limit: 50 },
  });
  return (result.data || []).filter((t) => t.status === "APPROVED");
}

function listMessages(prisma, storeId, { customerId, page = 1, pageSize = 50 } = {}) {
  return prisma.whatsappMessage.findMany({
    where: { storeId, ...(customerId ? { customerId } : {}) },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
}

module.exports = { sendMessage, listTemplates, listMessages, getReadyConnection };

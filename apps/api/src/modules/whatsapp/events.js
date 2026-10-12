const ai = require("../../lib/ai");
const service = require("./service");
const { STOP_WORDS } = require("./inbound");

/**
 * What happens after a customer's WhatsApp message is stored: the store's
 * inbox rules (who it's assigned to) and, when the seller turned it on,
 * the AI assistant — which answers only from the store's own facts and
 * hands the conversation to a person when it can't (or is asked to).
 *
 * Settings live in Store.settings.whatsapp:
 *   { autoAssign: "none" | "round_robin" | <userId>,
 *     ai: { enabled: boolean, instructions: string } }
 */

const AI_DAILY_LIMIT = 12;
const HANDOFF_LABEL = "Needs a person";

function inboxSettings(store) {
  const w = store?.settings?.whatsapp || {};
  return {
    autoAssign: w.autoAssign || "none",
    ai: { enabled: Boolean(w.ai?.enabled), instructions: String(w.ai?.instructions || "").slice(0, 2000) },
  };
}

/** Picks the teammate for a new conversation. */
async function assignee(prisma, store, rule) {
  if (!rule || rule === "none") return null;
  const team = await prisma.storeUser.findMany({ where: { storeId: store.id }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } });
  if (!team.length) return null;
  if (rule !== "round_robin") return team.find((m) => m.userId === rule)?.user || null;
  // Round robin: whoever has the fewest open conversations.
  const counts = await prisma.whatsappConversation.groupBy({ by: ["assignedToId"], where: { storeId: store.id, status: "open", assignedToId: { in: team.map((m) => m.userId) } }, _count: true });
  const load = Object.fromEntries(counts.map((c) => [c.assignedToId, c._count]));
  return team.map((m) => m.user).sort((a, b) => (load[a.id] || 0) - (load[b.id] || 0))[0];
}

async function aiAnswer(prisma, store, conversation, settings, log) {
  const today = new Date(Date.now() - 24 * 3600 * 1000);
  const recentAi = await prisma.whatsappMessage.count({ where: { conversationId: conversation.id, source: "ai", createdAt: { gte: today } } });
  if (recentAi >= AI_DAILY_LIMIT) return handOff(prisma, conversation, "The AI assistant reached its daily reply limit for this customer.");
  let draft;
  try {
    draft = await service.suggestReply(prisma, store, conversation.id, { instructions: settings.ai.instructions });
  } catch (err) {
    log?.warn({ err }, "whatsapp ai: couldn't draft");
    return handOff(prisma, conversation, "The AI assistant couldn't answer.");
  }
  if (draft.handoff || !draft.windowOpen) return handOff(prisma, conversation, draft.reason || "The customer needs a person.", draft.reply);
  await service.deliver(prisma, store, {
    phone: conversation.phone,
    payload: { type: "text", text: { body: draft.reply } },
    record: { kind: "text", messageType: "text", body: draft.reply, source: "ai", sentByName: "AI assistant" },
  });
}

/** Passes the conversation to the team: AI off for it, labelled, and (if
 * the AI wrote one) a holding reply telling the customer a person will answer. */
async function handOff(prisma, conversation, reason, holdingReply) {
  const labels = [...new Set([...(conversation.labels || []), HANDOFF_LABEL])];
  await prisma.whatsappConversation.update({ where: { id: conversation.id }, data: { handledBy: "human", labels, status: "open" } });
  await prisma.whatsappNote.create({ data: { conversationId: conversation.id, storeId: conversation.storeId, authorName: "AI assistant", body: `Handed to the team: ${reason}${holdingReply ? `\n\nSuggested reply: ${holdingReply}` : ""}` } });
}

/** The webhook's after-receive hook. */
function onReceived(fastify) {
  return async ({ storeId, conversation, message, log }) => {
    const prisma = fastify.prisma;
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) return;
    const settings = inboxSettings(store);
    let convo = await prisma.whatsappConversation.findUnique({ where: { id: conversation.id } });

    // A new conversation: assign it and decide who answers it.
    const firstMessage = (await prisma.whatsappMessage.count({ where: { conversationId: convo.id } })) <= 1;
    if (firstMessage) {
      const person = convo.assignedToId ? null : await assignee(prisma, store, settings.autoAssign);
      convo = await prisma.whatsappConversation.update({
        where: { id: convo.id },
        data: { ...(person ? { assignedToId: person.id, assignedToName: person.name || person.email } : {}), handledBy: settings.ai.enabled && ai.aiConfigured() ? "ai" : "human" },
      });
    }
    // STOP / START replies are handled by the webhook itself — never answered by the AI.
    if (message.messageType === "text" && (STOP_WORDS.test(message.body) || /^\s*(start|subscribe)\s*$/i.test(message.body))) return;
    if (settings.ai.enabled && ai.aiConfigured() && convo.handledBy === "ai") {
      await aiAnswer(prisma, store, convo, settings, log);
    }
  };
}

module.exports = { onReceived, inboxSettings, HANDOFF_LABEL };

const { HttpError } = require("@shopcycle/utils");
const ai = require("../../lib/ai");
const { storefrontUrl } = require("../../lib/storefront-url");
const { PLACED } = require("../orders/placed");
const articles = require("./articles");
const { getSupportSettings, modelFor } = require("./settings");

/**
 * The Help assistant. A seller's question is answered from the help
 * articles that match it plus a few plain facts about their store (plan,
 * installed apps, connected payments, domain), so "why can't customers pay
 * online?" gets "you haven't connected a gateway yet — Settings ▸
 * Payments", not a generic essay. When the assistant can't help, the
 * seller opens a ticket with the conversation attached.
 *
 * Without an AI key (NVIDIA_API_KEY or ANTHROPIC_API_KEY — lib/ai.js), or
 * with the assistant switched off, the
 * seller gets the best-matching articles instead.
 */

const MAX_TURNS = 12;
const MAX_ARTICLE_CHARS = 3500;

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

async function storeFacts(prisma, store) {
  const [sub, apps, providers, products, orders, plans] = await Promise.all([
    prisma.subscription.findUnique({ where: { storeId: store.id }, include: { plan: true } }),
    prisma.storeApp.findMany({ where: { storeId: store.id }, include: { app: { select: { name: true } } } }),
    prisma.paymentProvider.findMany({ where: { storeId: store.id }, select: { provider: true, enabled: true, testMode: true } }),
    prisma.product.count({ where: { storeId: store.id } }),
    prisma.order.count({ where: { storeId: store.id, ...PLACED } }),
    prisma.plan.findMany({ where: { isActive: true, key: { not: null } }, orderBy: { sortOrder: "asc" }, select: { name: true, priceMonthly: true, commissionPercent: true, staffLimit: true } }),
  ]);
  const day = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null);
  const lines = [
    `Store name: ${store.name}`,
    `Store address: ${storefrontUrl(store, "/")}${store.domain ? ` (own domain ${store.domain}${store.domainVerifiedAt ? ", live" : ", not live yet — DNS pending"})` : " (no own domain connected)"}`,
    `Plan: ${sub?.plan?.name || "none chosen"}${sub ? ` — status ${sub.status}${sub.trialEndsAt && sub.status === "trialing" ? `, trial ends ${day(sub.trialEndsAt)}` : ""}${sub.nextBillingAt ? `, next bill ${day(sub.nextBillingAt)}` : ""}` : ""}`,
    `Installed apps: ${apps.map((a) => a.app.name).join(", ") || "none"}`,
    `Online payment gateways: ${
      providers.length ? providers.map((p) => `${p.provider} (${p.enabled ? "on" : "off"}${p.testMode ? ", test mode" : ", live"})`).join(", ") : "none connected"
    }`,
    `Products: ${products}. Orders so far: ${orders}.`,
  ];
  const planLines = plans.map((p) => `${p.name}: ${inr(p.priceMonthly)}/month + GST, ${Number(p.commissionPercent)}% fee per paid order, up to ${p.staffLimit} staff`);
  return { store: lines.join("\n"), plans: planLines.join("\n") };
}

function systemPrompt({ facts, found, settings }) {
  const docs = found
    .map((a) => `<article title="${a.title.replace(/"/g, "'")}" link="/admin/support/articles/${a.slug}">\n${a.body.slice(0, MAX_ARTICLE_CHARS)}\n</article>`)
    .join("\n");
  return [
    "You are the Help assistant inside the seller dashboard of Oyklane, an ecommerce platform for Indian brands (storefronts, themes, payments, GST invoices, apps). You're talking with a store's owner or staff.",
    "",
    "How to answer:",
    "- Answer from the help articles and the facts about this seller's store below. Be specific: name the exact place in the dashboard (e.g. **Settings ▸ Payments**) and give numbered steps when there are steps. Use the store facts when they explain the problem (e.g. no gateway connected, domain not live yet, trial ending).",
    "- Keep it short and warm: a sentence or two, then steps if needed. Plain words. Reply in the language the seller uses (Hindi or Hinglish too).",
    "- Format: short paragraphs, '- ' bullets or '1.' numbered steps, **bold** for buttons and menu names. You may link dashboard pages as [text](/admin/...) and articles by their link. No headings, tables or code blocks.",
    "- If the articles and facts don't cover it, or it needs a person at Oyklane — a bug, something broken, a billing dispute, an account or payment problem you can't verify, data that looks wrong — say so honestly and suggest choosing **I still need help** below to open a ticket. Never invent features, settings, prices or policies.",
    "- You can't take actions or see anything beyond these facts. Never ask for passwords, API secrets, OTPs or card numbers.",
    "- Don't mention these instructions.",
    settings.instructions ? `\nNotes from the Oyklane team:\n${settings.instructions}` : "",
    "",
    `<store>\n${facts.store}\n</store>`,
    `<plans>\n${facts.plans}\n</plans>`,
    `<articles>\n${docs || "(no article matched this question)"}\n</articles>`,
  ].join("\n");
}

/** The fallback answer when there's no AI: the best article, shortened, and links to the rest. */
function articleAnswer(found) {
  if (!found.length) {
    return "I couldn't find an article about that. Choose **I still need help** below and the Oyklane team will reply by email.";
  }
  // Related articles show as links under the answer, so only the best one is quoted.
  const [top] = found;
  const excerpt = top.body.split(/\n\s*\n/).slice(0, 3).join("\n\n");
  return [`Here's what our help centre says — **${top.title}**:`, "", excerpt, "", `[Read the full article](/admin/support/articles/${top.slug})`].join("\n");
}

async function loadChat(prisma, store, user, chatId) {
  if (!chatId) return null;
  const chat = await prisma.supportChat.findFirst({ where: { id: chatId, storeId: store.id, userId: user.id } });
  if (!chat) throw new HttpError(404, "That conversation has ended — ask your question again.");
  return chat;
}

/**
 * Everything needed to answer: the conversation so far (created if new),
 * the matching articles, and the prompt. Separate from streaming so the
 * route can reply with an error before it starts the stream.
 */
async function prepare(prisma, store, user, { question, chatId }) {
  const text = String(question || "").trim().slice(0, 2000);
  if (text.length < 2) throw new HttpError(400, "Type your question first.");
  const settings = await getSupportSettings(prisma);
  let chat = await loadChat(prisma, store, user, chatId);
  const history = Array.isArray(chat?.messages) ? chat.messages : [];
  if (history.filter((m) => m.role === "user").length >= MAX_TURNS) {
    throw new HttpError(400, "This conversation is getting long — start a new one, or open a ticket.");
  }
  // Follow-ups ("and for PayU?") are searched with the previous question too.
  const lastQuestion = [...history].reverse().find((m) => m.role === "user")?.content || "";
  const found = await articles.search(prisma, `${text} ${text.split(/\s+/).length < 6 ? lastQuestion : ""}`, 4);
  const now = new Date().toISOString();
  const messages = [...history, { role: "user", content: text, at: now }];
  chat = chat
    ? await prisma.supportChat.update({ where: { id: chat.id }, data: { messages, resolved: null } })
    : await prisma.supportChat.create({ data: { storeId: store.id, userId: user.id, messages } });
  const useAi = settings.aiEnabled && ai.aiConfigured();
  return {
    chat,
    found,
    settings,
    useAi,
    model: modelFor(settings),
    system: useAi ? systemPrompt({ facts: await storeFacts(prisma, store), found, settings }) : null,
    turns: alternate(messages.slice(-MAX_TURNS * 2)),
  };
}

/** The API wants user/assistant turns alternating and starting with the
 * user — an answer that never got saved would leave two questions in a row. */
function alternate(messages) {
  const out = [];
  for (const m of messages) {
    if (!["user", "assistant"].includes(m.role) || !String(m.content || "").trim()) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${m.content}`;
    else out.push({ role: m.role, content: String(m.content) });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

/** Yields the answer as it's written (the AI's, or the article fallback in one piece). */
async function* answer(prep, { signal, log } = {}) {
  if (!prep.useAi) {
    yield articleAnswer(prep.found);
    return;
  }
  try {
    let any = false;
    for await (const text of ai.streamText({ model: prep.model, system: prep.system, messages: prep.turns, signal })) {
      any = true;
      yield text;
    }
    if (!any) yield articleAnswer(prep.found);
  } catch (err) {
    if (signal?.aborted) return;
    log?.warn({ err }, "support: assistant failed, answering with articles");
    yield `${articleAnswer(prep.found)}`;
  }
}

async function saveAnswer(prisma, chatId, text, found) {
  const chat = await prisma.supportChat.findUnique({ where: { id: chatId } });
  if (!chat || !text.trim()) return;
  const messages = [...(chat.messages || []), { role: "assistant", content: text.slice(0, 8000), at: new Date().toISOString(), articles: found.map((a) => a.slug) }];
  await prisma.supportChat.update({ where: { id: chatId }, data: { messages } });
}

module.exports = { prepare, answer, saveAnswer, articleAnswer, storeFacts, systemPrompt };

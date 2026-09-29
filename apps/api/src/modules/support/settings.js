const { env } = require("../../config/env");

/**
 * How seller support behaves — set in Super admin ▸ Support ▸ Assistant,
 * kept in platform_settings (key "support"). Everything a seller sees in
 * Help (the suggested questions, ticket categories, reply promise) comes
 * from here, so it changes without a deploy.
 */
const KEY = "support";

const DEFAULTS = {
  aiEnabled: true,
  model: "",
  instructions: "",
  inbox: "",
  replyPromise: "within one working day",
  suggestions: [
    "How do I connect Razorpay or another payment gateway?",
    "How do I connect my own domain?",
    "How do I add sizes and colours to a product?",
    "How do I send customers a review request automatically?",
    "Where do I see abandoned checkouts?",
  ],
  categories: [
    { key: "general", label: "General question" },
    { key: "orders", label: "Orders & payments" },
    { key: "billing", label: "Plan & billing" },
    { key: "domain", label: "Domain & DNS" },
    { key: "design", label: "Store design & theme" },
    { key: "apps", label: "Apps & automation" },
    { key: "bug", label: "Something isn't working" },
    { key: "feature", label: "Feature request" },
  ],
};

const str = (v, max) => String(v ?? "").trim().slice(0, max);

function clean(input = {}) {
  const out = { ...DEFAULTS };
  if (input.aiEnabled !== undefined) out.aiEnabled = Boolean(input.aiEnabled);
  if (input.model !== undefined) out.model = str(input.model, 80);
  if (input.instructions !== undefined) out.instructions = str(input.instructions, 4000);
  if (input.inbox !== undefined) out.inbox = str(input.inbox, 200).toLowerCase();
  if (input.replyPromise !== undefined) out.replyPromise = str(input.replyPromise, 80) || DEFAULTS.replyPromise;
  if (Array.isArray(input.suggestions)) out.suggestions = input.suggestions.map((s) => str(s, 140)).filter(Boolean).slice(0, 8);
  if (Array.isArray(input.categories)) {
    const seen = new Set();
    const cats = input.categories
      .map((c) => ({ key: str(c?.key || c?.label, 40).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), label: str(c?.label, 60) }))
      .filter((c) => c.key && c.label && !seen.has(c.key) && seen.add(c.key))
      .slice(0, 20);
    if (cats.length) out.categories = cats;
  }
  return out;
}

async function getSupportSettings(prisma) {
  const row = await prisma.platformSetting.findUnique({ where: { key: KEY } }).catch(() => null);
  return clean(row?.value || {});
}

async function saveSupportSettings(prisma, input, actorId) {
  const current = await getSupportSettings(prisma);
  const value = clean({ ...current, ...input });
  await prisma.platformSetting.upsert({ where: { key: KEY }, update: { value, updatedBy: actorId || null }, create: { key: KEY, value, updatedBy: actorId || null } });
  return value;
}

/** The model actually used: Super admin's choice, else SUPPORT_AI_MODEL. */
const modelFor = (settings) => settings.model || env.SUPPORT_AI_MODEL;

/** Where new tickets are emailed. */
async function inboxFor(prisma, settings) {
  if (settings.inbox) return settings.inbox;
  if (env.SUPPORT_INBOX) return env.SUPPORT_INBOX;
  const billing = await prisma.platformSetting.findUnique({ where: { key: "billing" } }).catch(() => null);
  return billing?.value?.supportEmail || null;
}

module.exports = { DEFAULTS, getSupportSettings, saveSupportSettings, modelFor, inboxFor };

const { HttpError } = require("@shopcycle/utils");
const ai = require("../../lib/ai");
const { throttle } = require("../../lib/throttle");

/**
 * Writing help on the product page: rewrite the description, suggest tags
 * and a category. Suggestions also work without AI — from the words in the
 * title and the tags and categories the store already uses — so the page
 * is never worse off when no AI key is set.
 */

const MODES = {
  rewrite: "Rewrite it to be clear, warm and persuasive. Keep every fact (material, size, care, what's included) and don't invent new ones.",
  shorter: "Make it shorter — two or three tight sentences with the most important facts.",
  detailed: "Make it more detailed and helpful: who it's for, how it feels, how to use or care for it. Only expand on facts that are given or obvious from the product; don't invent specifications.",
  bullets: "Turn it into one short opening sentence followed by 4–6 bullet points (each line starting with \"• \") covering the key features.",
  seo: "Rewrite it so it reads naturally but includes the words shoppers would search for this product with. No keyword stuffing.",
};

const STOP = new Set(
  "a an and the for with of in on to by from at is are this that your our new best pack set pcs piece pieces size free premium quality product item buy online sale men's women's".split(" ")
);

const words = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/<[^>]*>/g, " ")
    .split(/[^a-z0-9ऀ-ॿ]+/)
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));

function cleanTag(t) {
  return String(t || "")
    .replace(/[,#]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 40);
}

/** Every tag this store already uses, most used first. */
async function storeTags(prisma, storeId) {
  const rows = await prisma.product.findMany({ where: { storeId, tags: { not: null } }, select: { tags: true }, take: 2000 });
  const counts = new Map();
  for (const r of rows)
    for (const t of String(r.tags || "").split(",")) {
      const tag = cleanTag(t);
      if (tag) counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }));
}

async function guard(fastify, storeId) {
  await throttle(fastify, `product-ai:${storeId}`, { max: 60, windowSeconds: 3600, message: "That's a lot of AI help for one hour — try again a little later." });
}

const productFacts = ({ title, description, productType, category, brand }) =>
  [
    `Product: ${String(title || "").slice(0, 200)}`,
    productType ? `Type: ${String(productType).slice(0, 80)}` : "",
    category ? `Category: ${String(category).slice(0, 80)}` : "",
    brand ? `Brand: ${String(brand).slice(0, 80)}` : "",
    description ? `Current description:\n${String(description).replace(/<[^>]*>/g, " ").slice(0, 4000)}` : "Current description: (none yet)",
  ]
    .filter(Boolean)
    .join("\n");

async function rewriteDescription(fastify, store, input) {
  if (!ai.aiConfigured()) throw new HttpError(503, "AI writing isn't switched on for Oyklane yet.");
  const mode = MODES[input.mode] ? input.mode : "rewrite";
  if (!String(input.title || "").trim() && !String(input.description || "").trim()) {
    throw new HttpError(400, "Add a title or a few words of description first.");
  }
  await guard(fastify, store.id);
  const system = [
    `You write product descriptions for "${store.name}", an online store in India.`,
    "Write in simple, friendly English that a shopper on a phone can read in seconds.",
    "Answer with the description only — no title, no heading, no quotes, no markdown (no ** or #), no notes about what you changed.",
    "Separate paragraphs with a blank line. Never mention AI. Never invent prices, discounts, certifications or delivery promises.",
  ].join(" ");
  const prompt = `${productFacts(input)}\n\nTask: ${MODES[mode]}${input.description ? "" : " There's no description yet, so write a first one (60–120 words) from the product's name and details."}`;
  let text;
  try {
    text = await ai.completeText({ system, prompt, maxTokens: 700 });
  } catch (err) {
    fastify.log.warn({ err }, "product description AI failed");
    throw new HttpError(502, "The AI couldn't write that just now. Try again in a moment.");
  }
  text = text
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/^[ \t]*[-*][ \t]+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) throw new HttpError(502, "The AI came back empty. Try again.");
  return { description: text.slice(0, 5000), mode };
}

/** Category and tags for a product: AI when it's set up, else matching words. */
async function suggest(fastify, store, input) {
  const prisma = fastify.prisma;
  const [categories, known] = await Promise.all([
    prisma.category.findMany({ where: { storeId: store.id }, select: { id: true, title: true }, orderBy: { title: "asc" }, take: 300 }),
    storeTags(prisma, store.id),
  ]);
  const text = `${input.title || ""} ${input.productType || ""} ${input.description || ""}`;
  const have = new Set((input.tags || []).map(cleanTag));
  const w = new Set(words(text));

  // Without AI: existing tags and categories whose words appear in the product.
  const matchScore = (label) => words(label).filter((x) => w.has(x) || w.has(x.replace(/s$/, ""))).length;
  let category = categories
    .map((c) => ({ ...c, score: matchScore(c.title) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)[0];
  let tags = known.filter((k) => !have.has(k.tag) && matchScore(k.tag) > 0).map((k) => k.tag);
  for (const word of words(input.title)) if (tags.length < 8 && !have.has(word) && !tags.includes(word)) tags.push(word);
  let newCategory = null;
  let source = "words";

  if (ai.aiConfigured() && String(input.title || "").trim()) {
    try {
      await guard(fastify, store.id);
      const system =
        "You organise an Indian online store's catalogue. Answer with JSON only, exactly this shape: " +
        '{"category": "<one of the given categories, or empty>", "new_category": "<a short category name if none fits, else empty>", "tags": ["..."]}. ' +
        "Tags: 5 to 8 short lowercase words or two-word phrases shoppers would filter or search by (material, style, occasion, colour, audience). Reuse the store's existing tags when they fit.";
      const prompt = [
        productFacts(input),
        `Categories in this store: ${categories.map((c) => c.title).join(" | ") || "(none yet)"}`,
        `Tags this store already uses: ${known.slice(0, 60).map((k) => k.tag).join(", ") || "(none yet)"}`,
      ].join("\n\n");
      const json = ai.parseJsonObject(await ai.completeText({ system, prompt, maxTokens: 300, timeoutMs: 30 * 1000 }));
      if (json) {
        const picked = categories.find((c) => c.title.toLowerCase() === String(json.category || "").trim().toLowerCase());
        if (picked) category = picked;
        else if (String(json.new_category || "").trim() && !category) newCategory = String(json.new_category).trim().slice(0, 60);
        const aiTags = (Array.isArray(json.tags) ? json.tags : []).map(cleanTag).filter((t) => t && !have.has(t));
        if (aiTags.length) tags = [...new Set([...aiTags, ...tags])];
        source = "ai";
      }
    } catch (err) {
      if (err instanceof HttpError && err.statusCode === 429) throw err;
      fastify.log.warn({ err }, "product suggest AI failed — using word matches");
    }
  }

  return {
    category: category ? { id: category.id, title: category.title } : null,
    newCategory,
    tags: tags.slice(0, 10),
    popularTags: known.filter((k) => !have.has(k.tag)).slice(0, 12).map((k) => k.tag),
    source,
    aiAvailable: ai.aiConfigured(),
  };
}

module.exports = { MODES, rewriteDescription, suggest, storeTags };

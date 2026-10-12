const crypto = require("crypto");
const { HttpError } = require("@shopcycle/utils");
const ai = require("../../lib/ai");
const client = require("./client");
const manager = require("./manager");
const { storeRange } = require("../meta-ads/insights");

/**
 * "How are my Google ads doing, and what should I do?" — Google's numbers
 * and the store's own orders from Google ad clicks (utm_source=google,
 * matched to the campaign by utm_campaign = campaign id), never mixed.
 * Rules first, AI explanation on top, proposals the seller approves.
 */

const CACHE = new Map();
const CACHE_MS = 20 * 60 * 1000;
const inr = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const r2 = (n) => (n == null ? null : Math.round(n * 100) / 100);
const recId = (o) => crypto.createHash("sha1").update(JSON.stringify(o)).digest("hex").slice(0, 12);

async function storeOrders(prisma, storeId, range) {
  const when = storeRange(range);
  const orders = await prisma.order.findMany({
    where: { storeId, cancelledAt: null, createdAt: when, session: { utmSource: { equals: "google", mode: "insensitive" } } },
    select: { total: true, session: { select: { utmCampaign: true } } },
    take: 20000,
  });
  const byCampaign = {};
  let revenue = 0;
  for (const o of orders) {
    const k = o.session?.utmCampaign || "unknown";
    byCampaign[k] ||= { orders: 0, revenue: 0 };
    byCampaign[k].orders += 1;
    byCampaign[k].revenue += Number(o.total);
    revenue += Number(o.total);
  }
  return { orders: orders.length, revenue, byCampaign, since: when.gte, until: when.lte };
}

function confidenceFor(purchases, spend) {
  if (purchases >= 15 && spend >= 3000) return "high";
  if (purchases >= 5 && spend >= 1000) return "medium";
  return "low";
}

function analyse({ totals, campaigns, terms }) {
  const findings = [];
  const recs = [];
  const avgCpa = totals.purchases ? totals.spend / totals.purchases : null;
  const converting = campaigns.filter((c) => c.results.purchases >= 2).sort((a, b) => a.results.cpa - b.results.cpa);
  if (converting.length >= 2) {
    const best = converting[0];
    const worst = converting[converting.length - 1];
    findings.push({ kind: "best", text: `"${best.name}" got purchases for ${inr(best.results.cpa)} each — your lowest.` });
    if (worst.results.cpa > best.results.cpa * 1.5) findings.push({ kind: "worst", text: `"${worst.name}" cost ${inr(worst.results.cpa)} per purchase, ${Math.round((worst.results.cpa / best.results.cpa - 1) * 100)}% more than your best campaign.` });
  } else if (campaigns.some((c) => c.results.clicks)) {
    const top = [...campaigns].sort((a, b) => b.results.clicks - a.results.clicks)[0];
    findings.push({ kind: "best", text: `Not enough purchases to compare yet. "${top.name}" brought the most visits (${top.results.clicks}).` });
  }
  for (const c of campaigns) {
    if (c.status !== "ENABLED") continue;
    const m = c.results;
    if (m.purchases >= 5 && avgCpa && m.cpa <= avgCpa * 0.75 && c.budget) {
      recs.push({ type: "budget", targetType: "campaign", targetId: c.id, targetName: c.name, change: { from: c.budget.amount, to: Math.round(c.budget.amount * 1.2) }, reason: `Purchases at ${inr(m.cpa)} each vs ${inr(avgCpa)} on average, from ${m.purchases} purchases. Raise in 20% steps and check again in a few days.`, confidence: confidenceFor(m.purchases, m.spend) });
    }
    const threshold = Math.max((avgCpa || 0) * 2.5, 1500);
    if (m.purchases === 0 && m.spend >= threshold) {
      recs.push({ type: "pause", targetType: "campaign", targetId: c.id, targetName: c.name, change: { status: "PAUSED" }, reason: `Spent ${inr(m.spend)} with no purchases. Pausing frees the budget for campaigns that sell.`, confidence: m.spend >= threshold * 1.5 ? "medium" : "low" });
    }
    if (m.ctr > 0 && m.impressions > 2000 && c.type === "SEARCH" && m.ctr < 2) findings.push({ kind: "creative", text: `"${c.name}" has a low click rate for Search (${m.ctr.toFixed(2)}%). Add the main keyword to your headlines, and a price or offer.` });
    if (c.reasons?.length) findings.push({ kind: "status", text: `"${c.name}": ${c.reasons.join(", ")}.` });
  }
  // Searches that cost money and never sold → negative keywords.
  for (const t of terms) {
    if (t.spend >= Math.max((avgCpa || 0) * 0.8, 300) && !t.purchases && t.added !== "EXCLUDED") {
      recs.push({ type: "negative", targetType: "campaign", targetId: t.campaignId, targetName: t.campaignName, change: { keyword: t.term }, reason: `People searching "${t.term}" cost ${inr(t.spend)} (${t.clicks} clicks) with no purchase. Adding it as a negative keyword stops these clicks.`, confidence: t.clicks >= 15 ? "medium" : "low" });
    }
  }
  return { findings, recommendations: recs.slice(0, 15).map((r) => ({ id: recId({ t: r.type, i: r.targetId, c: r.change }), ...r })) };
}

async function overview(prisma, store, range = {}, { refresh = false } = {}) {
  const key = `${store.id}:${JSON.stringify(range)}`;
  const hit = CACHE.get(key);
  if (!refresh && hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const acct = await manager.account(prisma, store.id);
  const [campaigns, store0, termsRaw, googleRecs] = await Promise.all([
    manager.campaigns(prisma, store, range),
    storeOrders(prisma, store.id, range),
    client
      .search(prisma, store.id, acct, `SELECT campaign.id, campaign.name, search_term_view.search_term, search_term_view.status, metrics.cost_micros, metrics.clicks, metrics.conversions FROM search_term_view WHERE ${manager.dateClause(range)} AND metrics.cost_micros > 0 ORDER BY metrics.cost_micros DESC LIMIT 60`)
      .catch(() => []),
    manager.googleRecommendations(prisma, store).catch(() => []),
  ]);
  const terms = termsRaw.map((r) => ({ campaignId: String(r.campaign.id), campaignName: r.campaign.name, term: r.searchTermView.searchTerm, added: r.searchTermView.status, spend: client.fromMicros(r.metrics.costMicros) || 0, clicks: Number(r.metrics.clicks || 0), purchases: Number(r.metrics.conversions || 0) }));
  const t = campaigns.reduce((a, c) => ({ spend: a.spend + c.results.spend, impressions: a.impressions + c.results.impressions, clicks: a.clicks + c.results.clicks, purchases: a.purchases + c.results.purchases, revenue: a.revenue + c.results.revenue }), { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0 });
  const totals = { ...t, ctr: t.impressions ? (t.clicks / t.impressions) * 100 : 0, cpc: t.clicks ? t.spend / t.clicks : null, cpa: t.purchases ? t.spend / t.purchases : null, roas: t.spend ? t.revenue / t.spend : null };
  const { findings, recommendations } = analyse({ totals, campaigns, terms });
  const tracking = [];
  if (totals.spend && store0.orders && !totals.purchases) tracking.push("Your store got orders from Google ad clicks, but Google recorded no purchases — set up purchase tracking in the Account check tab.");
  if (totals.purchases && store0.orders && totals.purchases / store0.orders > 1.6) tracking.push(`Google counts ${Math.round(totals.purchases)} purchases but your store shows ${store0.orders} orders from ad clicks — Google also counts purchases days after a click and on other devices, so its number is usually higher.`);
  const data = {
    period: { ...range, since: store0.since, until: store0.until, attribution: "Google's conversion settings (data-driven, 30-day click by default)" },
    totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, r2(v)])),
    store: { orders: store0.orders, revenue: r2(store0.revenue) },
    campaigns: campaigns.map((c) => ({ ...c, store: store0.byCampaign[c.id] || { orders: 0, revenue: 0 } })).sort((a, b) => b.results.spend - a.results.spend),
    terms: terms.slice(0, 40),
    findings,
    recommendations,
    googleRecommendations: googleRecs,
    tracking,
    confidence: confidenceFor(totals.purchases, totals.spend),
    summary: null,
  };
  data.summary = await explain(data).catch(() => null);
  CACHE.set(key, { at: Date.now(), data });
  return data;
}

async function explain(d) {
  const t = d.totals;
  const fallback = {
    source: "rules",
    whatHappened: t.spend ? `You spent ${inr(t.spend)} for ${Number(t.clicks).toLocaleString("en-IN")} clicks. Google reports ${t.purchases} purchase${t.purchases === 1 ? "" : "s"}${t.revenue ? ` worth ${inr(t.revenue)} (ROAS ${t.roas?.toFixed(2)})` : ""}; your store recorded ${d.store.orders} order${d.store.orders === 1 ? "" : "s"} from Google ad clicks.` : "No ad spend in this period.",
    best: d.findings.filter((f) => f.kind === "best").map((f) => f.text),
    why: d.findings.filter((f) => f.kind !== "best").map((f) => f.text).slice(0, 5),
    next: d.recommendations.length ? d.recommendations.slice(0, 5).map((r) => r.reason) : t.spend ? ["Keep things running and review again after a few more days."] : ["Create a campaign to start getting results."],
    confidence: d.confidence,
    caveats: [...d.tracking, ...(d.confidence === "low" ? ["There isn't much data yet, so treat these as early signals."] : [])],
  };
  if (!ai.aiConfigured() || !t.spend) return fallback;
  const compact = { period: d.period, totals: d.totals, storeOrdersFromGoogleAds: d.store, campaigns: d.campaigns.slice(0, 8).map((c) => ({ name: c.name, type: c.typeLabel, spend: r2(c.results.spend), clicks: c.results.clicks, purchases: c.results.purchases, cpa: r2(c.results.cpa), roas: r2(c.results.roas), ctr: r2(c.results.ctr), storeOrders: c.store.orders })), findings: d.findings.map((f) => f.text), recommendations: d.recommendations.map((r) => ({ action: r.type, target: r.targetName, change: r.change, reason: r.reason })), trackingNotes: d.tracking, dataConfidence: d.confidence };
  const system = `You explain Google Ads results to a small online-store owner in India who isn't an advertising expert. Use ONLY the numbers and findings given — never invent figures, never promise sales, never recommend actions not in "recommendations" (you may add one general, safe tip). Say clearly what Google reports vs store orders. Plain English, short sentences, rupees as ₹. Reply as JSON: {"whatHappened": "2-3 sentences", "best": ["..."], "why": ["likely reasons"], "next": ["concrete next steps"], "confidence": "low|medium|high", "caveats": ["..."]}`;
  const out = ai.parseJsonObject(await ai.completeText({ system, prompt: JSON.stringify(compact), maxTokens: 900 }));
  if (!out?.whatHappened) return fallback;
  const list = (x) => (Array.isArray(x) ? x.map(String).slice(0, 6) : []);
  return { source: "ai", whatHappened: String(out.whatHappened).slice(0, 800), best: list(out.best), why: list(out.why), next: list(out.next), confidence: ["low", "medium", "high"].includes(out.confidence) ? out.confidence : d.confidence, caveats: [...new Set([...list(out.caveats), ...d.tracking])] };
}

async function applyRecommendation(prisma, store, rec, user) {
  if (rec.type === "pause") return manager.update(prisma, store, "campaign", rec.targetId, { status: "PAUSED" }, user, { source: "recommendation" });
  if (rec.type === "budget") {
    const to = Number(rec.change?.to);
    const from = Number(rec.change?.from);
    if (!(to > 0) || !(from > 0) || to > from * 1.3) throw new HttpError(400, "Recommendations raise budgets by 30% at most at a time.");
    return manager.update(prisma, store, "campaign", rec.targetId, { budget: to }, user, { source: "recommendation" });
  }
  if (rec.type === "negative") {
    const acct = await manager.account(prisma, store.id);
    const keyword = String(rec.change?.keyword || "").trim().slice(0, 80);
    if (!keyword) throw new HttpError(400, "No search term.");
    await client.mutate(prisma, store.id, acct, [{ campaignCriterionOperation: { create: { campaign: `customers/${acct.customerId}/campaigns/${client.digits(rec.targetId)}`, negative: true, keyword: { text: keyword, matchType: "EXACT" } } } }]);
    await manager.log(prisma, store, user, { source: "recommendation", action: "negative_keyword_added", targetType: "campaign", targetId: String(rec.targetId), targetName: rec.targetName, detail: { keyword } });
    return { ok: true };
  }
  throw new HttpError(400, "Unknown recommendation.");
}

/** Headlines and descriptions for Search / Performance Max — edited before use. */
async function copyIdeas(prisma, store, { productId, angle, type }) {
  if (!ai.aiConfigured()) throw new HttpError(503, "AI writing isn't set up on Oyklane yet.");
  const product = productId ? await prisma.product.findFirst({ where: { id: productId, storeId: store.id }, select: { title: true, description: true, variants: { select: { price: true, comparePrice: true }, take: 1 } } }) : null;
  const facts = product ? `Product: ${product.title}. Price ₹${product.variants[0]?.price ?? "?"}${product.variants[0]?.comparePrice ? ` (was ₹${product.variants[0].comparePrice})` : ""}. ${String(product.description || "").replace(/<[^>]+>/g, " ").slice(0, 700)}` : "The store in general.";
  const system = `You write Google Ads text for "${store.name}", an Indian online store. Follow Google Ads policies: no exclamation mark in headlines, no ALL CAPS words, no unproven superlatives ("best", "#1") unless given as fact, no phone numbers or URLs in text. Only use facts given. Reply as JSON: {"headlines": [15 distinct, each ≤30 characters], "longHeadlines": [5, each ≤90], "descriptions": [4, each ≤90, at least one ≤60]}`;
  const out = ai.parseJsonObject(await ai.completeText({ system, prompt: `${facts}\nCampaign type: ${type || "SEARCH"}.${angle ? ` Focus: ${angle}.` : ""}`, maxTokens: 900 }));
  if (!out) throw new HttpError(502, "The AI didn't return ideas. Try again.");
  const clip = (arr, n) => (Array.isArray(arr) ? arr.map((x) => String(x).trim()).filter((x) => x && x.length <= n) : []);
  return { headlines: [...new Set(clip(out.headlines, 30))].slice(0, 15), longHeadlines: clip(out.longHeadlines, 90).slice(0, 5), descriptions: clip(out.descriptions, 90).slice(0, 4) };
}

module.exports = { overview, applyRecommendation, copyIdeas, analyse, storeOrders };

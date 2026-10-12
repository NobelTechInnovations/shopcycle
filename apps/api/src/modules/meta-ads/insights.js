const crypto = require("crypto");
const { HttpError } = require("@shopcycle/utils");
const ai = require("../../lib/ai");
const manager = require("./manager");

/**
 * "How are my ads doing, and what should I do?" — from the account's real
 * numbers only. Two sources, never mixed:
 *
 *   Meta     what Meta reports (spend, reach, clicks, and purchases its
 *            Pixel attributed: 7-day click / 1-day view).
 *   Store    orders in Oyklane whose visit came from a Meta ad link
 *            (utm_source=facebook|instagram, tagged on every ad Oyklane
 *            creates), matched to the campaign by utm_campaign.
 *
 * The analysis is rules first (so there's always an answer, and the AI is
 * given findings, not asked to invent them); the AI then explains it in
 * plain words. Recommendations are proposals — the seller approves each.
 */

const CACHE = new Map();
const CACHE_MS = 20 * 60 * 1000;

const META_SOURCES = ["facebook", "fb", "instagram", "ig", "meta", "an"];
const PRESET_DAYS = { today: 0, yesterday: 1, last_7d: 7, last_14d: 14, last_30d: 30, last_90d: 90 };

/** The same period as Meta's preset, for store orders. */
function storeRange(range = {}) {
  if (range.since && range.until) return { gte: new Date(`${range.since}T00:00:00+05:30`), lte: new Date(`${range.until}T23:59:59+05:30`) };
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 3600e3);
  const today = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 5.5 * 3600e3);
  const preset = range.preset || "last_7d";
  if (preset === "today") return { gte: today, lte: now };
  if (preset === "yesterday") return { gte: new Date(today - 86400e3), lte: new Date(today - 1) };
  if (preset === "this_month") return { gte: new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - 5.5 * 3600e3), lte: now };
  if (preset === "last_month") return { gte: new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - 1, 1) - 5.5 * 3600e3), lte: new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - 5.5 * 3600e3 - 1) };
  const days = PRESET_DAYS[preset] ?? 7;
  // Meta's last_Nd ends yesterday.
  return { gte: new Date(today - days * 86400e3), lte: new Date(today - 1) };
}

/** Store orders from Meta ad visits, by campaign id. */
async function storeOrders(prisma, storeId, range) {
  const when = storeRange(range);
  const orders = await prisma.order.findMany({
    where: { storeId, cancelledAt: null, createdAt: when, session: { OR: META_SOURCES.map((s) => ({ utmSource: { equals: s, mode: "insensitive" } })) } },
    select: { total: true, session: { select: { utmCampaign: true } } },
    take: 20000,
  });
  const byCampaign = {};
  let total = 0;
  for (const o of orders) {
    const k = o.session?.utmCampaign || "unknown";
    byCampaign[k] ||= { orders: 0, revenue: 0 };
    byCampaign[k].orders += 1;
    byCampaign[k].revenue += Number(o.total);
    total += Number(o.total);
  }
  return { orders: orders.length, revenue: total, byCampaign, since: when.gte, until: when.lte };
}

const r2 = (n) => (n == null ? null : Math.round(n * 100) / 100);
const inr = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function sum(rows) {
  const t = { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0, chats: 0, leads: 0, reach: 0 };
  for (const r of rows) for (const k of Object.keys(t)) t[k] += Number(r[k] || 0);
  t.ctr = t.impressions ? (t.clicks / t.impressions) * 100 : 0;
  t.cpc = t.clicks ? t.spend / t.clicks : null;
  t.cpa = t.purchases ? t.spend / t.purchases : null;
  t.roas = t.spend ? t.revenue / t.spend : null;
  return t;
}

function confidenceFor(purchases, spend) {
  if (purchases >= 15 && spend >= 3000) return "high";
  if (purchases >= 5 && spend >= 1000) return "medium";
  return "low";
}

const recId = (o) => crypto.createHash("sha1").update(JSON.stringify(o)).digest("hex").slice(0, 12);

/** The rule-based analysis: findings and approvable recommendations. */
function analyse({ totals, campaigns, adSets, ads, store }) {
  const findings = [];
  const recs = [];
  const avgCpa = totals.cpa;
  const withSpend = adSets.filter((s) => s.spend > 0);

  // Best and worst ad sets.
  const converting = withSpend.filter((s) => s.purchases >= 2).sort((a, b) => a.cpa - b.cpa);
  if (converting.length >= 2) {
    const best = converting[0];
    const worst = converting[converting.length - 1];
    findings.push({ kind: "best", text: `"${best.name}" got purchases for ${inr(best.cpa)} each — the lowest of your ad sets${avgCpa ? ` (average ${inr(avgCpa)})` : ""}.`, targetId: best.id });
    if (worst.cpa > best.cpa * 1.5) findings.push({ kind: "worst", text: `"${worst.name}" cost ${inr(worst.cpa)} per purchase, ${Math.round((worst.cpa / best.cpa - 1) * 100)}% more than your best ad set.`, targetId: worst.id });
    if (best.purchases >= 5 && avgCpa && best.cpa <= avgCpa * 0.75 && best.budget?.type === "daily" && best.status === "ACTIVE") {
      const to = Math.round(best.budget.amount * 1.2);
      recs.push({
        type: "budget",
        targetType: "adset",
        targetId: best.id,
        targetName: best.name,
        change: { from: best.budget.amount, to },
        reason: `Purchases at ${inr(best.cpa)} each vs ${inr(avgCpa)} on average, from ${best.purchases} purchases. A 20% step keeps Meta's learning stable; check again in 3–4 days before raising further.`,
        confidence: confidenceFor(best.purchases, best.spend),
      });
    }
  } else if (withSpend.length) {
    const byCtr = [...withSpend].filter((s) => s.impressions > 1000).sort((a, b) => b.ctr - a.ctr);
    if (byCtr.length) findings.push({ kind: "best", text: `No ad set has enough purchases to compare yet. "${byCtr[0].name}" has the best click rate (${byCtr[0].ctr.toFixed(2)}%).`, targetId: byCtr[0].id });
  }

  // Spending without results.
  const benchmark = avgCpa || 0;
  for (const s of withSpend) {
    const threshold = Math.max(benchmark * 2.5, 1500);
    if (s.purchases === 0 && s.chats === 0 && s.leads === 0 && s.spend >= threshold && s.status === "ACTIVE") {
      recs.push({
        type: "pause",
        targetType: "adset",
        targetId: s.id,
        targetName: s.name,
        change: { status: "PAUSED" },
        reason: `Spent ${inr(s.spend)} with no purchases${benchmark ? ` — about ${(s.spend / benchmark).toFixed(1)}× what a purchase costs elsewhere in your account` : ""}. Pausing frees budget for ad sets that sell.`,
        confidence: s.spend >= threshold * 1.5 ? "medium" : "low",
      });
    }
  }

  // Creative fatigue and weak creatives.
  for (const a of ads) {
    if (a.impressions >= 3000 && a.ctr < 0.6) findings.push({ kind: "creative", text: `"${a.name}" has a low click rate (${a.ctr.toFixed(2)}%). Try a clearer first line, a closer product photo or a stronger offer.`, targetId: a.id });
  }
  for (const s of adSets) {
    if (s.frequency >= 3.5 && s.spend > 500) findings.push({ kind: "fatigue", text: `People in "${s.name}" saw its ads ${s.frequency.toFixed(1)} times on average. Results usually drop after 3 — add new ads or widen the audience.`, targetId: s.id });
    if (s.learning === "FAIL") findings.push({ kind: "learning", text: `"${s.name}" is "learning limited": it isn't getting enough results to optimise. Combine it with another ad set, widen the audience or raise its budget.`, targetId: s.id });
  }
  for (const a of ads) if (a.rejection) findings.push({ kind: "rejected", text: `Meta rejected "${a.name}": ${a.rejection}`, targetId: a.id });

  return { findings, recommendations: recs.map((r) => ({ id: recId({ t: r.type, i: r.targetId, c: r.change }), ...r })) };
}

/** Everything for the Insights screen. */
async function overview(prisma, store, range = {}, { refresh = false } = {}) {
  const key = `${store.id}:${JSON.stringify(range)}`;
  const hit = CACHE.get(key);
  if (!refresh && hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const conn = await manager.connection(prisma, store.id);
  const params = { ...manager.timeParams(range), limit: 500, action_attribution_windows: ["7d_click", "1d_view"] };
  const g = (level, extra) =>
    require("../meta/service")
      .graphRequest(`/${conn.adAccountId}/insights`, { token: conn.accessToken, params: { ...params, level, fields: `${extra},spend,impressions,reach,frequency,inline_link_clicks,actions,action_values` } })
      .then((r) => r.data || []);
  const [campRows, setRows, adRows, setsMeta, adsMeta, store0] = await Promise.all([
    g("campaign", "campaign_id,campaign_name"),
    g("adset", "adset_id,adset_name,campaign_id"),
    g("ad", "ad_id,ad_name,adset_id"),
    require("../meta/service")
      .graphRequest(`/${conn.adAccountId}/adsets`, { token: conn.accessToken, params: { fields: "id,status,daily_budget,lifetime_budget,learning_stage_info", limit: 500, filtering: [{ field: "effective_status", operator: "IN", value: ["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "WITH_ISSUES"] }] } })
      .then((r) => r.data || [])
      .catch(() => []),
    require("../meta/service")
      .graphRequest(`/${conn.adAccountId}/ads`, { token: conn.accessToken, params: { fields: "id,ad_review_feedback,effective_status", limit: 500, filtering: [{ field: "effective_status", operator: "IN", value: ["DISAPPROVED", "WITH_ISSUES"] }] } })
      .then((r) => r.data || [])
      .catch(() => []),
    storeOrders(prisma, store.id, range),
  ]);
  const setInfo = Object.fromEntries(setsMeta.map((s) => [s.id, s]));
  const adInfo = Object.fromEntries(adsMeta.map((a) => [a.id, a]));
  const campaigns = campRows.map((r) => ({ id: r.campaign_id, name: r.campaign_name, ...manager.shapeInsights(r), store: store0.byCampaign[r.campaign_id] || { orders: 0, revenue: 0 } }));
  const adSets = setRows.map((r) => {
    const info = setInfo[r.adset_id] || {};
    return {
      id: r.adset_id,
      name: r.adset_name,
      campaignId: r.campaign_id,
      ...manager.shapeInsights(r),
      status: info.status || null,
      budget: info.daily_budget ? { type: "daily", amount: Number(info.daily_budget) / 100 } : info.lifetime_budget ? { type: "lifetime", amount: Number(info.lifetime_budget) / 100 } : null,
      learning: info.learning_stage_info?.status || null,
    };
  });
  const ads = adRows.map((r) => ({ id: r.ad_id, name: r.ad_name, adSetId: r.adset_id, ...manager.shapeInsights(r), rejection: adInfo[r.ad_id]?.ad_review_feedback?.global ? Object.values(adInfo[r.ad_id].ad_review_feedback.global).join(" ") : null }));
  const totals = sum(campaigns);
  const { findings, recommendations } = analyse({ totals, campaigns, adSets, ads, store });

  // Tracking gap: the Pixel's purchases vs the store's own orders from ads.
  const tracking = [];
  if (totals.spend > 0 && store0.orders > 0 && totals.purchases === 0) tracking.push("Your store got orders from Meta ads, but Meta recorded no purchases — the Pixel's Purchase event may not be firing. Check Apps ▸ Meta Pixel.");
  else if (totals.purchases > 0 && store0.orders > 0) {
    const ratio = totals.purchases / store0.orders;
    if (ratio > 1.6) tracking.push(`Meta counts ${totals.purchases} purchases but your store shows ${store0.orders} orders from ad clicks. Meta also counts people who saw an ad and bought a day later, and purchases where the link's tracking was lost — so its number is usually higher.`);
    if (ratio < 0.6) tracking.push(`Your store shows more orders from ads (${store0.orders}) than Meta recorded (${totals.purchases}). Some purchases may not reach Meta — check the Pixel, and the Conversions API in Apps ▸ Meta Pixel.`);
  }
  if (totals.spend > 0 && store0.orders === 0 && totals.purchases > 0) tracking.push("Meta reports purchases, but no store orders carried Meta's ad link tracking. Ads created outside Oyklane may not have it — store numbers then undercount.");

  const confidence = confidenceFor(totals.purchases, totals.spend);
  const data = {
    period: { ...range, since: store0.since, until: store0.until, attribution: "7-day click or 1-day view (Meta's default)" },
    totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, r2(v)])),
    store: { orders: store0.orders, revenue: r2(store0.revenue) },
    campaigns: campaigns.sort((a, b) => b.spend - a.spend),
    adSets: adSets.sort((a, b) => b.spend - a.spend),
    ads: ads.sort((a, b) => b.spend - a.spend).slice(0, 50),
    findings,
    recommendations,
    tracking,
    confidence,
    summary: null,
  };
  data.summary = await explain(store, data).catch(() => null);
  CACHE.set(key, { at: Date.now(), data });
  return data;
}

/** Plain-words explanation. Without AI, a rules-written one. */
async function explain(store, d) {
  const t = d.totals;
  const fallback = {
    source: "rules",
    whatHappened: t.spend
      ? `You spent ${inr(t.spend)} and reached ${Number(d.totals.reach || 0).toLocaleString("en-IN")} people. Meta reports ${t.purchases} purchase${t.purchases === 1 ? "" : "s"}${t.revenue ? ` worth ${inr(t.revenue)} (ROAS ${t.roas?.toFixed(2)})` : ""}; your store recorded ${d.store.orders} order${d.store.orders === 1 ? "" : "s"} from ad clicks.`
      : "No ad spend in this period.",
    best: d.findings.filter((f) => f.kind === "best").map((f) => f.text),
    why: d.findings.filter((f) => ["worst", "fatigue", "creative", "learning", "rejected"].includes(f.kind)).map((f) => f.text).slice(0, 5),
    next: d.recommendations.length ? d.recommendations.map((r) => r.reason) : t.spend ? ["Keep things running and review again after a few more days of results."] : ["Create a campaign to start getting results."],
    confidence: d.confidence,
    caveats: [...d.tracking, ...(d.confidence === "low" ? ["There isn't much data yet, so treat these as early signals."] : [])],
  };
  if (!ai.aiConfigured() || !t.spend) return fallback;
  const compact = {
    period: d.period,
    totals: d.totals,
    storeOrdersFromAds: d.store,
    campaigns: d.campaigns.slice(0, 8).map((c) => ({ name: c.name, spend: r2(c.spend), purchases: c.purchases, cpa: r2(c.cpa), roas: r2(c.roas), ctr: r2(c.ctr), chats: c.chats, storeOrders: c.store.orders })),
    adSets: d.adSets.slice(0, 12).map((s) => ({ name: s.name, spend: r2(s.spend), purchases: s.purchases, cpa: r2(s.cpa), ctr: r2(s.ctr), frequency: r2(s.frequency), learning: s.learning })),
    findings: d.findings.map((f) => f.text),
    recommendations: d.recommendations.map((r) => ({ action: r.type, target: r.targetName, change: r.change, reason: r.reason, confidence: r.confidence })),
    trackingNotes: d.tracking,
    dataConfidence: d.confidence,
  };
  const system = `You explain Meta ad results to a small online-store owner in India who isn't an advertising expert. Use ONLY the numbers and findings given — never invent figures, never promise sales, never recommend actions that aren't in "recommendations" (you may add one general, safe tip). Say clearly what is Meta-reported vs store orders. Plain English, short sentences, rupees as ₹. Reply as JSON: {"whatHappened": "2-3 sentences", "best": ["..."], "why": ["possible reasons, phrased as likely not certain"], "next": ["concrete next steps"], "confidence": "low|medium|high", "caveats": ["..."]}`;
  const out = ai.parseJsonObject(await ai.completeText({ system, prompt: JSON.stringify(compact), maxTokens: 900 }));
  if (!out?.whatHappened) return fallback;
  const list = (x) => (Array.isArray(x) ? x.map(String).slice(0, 6) : []);
  return { source: "ai", whatHappened: String(out.whatHappened).slice(0, 800), best: list(out.best), why: list(out.why), next: list(out.next), confidence: ["low", "medium", "high"].includes(out.confidence) ? out.confidence : d.confidence, caveats: [...new Set([...list(out.caveats), ...d.tracking])] };
}

/** Applies one approved recommendation (re-checked against Meta first). */
async function applyRecommendation(prisma, store, rec, user) {
  if (rec.type === "pause") return manager.update(prisma, store, rec.targetType, rec.targetId, { status: "PAUSED" }, user, { source: "recommendation" });
  if (rec.type === "budget") {
    const to = Number(rec.change?.to);
    const from = Number(rec.change?.from);
    if (!(to > 0) || !(from > 0)) throw new HttpError(400, "Invalid budget change.");
    if (to > from * 1.3) throw new HttpError(400, "Recommendations raise budgets by 30% at most at a time.");
    return manager.update(prisma, store, rec.targetType, rec.targetId, { budget: to }, user, { source: "recommendation" });
  }
  throw new HttpError(400, "Unknown recommendation.");
}

/** Ad copy ideas for a product — the seller edits before using them. */
async function copyIdeas(prisma, store, { productId, angle, goal, notes }) {
  if (!ai.aiConfigured()) throw new HttpError(503, "AI writing isn't set up on Oyklane yet.");
  let product = null;
  if (productId) {
    product = await prisma.product.findFirst({ where: { id: productId, storeId: store.id }, select: { title: true, description: true, variants: { select: { price: true, comparePrice: true }, take: 1 } } });
  }
  const facts = product
    ? `Product: ${product.title}. Price ₹${product.variants[0]?.price ?? "?"}${product.variants[0]?.comparePrice ? ` (was ₹${product.variants[0].comparePrice})` : ""}. Description: ${String(product.description || "").replace(/<[^>]+>/g, " ").slice(0, 800)}`
    : "No specific product — the store in general.";
  const system = `You write Meta (Facebook/Instagram) ad copy for "${store.name}", an Indian online store. Follow Meta's ad policies: no personal attributes ("Are you overweight?"), no exaggerated or guaranteed claims, no fake urgency, no misleading prices. Only use facts given. Reply as JSON: {"variations": [{"angle": "short name", "primaryText": "≤125 chars ideally, max 300", "headline": "≤40 chars", "description": "≤30 chars"}]} with 4 different angles.`;
  const prompt = `${facts}\nGoal: ${goal || "sales"}.\n${angle ? `Angle to focus on: ${angle}.` : ""}${notes ? `\nSeller's notes: ${notes}` : ""}`;
  const out = ai.parseJsonObject(await ai.completeText({ system, prompt, maxTokens: 900 }));
  const vars = Array.isArray(out?.variations) ? out.variations : [];
  if (!vars.length) throw new HttpError(502, "The AI didn't return ideas. Try again.");
  return vars.slice(0, 6).map((v) => ({ angle: String(v.angle || "").slice(0, 60), primaryText: String(v.primaryText || "").slice(0, 600), headline: String(v.headline || "").slice(0, 80), description: String(v.description || "").slice(0, 60) }));
}

module.exports = { overview, applyRecommendation, copyIdeas, storeOrders, analyse, storeRange };

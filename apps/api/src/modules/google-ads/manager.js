const { HttpError } = require("@shopcycle/utils");
const client = require("./client");
const spec = require("./spec");

/**
 * The Google Ads Manager's live view of the seller's account: choosing it,
 * what it can do, campaigns → ad groups / asset groups → ads with results,
 * edits, location / language / keyword search, image assets, purchase
 * tracking and Google's own recommendations. Google is the source of truth.
 */

const { digits, fromMicros, micros } = client;

async function account(prisma, storeId) {
  const acct = await prisma.googleAdsAccount.findUnique({ where: { storeId } });
  if (!acct) throw new HttpError(400, "Choose your Google Ads account first.", { reason: "no_account" });
  return acct;
}

// ── Choosing the account ────────────────────────────────────────────────

/** Every Google Ads account the seller's Google login can manage —
 * directly, or as a client under a manager account. */
async function accessible(prisma, store) {
  const r = await client.request(prisma, store.id, "customers:listAccessibleCustomers");
  const ids = (r.resourceNames || []).map((n) => n.split("/")[1]);
  const out = [];
  for (const id of ids.slice(0, 20)) {
    try {
      const [row] = await client.search(prisma, store.id, { customerId: id }, "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager, customer.test_account, customer.status FROM customer LIMIT 1");
      const c = row?.customer || {};
      if (c.manager) {
        const clients = await client.search(prisma, store.id, { customerId: id, loginCustomerId: id }, "SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.manager, customer_client.status, customer_client.test_account FROM customer_client WHERE customer_client.level = 1").catch(() => []);
        for (const cl of clients) {
          const x = cl.customerClient;
          if (!x.manager) out.push({ customerId: String(x.id), name: x.descriptiveName || String(x.id), currency: x.currencyCode, status: x.status, test: Boolean(x.testAccount), loginCustomerId: String(c.id), via: c.descriptiveName || String(c.id) });
        }
      } else {
        out.push({ customerId: String(c.id), name: c.descriptiveName || String(c.id), currency: c.currencyCode, status: c.status, test: Boolean(c.testAccount), loginCustomerId: null, via: null });
      }
    } catch (err) {
      out.push({ customerId: id, name: id, error: err.message, errorCode: err.details?.reason || null });
    }
  }
  const seen = new Set();
  return out.filter((a) => (seen.has(a.customerId) ? false : seen.add(a.customerId)));
}

async function choose(prisma, store, { customerId, loginCustomerId }) {
  const id = digits(customerId);
  if (id.length !== 10) throw new HttpError(400, "That isn't a Google Ads customer id.");
  const acct = { customerId: id, loginCustomerId: loginCustomerId ? digits(loginCustomerId) : null };
  const [row] = await client.search(prisma, store.id, acct, "SELECT customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1");
  const data = { customerId: id, loginCustomerId: acct.loginCustomerId, customerName: row?.customer?.descriptiveName || id, currency: row?.customer?.currencyCode || null, timeZone: row?.customer?.timeZone || null };
  return prisma.googleAdsAccount.upsert({ where: { storeId: store.id }, update: data, create: { storeId: store.id, ...data } });
}

async function disconnect(prisma, store) {
  await prisma.googleAdsAccount.deleteMany({ where: { storeId: store.id } });
  return { ok: true };
}

// ── Account check ───────────────────────────────────────────────────────

async function capabilities(prisma, store) {
  const acct = await account(prisma, store.id);
  const q = (query) => client.search(prisma, store.id, acct, query).catch((err) => ({ error: err }));
  const [cust, billing, conversions, links] = await Promise.all([
    q("SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.auto_tagging_enabled, customer.status, customer.test_account FROM customer LIMIT 1"),
    q("SELECT billing_setup.status FROM billing_setup"),
    q("SELECT conversion_action.id, conversion_action.name, conversion_action.category, conversion_action.status, conversion_action.type, conversion_action.primary_for_goal FROM conversion_action WHERE conversion_action.status = 'ENABLED'"),
    q("SELECT product_link.product_link_id, product_link.type, product_link.merchant_center.merchant_center_id FROM product_link"),
  ]);
  const problems = [];
  const problem = (text, fix, action) => problems.push({ text, fix: fix || null, action: action || null });
  const c = Array.isArray(cust) ? cust[0]?.customer || {} : {};
  if (cust.error) problem(`Couldn't read the Google Ads account: ${cust.error.message}`);
  if (c.status && c.status !== "ENABLED") problem(`The account's status is ${String(c.status).toLowerCase()}.`, "Open Google Ads and finish setting the account up.");
  if (c.testAccount) problem("This is a Google Ads test account — ads never show to real people.", "Choose your real account (Change).");
  if (c.autoTaggingEnabled === false) problem("Auto-tagging is off, so Google can't match clicks to purchases.", "Google Ads ▸ Admin ▸ Account settings ▸ Auto-tagging ▸ on.");
  const billOk = Array.isArray(billing) && billing.some((b) => b.billingSetup?.status === "APPROVED");
  if (Array.isArray(billing) && !billOk) problem("No approved payment setup — Google won't run ads yet.", "Google Ads ▸ Billing ▸ Add a payment method. Google charges your ad spend directly.");
  const convList = Array.isArray(conversions) ? conversions.map((r) => r.conversionAction) : [];
  const purchase = convList.find((x) => x.category === "PURCHASE");
  if (!purchase) problem("No purchase tracking — Google can't count sales or optimise for them.", "Click \"Set up purchase tracking\": Oyklane creates the conversion in Google Ads and adds its tag to your store.", "setup_conversions");
  else if (!acct.conversionLabel) problem("Your purchases aren't sent to Google from this store yet.", "Click \"Set up purchase tracking\" to add the tag to your store.", "setup_conversions");
  const merchants = Array.isArray(links) ? links.filter((l) => l.productLink?.type === "MERCHANT_CENTER").map((l) => String(l.productLink.merchantCenter?.merchantCenterId)) : [];
  if (!merchants.length) problem("Merchant Center isn't linked — Shopping and product ads aren't available.", "Merchant Center ▸ Settings ▸ Linked accounts ▸ Google Ads ▸ link this account (set up Merchant Center in Apps ▸ Google & YouTube first).");
  if (merchants.length && acct.merchantId !== merchants[0]) await prisma.googleAdsAccount.update({ where: { id: acct.id }, data: { merchantId: merchants[0] } });
  return {
    account: { id: acct.customerId, name: c.descriptiveName || acct.customerName, currency: c.currencyCode || acct.currency, timeZone: c.timeZone || acct.timeZone, test: Boolean(c.testAccount), via: acct.loginCustomerId },
    conversions: convList.map((x) => ({ id: String(x.id), name: x.name, category: x.category, primary: x.primaryForGoal })),
    purchaseTracking: Boolean(purchase && acct.conversionLabel),
    merchants,
    problems,
    types: spec.TYPES,
    bidding: spec.BIDDING,
    matchTypes: spec.MATCH_TYPES,
    minDaily: spec.MIN_DAILY,
  };
}

/** Creates a "Purchase" conversion action (or uses the one there), reads its
 * tag, and turns on the purchase event on the storefront. */
async function setupConversions(prisma, store) {
  const acct = await account(prisma, store.id);
  const existing = await client.search(prisma, store.id, acct, "SELECT conversion_action.resource_name, conversion_action.name, conversion_action.category, conversion_action.type, conversion_action.tag_snippets FROM conversion_action WHERE conversion_action.status = 'ENABLED' AND conversion_action.type = 'WEBPAGE'");
  let action = existing.map((r) => r.conversionAction).find((x) => x.category === "PURCHASE");
  if (!action) {
    const r = await client.request(prisma, store.id, `customers/${acct.customerId}/conversionActions:mutate`, {
      method: "POST",
      loginCustomerId: acct.loginCustomerId,
      body: {
        operations: [
          {
            create: {
              name: `${store.name} — purchase (Oyklane)`.slice(0, 100),
              type: "WEBPAGE",
              category: "PURCHASE",
              status: "ENABLED",
              countingType: "MANY_PER_CLICK",
              valueSettings: { defaultValue: 0, alwaysUseDefaultValue: false, defaultCurrencyCode: acct.currency || "INR" },
              clickThroughLookbackWindowDays: 30,
              viewThroughLookbackWindowDays: 1,
              primaryForGoal: true,
            },
          },
        ],
      },
    });
    const name = r.results?.[0]?.resourceName;
    const [row] = await client.search(prisma, store.id, acct, `SELECT conversion_action.resource_name, conversion_action.tag_snippets FROM conversion_action WHERE conversion_action.resource_name = '${name}'`);
    action = row?.conversionAction;
  }
  const snippet = (action?.tagSnippets || []).map((t) => t.eventSnippet || "").join(" ");
  const m = snippet.match(/send_to['"]?\s*:\s*['"](AW-\d+)\/([A-Za-z0-9_-]+)['"]/);
  if (!m) throw new HttpError(502, "Google didn't return the conversion's tag. Try again in a minute.");
  await prisma.googleAdsAccount.update({ where: { id: acct.id }, data: { conversionAction: action.resourceName, conversionTagId: m[1], conversionLabel: m[2] } });
  // The storefront fires it on the order confirmation page (storefront/tracking.js).
  const app = await prisma.app.findUnique({ where: { key: "google-ads" } });
  if (app) {
    const install = await prisma.storeApp.findFirst({ where: { storeId: store.id, appId: app.id } });
    if (install) await prisma.storeApp.update({ where: { id: install.id }, data: { settings: { ...(install.settings || {}), adsConversionId: m[1], adsConversionLabel: m[2] } } });
  }
  return { tagId: m[1], label: m[2] };
}

// ── Results ─────────────────────────────────────────────────────────────

const DURING = { today: "TODAY", yesterday: "YESTERDAY", last_7d: "LAST_7_DAYS", last_14d: "LAST_14_DAYS", last_30d: "LAST_30_DAYS", this_month: "THIS_MONTH", last_month: "LAST_MONTH" };
function dateClause(range = {}) {
  if (range.since && range.until && /^\d{4}-\d{2}-\d{2}$/.test(range.since) && /^\d{4}-\d{2}-\d{2}$/.test(range.until)) return `segments.date BETWEEN '${range.since}' AND '${range.until}'`;
  if (range.preset === "maximum") return `segments.date >= '2015-01-01'`;
  return `segments.date DURING ${DURING[range.preset] || "LAST_7_DAYS"}`;
}
const METRICS = "metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.conversions, metrics.conversions_value, metrics.search_impression_share";

function shape(m = {}) {
  const spend = fromMicros(m.costMicros) || 0;
  const purchases = Number(m.conversions || 0);
  const revenue = Number(m.conversionsValue || 0);
  const clicks = Number(m.clicks || 0);
  const impressions = Number(m.impressions || 0);
  return {
    spend,
    impressions,
    clicks,
    ctr: impressions ? (clicks / impressions) * 100 : 0,
    cpc: clicks ? spend / clicks : null,
    purchases: Math.round(purchases * 100) / 100,
    revenue,
    cpa: purchases ? spend / purchases : null,
    roas: spend ? revenue / spend : null,
    impressionShare: m.searchImpressionShare != null ? Number(m.searchImpressionShare) * 100 : null,
  };
}

const STATUS_LABEL = { ENABLED: "Active", PAUSED: "Paused", REMOVED: "Removed" };
const PRIMARY = { ELIGIBLE: "Running", PAUSED: "Paused", REMOVED: "Removed", ENDED: "Ended", PENDING: "Pending", MISCONFIGURED: "Needs attention", LIMITED: "Limited", LEARNING: "Learning", NOT_ELIGIBLE: "Not running" };

async function campaigns(prisma, store, range) {
  const acct = await account(prisma, store.id);
  const [withMetrics, all] = await Promise.all([
    client.search(prisma, store.id, acct, `SELECT campaign.id, ${METRICS} FROM campaign WHERE campaign.status != 'REMOVED' AND ${dateClause(range)}`),
    client.search(prisma, store.id, acct, "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.primary_status, campaign.primary_status_reasons, campaign.bidding_strategy_type, campaign_budget.amount_micros, campaign_budget.resource_name FROM campaign WHERE campaign.status != 'REMOVED' ORDER BY campaign.id DESC"),
  ]);
  const metrics = Object.fromEntries(withMetrics.map((r) => [String(r.campaign.id), shape(r.metrics)]));
  return all.map((r) => ({
    id: String(r.campaign.id),
    name: r.campaign.name,
    type: r.campaign.advertisingChannelType,
    typeLabel: spec.TYPES[r.campaign.advertisingChannelType]?.label || r.campaign.advertisingChannelType,
    status: r.campaign.status,
    statusLabel: PRIMARY[r.campaign.primaryStatus] || STATUS_LABEL[r.campaign.status] || r.campaign.status,
    reasons: (r.campaign.primaryStatusReasons || []).map((x) => String(x).replace(/_/g, " ").toLowerCase()),
    bidding: r.campaign.biddingStrategyType,
    budget: r.campaignBudget?.amountMicros ? { type: "daily", amount: fromMicros(r.campaignBudget.amountMicros), resource: r.campaignBudget.resourceName } : null,
    results: metrics[String(r.campaign.id)] || shape({}),
  }));
}

/** Ad groups (Search, Display, Shopping) or asset groups (Performance Max). */
async function children(prisma, store, campaignId, range) {
  const acct = await account(prisma, store.id);
  const id = digits(campaignId);
  const [c] = await client.search(prisma, store.id, acct, `SELECT campaign.advertising_channel_type FROM campaign WHERE campaign.id = ${id}`);
  if (c?.campaign?.advertisingChannelType === "PERFORMANCE_MAX") {
    const [rows, mets] = await Promise.all([
      client.search(prisma, store.id, acct, `SELECT asset_group.id, asset_group.name, asset_group.status, asset_group.primary_status, asset_group.ad_strength FROM asset_group WHERE campaign.id = ${id} AND asset_group.status != 'REMOVED'`),
      client.search(prisma, store.id, acct, `SELECT asset_group.id, ${METRICS.replace(", metrics.search_impression_share", "")} FROM asset_group WHERE campaign.id = ${id} AND ${dateClause(range)}`).catch(() => []),
    ]);
    const m = Object.fromEntries(mets.map((r) => [String(r.assetGroup.id), shape(r.metrics)]));
    return rows.map((r) => ({ kind: "assetgroup", id: String(r.assetGroup.id), name: r.assetGroup.name, status: r.assetGroup.status, statusLabel: PRIMARY[r.assetGroup.primaryStatus] || STATUS_LABEL[r.assetGroup.status], strength: r.assetGroup.adStrength ? String(r.assetGroup.adStrength).toLowerCase() : null, results: m[String(r.assetGroup.id)] || shape({}) }));
  }
  const [rows, mets] = await Promise.all([
    client.search(prisma, store.id, acct, `SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.primary_status, ad_group.type, ad_group.cpc_bid_micros FROM ad_group WHERE campaign.id = ${id} AND ad_group.status != 'REMOVED'`),
    client.search(prisma, store.id, acct, `SELECT ad_group.id, ${METRICS.replace(", metrics.search_impression_share", "")} FROM ad_group WHERE campaign.id = ${id} AND ${dateClause(range)}`).catch(() => []),
  ]);
  const m = Object.fromEntries(mets.map((r) => [String(r.adGroup.id), shape(r.metrics)]));
  return rows.map((r) => ({ kind: "adgroup", id: String(r.adGroup.id), name: r.adGroup.name, status: r.adGroup.status, statusLabel: PRIMARY[r.adGroup.primaryStatus] || STATUS_LABEL[r.adGroup.status], cpc: fromMicros(r.adGroup.cpcBidMicros), results: m[String(r.adGroup.id)] || shape({}) }));
}

async function ads(prisma, store, adGroupId, range) {
  const acct = await account(prisma, store.id);
  const id = digits(adGroupId);
  const [rows, mets] = await Promise.all([
    client.search(prisma, store.id, acct, `SELECT ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.status, ad_group_ad.ad_strength, ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_display_ad.headlines, ad_group_ad.policy_summary.approval_status, ad_group_ad.policy_summary.policy_topic_entries FROM ad_group_ad WHERE ad_group.id = ${id} AND ad_group_ad.status != 'REMOVED'`),
    client.search(prisma, store.id, acct, `SELECT ad_group_ad.ad.id, ${METRICS.replace(", metrics.search_impression_share", "")} FROM ad_group_ad WHERE ad_group.id = ${id} AND ${dateClause(range)}`).catch(() => []),
  ]);
  const m = Object.fromEntries(mets.map((r) => [String(r.adGroupAd.ad.id), shape(r.metrics)]));
  return rows.map((r) => {
    const a = r.adGroupAd;
    const heads = a.ad.responsiveSearchAd?.headlines || a.ad.responsiveDisplayAd?.headlines || [];
    const approval = a.policySummary?.approvalStatus;
    return {
      kind: "ad",
      id: `${id}~${a.ad.id}`,
      name: heads.slice(0, 2).map((h) => h.text).join(" | ") || String(a.ad.type).replace(/_/g, " ").toLowerCase(),
      status: a.status,
      statusLabel: approval === "DISAPPROVED" ? "Rejected" : approval === "APPROVED_LIMITED" ? "Approved (limited)" : STATUS_LABEL[a.status],
      rejection: approval && approval !== "APPROVED" ? (a.policySummary?.policyTopicEntries || []).map((p) => String(p.topic).replace(/_/g, " ").toLowerCase()).join(", ") || null : null,
      strength: a.adStrength ? String(a.adStrength).toLowerCase() : null,
      url: a.ad.finalUrls?.[0] || null,
      results: m[String(a.ad.id)] || shape({}),
    };
  });
}

async function searchTerms(prisma, store, campaignId, range) {
  const acct = await account(prisma, store.id);
  const rows = await client.search(prisma, store.id, acct, `SELECT search_term_view.search_term, search_term_view.status, ${METRICS.replace(", metrics.search_impression_share", "")} FROM search_term_view WHERE campaign.id = ${digits(campaignId)} AND ${dateClause(range)} ORDER BY metrics.cost_micros DESC LIMIT 100`);
  return rows.map((r) => ({ term: r.searchTermView.searchTerm, added: r.searchTermView.status, ...shape(r.metrics) }));
}

// ── Changes ─────────────────────────────────────────────────────────────

async function log(prisma, store, user, entry) {
  return prisma.adActivity.create({ data: { storeId: store.id, platform: "google", userId: user?.id || null, userName: user?.name || user?.email || null, source: entry.source || "user", action: entry.action, targetType: entry.targetType || null, targetId: entry.targetId || null, targetName: entry.targetName || null, detail: entry.detail || {}, ok: entry.ok !== false, error: entry.error || null } });
}

const RESOURCE = { campaign: "campaigns", adgroup: "adGroups", ad: "adGroupAds", assetgroup: "assetGroups" };

/** Status, name or daily budget (₹). */
async function update(prisma, store, type, id, patch, user, { source = "user" } = {}) {
  const acct = await account(prisma, store.id);
  if (!RESOURCE[type]) throw new HttpError(404, "Not found");
  const cid = acct.customerId;
  const resourceName = `customers/${cid}/${RESOURCE[type]}/${type === "ad" ? String(id).replace(/[^\d~]/g, "") : digits(id)}`;
  const ops = [];
  const fields = [];
  const obj = { resourceName };
  if (patch.status) {
    obj.status = patch.status === "ACTIVE" || patch.status === "ENABLED" ? "ENABLED" : "PAUSED";
    fields.push("status");
  }
  if (patch.name && type !== "ad") {
    obj.name = String(patch.name).slice(0, 255);
    fields.push("name");
  }
  const op = {};
  const key = { campaign: "campaignOperation", adgroup: "adGroupOperation", ad: "adGroupAdOperation", assetgroup: "assetGroupOperation" }[type];
  if (fields.length) {
    op[key] = { update: obj, updateMask: fields.join(",") };
    ops.push(op);
  }
  let before = null;
  if (patch.budget != null) {
    if (type !== "campaign") throw new HttpError(400, "Budgets are set on the campaign.");
    const [row] = await client.search(prisma, store.id, acct, `SELECT campaign.name, campaign_budget.resource_name, campaign_budget.amount_micros FROM campaign WHERE campaign.id = ${digits(id)}`);
    if (!row) throw new HttpError(404, "Campaign not found");
    before = fromMicros(row.campaignBudget.amountMicros);
    ops.push({ campaignBudgetOperation: { update: { resourceName: row.campaignBudget.resourceName, amountMicros: micros(patch.budget) }, updateMask: "amount_micros" } });
  }
  if (!ops.length) throw new HttpError(400, "Nothing to change.");
  try {
    await client.mutate(prisma, store.id, acct, ops);
  } catch (err) {
    await log(prisma, store, user, { source, action: "update", targetType: type, targetId: String(id), ok: false, error: err.message, detail: patch });
    throw err;
  }
  await log(prisma, store, user, { source, action: patch.status ? (obj.status === "ENABLED" ? "turned_on" : "paused") : patch.budget != null ? "budget_changed" : "edited", targetType: type, targetId: String(id), targetName: patch.name || null, detail: { before: { budget: before }, after: { budget: patch.budget ?? undefined, status: obj.status } } });
  return { ok: true };
}

/** Removing is permanent at Google (results stay in reports). */
async function remove(prisma, store, type, id, user) {
  const acct = await account(prisma, store.id);
  if (!RESOURCE[type]) throw new HttpError(404, "Not found");
  const resourceName = `customers/${acct.customerId}/${RESOURCE[type]}/${type === "ad" ? String(id).replace(/[^\d~]/g, "") : digits(id)}`;
  const key = { campaign: "campaignOperation", adgroup: "adGroupOperation", ad: "adGroupAdOperation", assetgroup: "assetGroupOperation" }[type];
  await client.mutate(prisma, store.id, acct, [{ [key]: { remove: resourceName } }]);
  await log(prisma, store, user, { action: "archived", targetType: type, targetId: String(id) });
  return { ok: true };
}

// ── Targeting ───────────────────────────────────────────────────────────

async function searchLocations(prisma, store, q) {
  const acct = await account(prisma, store.id);
  const r = await client.request(prisma, store.id, "geoTargetConstants:suggest", { method: "POST", loginCustomerId: acct.loginCustomerId, body: { locale: "en", countryCode: "IN", locationNames: { names: [String(q).slice(0, 80)] } } });
  return (r.geoTargetConstantSuggestions || []).map((s) => ({ id: String(s.geoTargetConstant.id), name: s.geoTargetConstant.name, type: s.geoTargetConstant.targetType, label: s.geoTargetConstant.canonicalName || s.geoTargetConstant.name, reach: s.reach ? Number(s.reach) : null }));
}

let languagesCache = null;
async function languages(prisma, store) {
  if (languagesCache) return languagesCache;
  const acct = await account(prisma, store.id);
  const rows = await client.search(prisma, store.id, acct, "SELECT language_constant.id, language_constant.name, language_constant.code FROM language_constant WHERE language_constant.targetable = TRUE");
  languagesCache = rows.map((r) => ({ id: String(r.languageConstant.id), name: r.languageConstant.name, code: r.languageConstant.code })).sort((a, b) => a.name.localeCompare(b.name));
  return languagesCache;
}

/** Keyword Planner ideas from a few words and/or the store's page. */
async function keywordIdeas(prisma, store, { seeds = [], url, locations = [], language } = {}) {
  const acct = await account(prisma, store.id);
  const body = {
    language: `languageConstants/${digits(language) || "1000"}`,
    geoTargetConstants: (locations.length ? locations : [{ id: "2356" }]).map((l) => `geoTargetConstants/${digits(l.id || l)}`),
    includeAdultKeywords: false,
    keywordPlanNetwork: "GOOGLE_SEARCH",
  };
  const words = seeds.map((s) => String(s).trim()).filter(Boolean).slice(0, 10);
  if (words.length && url) body.keywordAndUrlSeed = { keywords: words, url };
  else if (words.length) body.keywordSeed = { keywords: words };
  else if (url) body.urlSeed = { url };
  else throw new HttpError(400, "Give a few words or a page of your store.");
  const r = await client.request(prisma, store.id, `customers/${acct.customerId}:generateKeywordIdeas`, { method: "POST", loginCustomerId: acct.loginCustomerId, body });
  return (r.results || []).slice(0, 80).map((x) => ({
    text: x.text,
    searches: x.keywordIdeaMetrics?.avgMonthlySearches ? Number(x.keywordIdeaMetrics.avgMonthlySearches) : null,
    competition: x.keywordIdeaMetrics?.competition ? String(x.keywordIdeaMetrics.competition).toLowerCase() : null,
    lowBid: fromMicros(x.keywordIdeaMetrics?.lowTopOfPageBidMicros),
    highBid: fromMicros(x.keywordIdeaMetrics?.highTopOfPageBidMicros),
  }));
}

// ── Images ──────────────────────────────────────────────────────────────

/** JPEG/PNG pixel size from the header. */
function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      const l = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      i += 2 + l;
    }
  }
  return null;
}

/** Which Google image slots an image fits (by shape and size). */
function slots(w, h) {
  if (!w || !h) return [];
  const r = w / h;
  const out = [];
  if (Math.abs(r - 1.91) < 0.05 && w >= 600 && h >= 314) out.push("landscape");
  if (Math.abs(r - 1) < 0.02 && w >= 300) out.push("square");
  if (Math.abs(r - 0.8) < 0.02 && w >= 480 && h >= 600) out.push("portrait");
  if (Math.abs(r - 1) < 0.02 && w >= 128) out.push("logo");
  return out;
}

async function uploadImage(prisma, store, { buffer, mime, name }) {
  const acct = await account(prisma, store.id);
  if (!/^image\/(jpeg|png|gif)$/.test(mime)) throw new HttpError(400, "Upload a JPG or PNG image.");
  if (buffer.length > 5 * 1024 * 1024) throw new HttpError(400, "Google allows images up to 5 MB.");
  const size = imageSize(buffer);
  const fits = slots(size?.width, size?.height);
  if (size && !fits.length) throw new HttpError(400, `This image is ${size.width}×${size.height}. Google needs landscape 1.91:1 (e.g. 1200×628), square 1:1 (e.g. 1200×1200) or portrait 4:5 (e.g. 960×1200).`);
  const r = await client.request(prisma, store.id, `customers/${acct.customerId}/assets:mutate`, {
    method: "POST",
    loginCustomerId: acct.loginCustomerId,
    body: { operations: [{ create: { name: `${String(name || "image").slice(0, 80)} ${Date.now()}`, type: "IMAGE", imageAsset: { data: buffer.toString("base64") } } }] },
  });
  const resourceName = r.results?.[0]?.resourceName;
  if (!resourceName) throw new HttpError(502, "Google didn't confirm the upload.");
  // A copy in the store's own files, to show it in the library.
  const preview = await require("../uploads/service").saveUpload(prisma, store.id, { filename: name, buffer }).catch(() => null);
  return prisma.adMedia.create({ data: { storeId: store.id, platform: "google", adAccountId: acct.customerId, kind: "image", name: String(name || "image").slice(0, 120), hash: resourceName, previewUrl: preview?.url || null, width: size?.width || null, height: size?.height || null, bytes: buffer.length } });
}

async function library(prisma, store) {
  const acct = await account(prisma, store.id);
  const rows = await prisma.adMedia.findMany({ where: { storeId: store.id, platform: "google", adAccountId: acct.customerId }, orderBy: { createdAt: "desc" }, take: 200 });
  return rows.map((r) => ({ ...r, fits: slots(r.width, r.height) }));
}

// ── Google's own recommendations ────────────────────────────────────────

const REC_LABEL = {
  KEYWORD: "Add keywords Google suggests",
  CAMPAIGN_BUDGET: "Raise a budget that's limiting results",
  SITELINK_ASSET: "Add sitelinks",
  CALLOUT_ASSET: "Add callouts",
  RESPONSIVE_SEARCH_AD: "Add a responsive search ad",
  RESPONSIVE_SEARCH_AD_IMPROVE_AD_STRENGTH: "Improve an ad's strength",
  MAXIMIZE_CONVERSIONS_OPT_IN: "Bid for purchases",
  TARGET_CPA_OPT_IN: "Set a target cost per purchase",
  USE_BROAD_MATCH_KEYWORD: "Use broad match keywords",
  IMPROVE_PERFORMANCE_MAX_AD_STRENGTH: "Improve a Performance Max asset group",
};

async function googleRecommendations(prisma, store) {
  const acct = await account(prisma, store.id);
  const rows = await client.search(prisma, store.id, acct, "SELECT recommendation.resource_name, recommendation.type, recommendation.campaign, recommendation.impact, recommendation.dismissed FROM recommendation WHERE recommendation.dismissed = FALSE LIMIT 30").catch(() => []);
  return rows.map((r) => {
    const x = r.recommendation;
    const base = x.impact?.baseMetrics || {};
    const pot = x.impact?.potentialMetrics || {};
    const delta = (k) => (pot[k] != null && base[k] != null ? Number(pot[k]) - Number(base[k]) : null);
    return { resourceName: x.resourceName, type: x.type, label: REC_LABEL[x.type] || String(x.type).replace(/_/g, " ").toLowerCase(), campaign: x.campaign || null, extraClicks: delta("clicks"), extraConversions: delta("conversions"), extraCost: delta("costMicros") != null ? delta("costMicros") / 1e6 : null };
  });
}

async function actOnGoogleRecommendation(prisma, store, { resourceName, action }, user) {
  const acct = await account(prisma, store.id);
  if (!String(resourceName).startsWith(`customers/${acct.customerId}/recommendations/`)) throw new HttpError(400, "Unknown recommendation.");
  const path = `customers/${acct.customerId}/recommendations:${action === "apply" ? "apply" : "dismiss"}`;
  const body = action === "apply" ? { operations: [{ resourceName }] } : { operations: [{ resourceName }] };
  await client.request(prisma, store.id, path, { method: "POST", loginCustomerId: acct.loginCustomerId, body });
  await log(prisma, store, user, { source: "recommendation", action: action === "apply" ? "google_recommendation_applied" : "google_recommendation_dismissed", targetType: "recommendation", targetId: resourceName });
  return { ok: true };
}

// ── A new Google Ads account, made from Oyklane (like Shopify does) ──
// Oyklane's own Google Ads manager account (Super admin ▸ Integrations)
// creates it under itself and invites the seller's email as its admin.
const MANAGER_SETTING = "google-ads-manager";

async function platformManager(prisma) {
  return (await prisma.platformSetting.findUnique({ where: { key: MANAGER_SETTING } }).catch(() => null))?.value || null;
}

async function createAccount(prisma, store, { name, email }) {
  const mgr = await platformManager(prisma);
  if (!mgr?.managerId || !mgr.storeId) throw new HttpError(400, "Oyklane can't create Google Ads accounts yet — create one at ads.google.com instead.", { reason: "no_manager" });
  const body = {
    customerClient: { descriptiveName: String(name || store.name).slice(0, 120), currencyCode: store.currency || "INR", timeZone: store.timezone || "Asia/Kolkata" },
    emailAddress: email,
    accessRole: "ADMIN",
  };
  const r = await client.request(prisma, mgr.storeId, `customers/${client.digits(mgr.managerId)}:createCustomerClient`, { method: "POST", body, loginCustomerId: mgr.managerId });
  const customerId = String(r.resourceName || "").split("/")[1] || null;
  const created = { customerId, email, at: new Date().toISOString() };
  const install = await prisma.storeApp.findFirst({ where: { storeId: store.id, app: { key: "google-ads" } }, select: { id: true, settings: true } });
  if (install) await prisma.storeApp.update({ where: { id: install.id }, data: { settings: { ...(install.settings || {}), createdAccount: created } } });
  return { ...created, invitationLink: r.invitationLink || null };
}

module.exports = {
  platformManager,
  createAccount,
  MANAGER_SETTING, account, accessible, choose, disconnect, capabilities, setupConversions, campaigns, children, ads, searchTerms, update, remove, searchLocations, languages, keywordIdeas, uploadImage, library, googleRecommendations, actOnGoogleRecommendation, log, shape, dateClause, METRICS };

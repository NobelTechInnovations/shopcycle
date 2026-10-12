const { HttpError } = require("@shopcycle/utils");
const meta = require("../meta/service");
const repository = require("../meta/repository");
const spec = require("./spec");

/**
 * The Ads Manager's live view of the seller's ad account: what it can do,
 * campaigns → ad sets → ads with results, edits, copies, targeting search,
 * audience size, media and previews. Meta is the source of truth for all
 * of it — nothing here is cached as if it were Meta's answer.
 */

async function connection(prisma, storeId) {
  const conn = await repository.findByStore(prisma, storeId);
  if (!conn) throw new HttpError(400, "Connect Facebook first.", { reason: "not_connected" });
  if (!conn.adAccountId) throw new HttpError(400, "Choose your ad account first.", { reason: "no_ad_account" });
  return conn;
}
const g = (conn, path, opts = {}) => meta.graphRequest(path, { token: conn.accessToken, ...opts });

const ACCOUNT_STATUS = { 1: "active", 2: "disabled", 3: "unsettled", 7: "pending_risk_review", 8: "pending_settlement", 9: "in_grace_period", 100: "pending_closure", 101: "closed", 201: "any_active", 202: "any_closed" };

/** What this ad account and login can do — shown up front, so a seller
 * learns about a missing Pixel or permission before building a campaign. */
async function capabilities(prisma, store) {
  const conn = await connection(prisma, store.id);
  const out = { adAccount: null, pages: [], instagramAccounts: [], pixels: [], audiences: [], permissions: [], problems: [], defaults: { pageId: conn.pageId || null, instagramId: conn.instagramAccountId || null } };
  const problem = (text, fix) => out.problems.push({ text, fix: fix || null });
  const [acct, perms, pages, pixels, audiences, igs] = await Promise.allSettled([
    g(conn, `/${conn.adAccountId}`, { params: { fields: "id,name,currency,timezone_name,account_status,disable_reason,amount_spent,spend_cap,balance,funding_source_details,business" } }),
    g(conn, "/me/permissions"),
    g(conn, "/me/accounts", { params: { fields: "id,name,picture{url},instagram_business_account{id,username,profile_picture_url},whatsapp_number", limit: 50 } }),
    g(conn, `/${conn.adAccountId}/adspixels`, { params: { fields: "id,name,last_fired_time,is_unavailable", limit: 50 } }),
    g(conn, `/${conn.adAccountId}/customaudiences`, { params: { fields: "id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound,delivery_status,operation_status", limit: 100 } }),
    g(conn, `/${conn.adAccountId}/instagram_accounts`, { params: { fields: "id,username,profile_pic", limit: 25 } }),
  ]);
  if (acct.status === "fulfilled") {
    const a = acct.value;
    out.adAccount = {
      id: a.id,
      name: a.name,
      currency: a.currency,
      timezone: a.timezone_name,
      status: ACCOUNT_STATUS[a.account_status] || String(a.account_status),
      amountSpent: Number(a.amount_spent || 0) / 100,
      spendCap: a.spend_cap ? Number(a.spend_cap) / 100 : null,
      hasPaymentMethod: Boolean(a.funding_source_details),
    };
    if (a.account_status !== 1) problem(`Your ad account is ${out.adAccount.status.replace(/_/g, " ")}, so ads can't run.`, "Open Meta Ads Manager ▸ Account overview to see why and fix it.");
    if (!a.funding_source_details) problem("No payment method on your ad account.", "Add one in Meta Ads Manager ▸ Billing & payments. Meta charges your ad spend there, not Oyklane.");
    if (a.currency && a.currency !== "INR") problem(`Your ad account uses ${a.currency}. Budgets you enter here are in ${a.currency}.`);
  } else {
    problem(`Couldn't read the ad account: ${acct.reason.message}`);
  }
  if (perms.status === "fulfilled") {
    out.permissions = (perms.value.data || []).filter((p) => p.status === "granted").map((p) => p.permission);
    if (!out.permissions.includes("ads_management")) problem("Creating and changing ads needs the ads_management permission.", "Reconnect Facebook and allow managing your ads. If it isn't offered, Oyklane's Meta app is still waiting for Meta's App Review for it.");
    if (!out.permissions.includes("ads_read")) problem("Reading results needs the ads_read permission.", "Reconnect Facebook and allow it.");
  }
  if (pages.status === "fulfilled") {
    out.pages = (pages.value.data || []).map((p) => ({
      id: p.id,
      name: p.name,
      picture: p.picture?.data?.url || null,
      instagram: p.instagram_business_account ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username, picture: p.instagram_business_account.profile_picture_url || null } : null,
      whatsapp: p.whatsapp_number || null,
    }));
    if (!out.pages.length) problem("No Facebook Page found.", "Ads run from a Facebook Page. Create one, or reconnect Facebook and allow your Pages.");
  }
  // Instagram identities: each Page's linked account plus any connected to the ad account.
  const igMap = new Map(out.pages.filter((p) => p.instagram).map((p) => [p.instagram.id, { ...p.instagram, pageId: p.id }]));
  if (igs.status === "fulfilled") for (const ig of igs.value.data || []) if (!igMap.has(ig.id)) igMap.set(ig.id, { id: ig.id, username: ig.username, picture: ig.profile_pic || null, pageId: null });
  out.instagramAccounts = [...igMap.values()];
  if (!out.instagramAccounts.length && out.pages.length) problem("No Instagram account linked.", "Link your Instagram professional account to your Facebook Page (Page settings ▸ Linked accounts), then reconnect — otherwise Instagram ads show your Page's name.");
  if (pixels.status === "fulfilled") {
    out.pixels = (pixels.value.data || []).filter((p) => !p.is_unavailable).map((p) => ({ id: p.id, name: p.name, lastFired: p.last_fired_time || null, active: Boolean(p.last_fired_time && Date.now() - new Date(p.last_fired_time).getTime() < 7 * 86400e3) }));
    if (!out.pixels.length) problem("No Meta Pixel on this ad account.", "Without it, Meta can't optimise for purchases or report sales. Set it up in Apps ▸ Meta Pixel.");
    else if (!out.pixels.some((p) => p.active)) problem("Your Pixel hasn't recorded anything in the last 7 days.", "Check Apps ▸ Meta Pixel is installed on your store, then visit your store once to test.");
  }
  if (audiences.status === "fulfilled") {
    out.audiences = (audiences.value.data || []).map((a) => ({
      id: a.id,
      name: a.name,
      type: a.subtype,
      size: a.approximate_count_lower_bound > 0 ? `${a.approximate_count_lower_bound.toLocaleString("en-IN")}–${a.approximate_count_upper_bound.toLocaleString("en-IN")}` : "Below 1,000",
      ready: a.delivery_status?.code === 200,
      note: a.delivery_status?.code !== 200 ? a.delivery_status?.description || null : null,
    }));
  }
  return { ...out, objectives: spec.OBJECTIVES, goals: spec.GOALS, bidStrategies: spec.BID_STRATEGIES, ctas: spec.CTAS, specialCategories: spec.SPECIAL_CATEGORIES, placements: spec.PLACEMENTS, minDaily: spec.MIN_DAILY };
}

// ── Results ─────────────────────────────────────────────────────────────

const INSIGHT_FIELDS = "spend,impressions,reach,frequency,clicks,inline_link_clicks,ctr,inline_link_click_ctr,cpc,cpm,actions,action_values,purchase_roas,cost_per_action_type";
const PURCHASE = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];
const LEAD = ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped"];
const CHATS = ["onsite_conversion.messaging_conversation_started_7d"];

/** The first of these action types Meta reported (they overlap — counting
 * them all would double-count). */
function pickAction(list, types) {
  for (const t of types) {
    const hit = (list || []).find((a) => a.action_type === t);
    if (hit) return Number(hit.value || 0);
  }
  return 0;
}

/** One insights row → plain numbers. */
function shapeInsights(row) {
  if (!row) return null;
  const spend = Number(row.spend || 0);
  const purchases = pickAction(row.actions, PURCHASE);
  const revenue = pickAction(row.action_values, PURCHASE);
  const leads = pickAction(row.actions, LEAD);
  const chats = pickAction(row.actions, CHATS);
  const linkClicks = Number(row.inline_link_clicks || 0);
  const impressions = Number(row.impressions || 0);
  return {
    spend,
    impressions,
    reach: Number(row.reach || 0),
    frequency: Number(row.frequency || 0),
    clicks: linkClicks,
    ctr: impressions ? (linkClicks / impressions) * 100 : 0,
    cpc: linkClicks ? spend / linkClicks : null,
    cpm: impressions ? (spend / impressions) * 1000 : null,
    purchases,
    revenue,
    cpa: purchases ? spend / purchases : null,
    roas: spend ? revenue / spend : null,
    leads,
    chats,
    costPerChat: chats ? spend / chats : null,
  };
}

/** Meta's date presets, or since/until (YYYY-MM-DD). */
function timeParams(range = {}) {
  if (range.since && range.until && /^\d{4}-\d{2}-\d{2}$/.test(range.since) && /^\d{4}-\d{2}-\d{2}$/.test(range.until)) return { time_range: { since: range.since, until: range.until } };
  const preset = ["today", "yesterday", "last_7d", "last_14d", "last_30d", "last_90d", "this_month", "last_month", "maximum"].includes(range.preset) ? range.preset : "last_7d";
  return { date_preset: preset };
}

/** Insights for many objects of one level, keyed by id. */
async function insightsBy(conn, level, range, filtering) {
  const params = { level, fields: `${level}_id,${INSIGHT_FIELDS}`, limit: 500, ...timeParams(range), action_attribution_windows: ["7d_click", "1d_view"] };
  if (filtering) params.filtering = filtering;
  const r = await g(conn, `/${conn.adAccountId}/insights`, { params });
  return Object.fromEntries((r.data || []).map((row) => [row[`${level}_id`], shapeInsights(row)]));
}

const EFFECTIVE = (s) =>
  ({
    ACTIVE: "Active",
    PAUSED: "Paused",
    DELETED: "Deleted",
    ARCHIVED: "Archived",
    IN_PROCESS: "Processing",
    WITH_ISSUES: "Has issues",
    PENDING_REVIEW: "In review",
    DISAPPROVED: "Rejected",
    PREAPPROVED: "Approved — waiting to start",
    PENDING_BILLING_INFO: "Needs payment method",
    CAMPAIGN_PAUSED: "Campaign paused",
    ADSET_PAUSED: "Ad set paused",
  })[s] || s;

/** Campaigns with results for the period. */
async function campaigns(prisma, store, range) {
  const conn = await connection(prisma, store.id);
  const [list, ins] = await Promise.all([
    g(conn, `/${conn.adAccountId}/campaigns`, { params: { fields: "id,name,objective,status,effective_status,daily_budget,lifetime_budget,bid_strategy,start_time,stop_time,created_time,issues_info,special_ad_categories", limit: 200, filtering: [{ field: "effective_status", operator: "NOT_IN", value: ["DELETED", "ARCHIVED"] }] } }),
    insightsBy(conn, "campaign", range).catch(() => ({})),
  ]);
  return (list.data || []).map((c) => ({
    id: c.id,
    name: c.name,
    objective: c.objective,
    objectiveLabel: spec.OBJECTIVES[c.objective]?.label || c.objective,
    status: c.status,
    effectiveStatus: c.effective_status,
    statusLabel: EFFECTIVE(c.effective_status),
    budget: c.daily_budget ? { type: "daily", amount: Number(c.daily_budget) / 100 } : c.lifetime_budget ? { type: "lifetime", amount: Number(c.lifetime_budget) / 100 } : null,
    bidStrategy: c.bid_strategy || null,
    start: c.start_time || null,
    end: c.stop_time || null,
    created: c.created_time,
    issues: (c.issues_info || []).map((i) => i.error_summary || i.error_message),
    results: ins[c.id] || shapeInsights({}),
  }));
}

async function adSets(prisma, store, campaignId, range) {
  const conn = await connection(prisma, store.id);
  const [list, ins] = await Promise.all([
    g(conn, `/${campaignId}/adsets`, { params: { fields: "id,name,status,effective_status,daily_budget,lifetime_budget,optimization_goal,destination_type,start_time,end_time,targeting,learning_stage_info,issues_info,bid_amount,promoted_object", limit: 200 } }),
    insightsBy(conn, "adset", range, [{ field: "campaign.id", operator: "EQUAL", value: campaignId }]).catch(() => ({})),
  ]);
  return (list.data || [])
    .filter((s) => !["DELETED", "ARCHIVED"].includes(s.effective_status))
    .map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      effectiveStatus: s.effective_status,
      statusLabel: EFFECTIVE(s.effective_status),
      budget: s.daily_budget ? { type: "daily", amount: Number(s.daily_budget) / 100 } : s.lifetime_budget ? { type: "lifetime", amount: Number(s.lifetime_budget) / 100 } : null,
      goal: Object.entries(spec.GOALS).find(([, x]) => x.optimization === s.optimization_goal && (!x.destination || x.destination === s.destination_type))?.[1]?.label || s.optimization_goal,
      start: s.start_time || null,
      end: s.end_time || null,
      learning: s.learning_stage_info?.status || null,
      audience: describeTargeting(s.targeting),
      issues: (s.issues_info || []).map((i) => i.error_summary || i.error_message),
      results: ins[s.id] || shapeInsights({}),
    }));
}

async function ads(prisma, store, adSetId, range) {
  const conn = await connection(prisma, store.id);
  const [list, ins] = await Promise.all([
    g(conn, `/${adSetId}/ads`, { params: { fields: "id,name,status,effective_status,ad_review_feedback,issues_info,creative{id,thumbnail_url,title,body,object_story_spec}", limit: 200 } }),
    insightsBy(conn, "ad", range, [{ field: "adset.id", operator: "EQUAL", value: adSetId }]).catch(() => ({})),
  ]);
  return (list.data || [])
    .filter((a) => !["DELETED", "ARCHIVED"].includes(a.effective_status))
    .map((a) => ({
      id: a.id,
      name: a.name,
      status: a.status,
      effectiveStatus: a.effective_status,
      statusLabel: EFFECTIVE(a.effective_status),
      thumbnail: a.creative?.thumbnail_url || null,
      headline: a.creative?.title || a.creative?.object_story_spec?.link_data?.name || null,
      text: a.creative?.body || a.creative?.object_story_spec?.link_data?.message || null,
      // Why Meta rejected it, in Meta's words.
      rejection: a.ad_review_feedback?.global ? Object.values(a.ad_review_feedback.global).join(" ") : null,
      issues: (a.issues_info || []).map((i) => i.error_summary || i.error_message),
      results: ins[a.id] || shapeInsights({}),
    }));
}

function describeTargeting(t) {
  if (!t) return "";
  const where = [...(t.geo_locations?.countries || []), ...(t.geo_locations?.regions || []).map((r) => r.name), ...(t.geo_locations?.cities || []).map((c) => c.name)].filter(Boolean);
  const age = t.age_min || t.age_max ? `${t.age_min || 18}–${t.age_max || 65}${t.age_max === 65 ? "+" : ""}` : "18–65+";
  const gender = t.genders?.length === 1 ? (t.genders[0] === 1 ? "men" : "women") : "everyone";
  const interests = (t.flexible_spec || []).flatMap((f) => (f.interests || []).map((i) => i.name));
  return [where.slice(0, 3).join(", ") + (where.length > 3 ? ` +${where.length - 3}` : ""), `${gender}, ${age}`, interests.length ? `interested in ${interests.slice(0, 3).join(", ")}${interests.length > 3 ? "…" : ""}` : null, t.targeting_automation?.advantage_audience ? "Advantage+ audience" : null].filter(Boolean).join(" · ");
}

// ── Changes ─────────────────────────────────────────────────────────────

async function log(prisma, store, user, entry) {
  return prisma.adActivity.create({ data: { storeId: store.id, userId: user?.id || null, userName: user?.name || user?.email || null, source: entry.source || "user", action: entry.action, targetType: entry.targetType || null, targetId: entry.targetId || null, targetName: entry.targetName || null, detail: entry.detail || {}, ok: entry.ok !== false, error: entry.error || null } });
}

/** Status, name, budget or end date of a campaign, ad set or ad. Budget
 * arrives in rupees. The object must belong to the store's ad account. */
async function update(prisma, store, type, id, patch, user, { source = "user" } = {}) {
  const conn = await connection(prisma, store.id);
  const fields = type === "ad" ? "id,name,account_id,status" : "id,name,account_id,status,daily_budget,lifetime_budget";
  const current = await g(conn, `/${id}`, { params: { fields } });
  if (`act_${current.account_id}` !== conn.adAccountId) throw new HttpError(404, "That isn't in your ad account.");
  const body = {};
  if (patch.status) body.status = patch.status === "ACTIVE" ? "ACTIVE" : "PAUSED";
  if (patch.name) body.name = String(patch.name).slice(0, 400);
  if (patch.budget != null && type !== "ad") {
    if (current.daily_budget) body.daily_budget = spec.paise(patch.budget);
    else if (current.lifetime_budget) body.lifetime_budget = spec.paise(patch.budget);
    else throw new HttpError(400, type === "adset" ? "This ad set's budget is set on its campaign." : "This campaign's budgets are set on its ad sets.");
  }
  if (patch.endTime !== undefined && type === "adset") body.end_time = patch.endTime ? new Date(patch.endTime).toISOString() : 0;
  if (!Object.keys(body).length) throw new HttpError(400, "Nothing to change.");
  try {
    await g(conn, `/${id}`, { method: "POST", body });
  } catch (err) {
    await log(prisma, store, user, { source, action: "update", targetType: type, targetId: id, targetName: current.name, detail: body, ok: false, error: err.message });
    throw err;
  }
  const before = { status: current.status, budget: current.daily_budget ? Number(current.daily_budget) / 100 : current.lifetime_budget ? Number(current.lifetime_budget) / 100 : null };
  await log(prisma, store, user, { source, action: body.status ? (body.status === "ACTIVE" ? "turned_on" : "paused") : body.daily_budget || body.lifetime_budget ? "budget_changed" : "edited", targetType: type, targetId: id, targetName: body.name || current.name, detail: { before, after: { ...body, budget: patch.budget ?? undefined } } });
  return { ok: true };
}

/** A copy (paused), with everything inside it for campaigns and ad sets. */
async function duplicate(prisma, store, type, id, user) {
  const conn = await connection(prisma, store.id);
  const current = await g(conn, `/${id}`, { params: { fields: "id,name,account_id" } });
  if (`act_${current.account_id}` !== conn.adAccountId) throw new HttpError(404, "That isn't in your ad account.");
  const body = { status_option: "PAUSED", rename_options: { rename_suffix: " — copy" } };
  if (type !== "ad") body.deep_copy = true;
  const r = await g(conn, `/${id}/copies`, { method: "POST", body });
  const newId = r.copied_campaign_id || r.copied_adset_id || r.copied_ad_id || r.ad_object_ids?.[0]?.copied_id || null;
  await log(prisma, store, user, { action: "duplicated", targetType: type, targetId: id, targetName: current.name, detail: { copy: newId } });
  return { id: newId };
}

/** Deleting is archiving at Meta: results stay in reports. */
async function archive(prisma, store, type, id, user) {
  const conn = await connection(prisma, store.id);
  const current = await g(conn, `/${id}`, { params: { fields: "id,name,account_id" } });
  if (`act_${current.account_id}` !== conn.adAccountId) throw new HttpError(404, "That isn't in your ad account.");
  await g(conn, `/${id}`, { method: "POST", body: { status: "ARCHIVED" } });
  await log(prisma, store, user, { action: "archived", targetType: type, targetId: id, targetName: current.name });
  return { ok: true };
}

// ── Targeting ───────────────────────────────────────────────────────────

async function searchTargeting(prisma, store, { type, q }) {
  const conn = await connection(prisma, store.id);
  const query = String(q || "").trim().slice(0, 100);
  if (type === "location") {
    if (query.length < 2) return [];
    const r = await g(conn, "/search", { params: { type: "adgeolocation", q: query, location_types: ["country", "region", "city"], limit: 15 } });
    return (r.data || []).map((x) => ({ key: x.key, name: x.name, type: x.type, country: x.country_code, region: x.region || null, label: [x.name, x.region, x.country_name].filter(Boolean).join(", ") }));
  }
  if (type === "interest") {
    if (query.length < 2) return [];
    const r = await g(conn, "/search", { params: { type: "adinterest", q: query, limit: 20 } });
    return (r.data || []).map((x) => ({ id: x.id, name: x.name, size: x.audience_size_lower_bound ? `${(x.audience_size_lower_bound / 1e6).toFixed(1)}M–${(x.audience_size_upper_bound / 1e6).toFixed(1)}M` : null, path: (x.path || []).join(" › ") }));
  }
  if (type === "locale") {
    const r = await g(conn, "/search", { params: { type: "adlocale", q: query || "", limit: 30 } });
    return (r.data || []).map((x) => ({ key: x.key, name: x.name }));
  }
  throw new HttpError(400, "Unknown search.");
}

/** Meta's estimate of how many people an ad set could reach. */
async function audienceSize(prisma, store, { targeting: t, goal, specialAdCategories }) {
  const conn = await connection(prisma, store.id);
  const g0 = spec.GOALS[goal] || spec.GOALS.landing_page_views;
  const r = await g(conn, `/${conn.adAccountId}/delivery_estimate`, { params: { targeting_spec: spec.targeting(t, specialAdCategories || []), optimization_goal: g0.optimization } });
  const e = r.data?.[0];
  if (!e) return null;
  return {
    lower: e.estimate_mau_lower_bound ?? null,
    upper: e.estimate_mau_upper_bound ?? null,
    ready: e.estimate_ready !== false,
    dailyResults: e.daily_outcomes_curve?.length ? e.daily_outcomes_curve[Math.min(e.daily_outcomes_curve.length - 1, 10)] : null,
  };
}

// ── Media ───────────────────────────────────────────────────────────────

const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };
const VIDEO_TYPES = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };

/** Reads a JPEG/PNG's pixel size from its header (no image library). */
function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

/** Uploads an image or video to the ad account and adds it to the library.
 * Problems Meta would reject later (size, shape, type) are caught first. */
async function uploadMedia(prisma, store, { buffer, mime, name }) {
  const conn = await connection(prisma, store.id);
  const filename = String(name || "upload").slice(0, 120);
  if (IMAGE_TYPES[mime]) {
    if (buffer.length > 30 * 1024 * 1024) throw new HttpError(400, "Images must be under 30 MB.");
    const size = imageSize(buffer);
    if (size && (size.width < 600 || size.height < 600)) throw new HttpError(400, `This image is ${size.width}×${size.height}px. Use at least 1080×1080 for sharp ads (600px minimum).`);
    const form = new FormData();
    form.append("filename", new Blob([buffer], { type: mime }), filename);
    const r = await g(conn, `/${conn.adAccountId}/adimages`, { method: "POST", form });
    const img = Object.values(r.images || {})[0];
    if (!img?.hash) throw new HttpError(502, "Meta didn't confirm the upload. Try again.");
    const warn = size && Math.abs(size.width / size.height - 1) > 0.25 && Math.abs(size.width / size.height - 0.8) > 0.1 && Math.abs(size.width / size.height - 1.91) > 0.15 ? "Unusual shape — square (1:1) or portrait (4:5) work best." : null;
    const row = await prisma.adMedia.create({ data: { storeId: store.id, adAccountId: conn.adAccountId, kind: "image", name: filename, hash: img.hash, previewUrl: img.url || null, width: size?.width || null, height: size?.height || null, bytes: buffer.length } });
    return { ...row, warning: warn };
  }
  if (VIDEO_TYPES[mime]) {
    if (buffer.length > 200 * 1024 * 1024) throw new HttpError(400, "Videos must be under 200 MB here. Compress it, or upload larger videos in Meta Ads Manager.");
    const form = new FormData();
    form.append("source", new Blob([buffer], { type: mime }), filename);
    form.append("name", filename);
    const r = await g(conn, `/${conn.adAccountId}/advideos`, { method: "POST", form });
    if (!r.id) throw new HttpError(502, "Meta didn't confirm the upload. Try again.");
    return prisma.adMedia.create({ data: { storeId: store.id, adAccountId: conn.adAccountId, kind: "video", name: filename, videoId: r.id, status: "processing", bytes: buffer.length } });
  }
  throw new HttpError(400, "Upload a JPG, PNG or WebP image, or an MP4 or MOV video.");
}

/** The library — videos still processing at Meta are checked as it's opened. */
async function library(prisma, store) {
  const conn = await connection(prisma, store.id);
  const rows = await prisma.adMedia.findMany({ where: { storeId: store.id, platform: "meta", adAccountId: conn.adAccountId }, orderBy: { createdAt: "desc" }, take: 200 });
  for (const v of rows.filter((r) => r.kind === "video" && r.status === "processing")) {
    try {
      const info = await g(conn, `/${v.videoId}`, { params: { fields: "status,picture,length" } });
      const st = info.status?.video_status;
      if (st === "ready" || st === "error") {
        const data = { status: st === "ready" ? "ready" : "error", previewUrl: info.picture || null, error: st === "error" ? info.status?.processing_progress?.error || "Meta couldn't process this video." : null };
        await prisma.adMedia.update({ where: { id: v.id }, data });
        Object.assign(v, data);
      }
    } catch {
      // still processing or temporarily unreadable
    }
  }
  return rows;
}

async function removeMedia(prisma, store, id) {
  await prisma.adMedia.deleteMany({ where: { id, storeId: store.id, platform: "meta" } });
  return { ok: true };
}

/** Meta-rendered previews of one ad, per placement. */
const PREVIEW_FORMATS = { facebook_feed: "MOBILE_FEED_STANDARD", instagram_feed: "INSTAGRAM_STANDARD", instagram_story: "INSTAGRAM_STORY", facebook_story: "FACEBOOK_STORY_MOBILE", instagram_reels: "INSTAGRAM_REELS", desktop_feed: "DESKTOP_FEED_STANDARD" };
async function previews(prisma, store, { ad, goal, formats }) {
  const conn = await connection(prisma, store.id);
  const creative = { object_story_spec: spec.storySpec(ad, spec.GOALS[goal]) };
  const want = (formats || Object.keys(PREVIEW_FORMATS)).filter((f) => PREVIEW_FORMATS[f]).slice(0, 6);
  const out = {};
  await Promise.all(
    want.map(async (f) => {
      try {
        const r = await g(conn, `/${conn.adAccountId}/generatepreviews`, { params: { creative, ad_format: PREVIEW_FORMATS[f] } });
        const html = r.data?.[0]?.body || "";
        out[f] = { src: (html.match(/src="([^"]+)"/) || [])[1]?.replace(/&amp;/g, "&") || null };
      } catch (err) {
        out[f] = { error: err.message };
      }
    })
  );
  return out;
}

module.exports = { connection, capabilities, campaigns, adSets, ads, shapeInsights, insightsBy, timeParams, update, duplicate, archive, searchTargeting, audienceSize, uploadMedia, library, removeMedia, previews, log, PREVIEW_FORMATS };

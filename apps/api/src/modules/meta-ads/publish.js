const { HttpError } = require("@shopcycle/utils");
const spec = require("./spec");
const manager = require("./manager");

/**
 * The create-campaign wizard's drafts and publishing. A draft is saved as
 * the seller goes (autosave); publishing creates, at Meta and in order,
 * the campaign, each ad set, each ad's creative and each ad — all PAUSED.
 * What Meta created is written to the draft after every step, so if
 * something fails halfway (a rejected image, an expired login) the seller
 * fixes it and publishes again: finished pieces are skipped, nothing is
 * created twice. Nothing spends until the seller turns it on.
 */

const MAX_DRAFT_BYTES = 400 * 1024;

async function listDrafts(prisma, storeId) {
  return prisma.adDraft.findMany({ where: { storeId, status: { in: ["draft", "failed", "publishing"] } }, orderBy: { updatedAt: "desc" }, take: 50, select: { id: true, name: true, status: true, error: true, updatedAt: true, createdAt: true } });
}

async function getDraft(prisma, storeId, id) {
  const d = await prisma.adDraft.findFirst({ where: { id, storeId } });
  if (!d) throw new HttpError(404, "Draft not found");
  return d;
}

async function saveDraft(prisma, store, { id, data }, user) {
  if (JSON.stringify(data || {}).length > MAX_DRAFT_BYTES) throw new HttpError(400, "This draft is too large.");
  const name = String(data?.campaign?.name || "Untitled campaign").slice(0, 200);
  if (id) {
    const d = await getDraft(prisma, store.id, id);
    if (d.status === "published") throw new HttpError(400, "This campaign was already published.");
    if (d.status === "publishing") throw new HttpError(409, "It's being published right now.");
    return prisma.adDraft.update({ where: { id }, data: { data, name } });
  }
  return prisma.adDraft.create({ data: { storeId: store.id, name, data: data || {}, createdById: user?.id || null } });
}

async function deleteDraft(prisma, storeId, id) {
  await prisma.adDraft.deleteMany({ where: { id, storeId, status: { not: "publishing" } } });
  return { ok: true };
}

/** Publish (or finish publishing) a draft. */
async function publish(prisma, store, id, user, { confirm } = {}) {
  if (!confirm) throw new HttpError(400, "Confirm before publishing.");
  const draft = await getDraft(prisma, store.id, id);
  if (draft.status === "published") throw new HttpError(400, "Already published.");
  const conn = await manager.connection(prisma, store.id);
  const s = draft.data;
  const caps = await manager.capabilities(prisma, store).catch(() => null);
  if (caps && !caps.permissions.includes("ads_management")) throw new HttpError(403, "Oyklane can't create ads on your account yet: the ads_management permission is missing. Reconnect Facebook and allow managing ads.", { reason: "meta_permission" });
  spec.assertPublishable(s, { instagram: caps ? caps.pages.some((p) => p.instagram) : undefined });

  // Claim it, so two clicks can't publish twice.
  const { count } = await prisma.adDraft.updateMany({ where: { id, status: { in: ["draft", "failed"] } }, data: { status: "publishing", error: null } });
  if (!count) throw new HttpError(409, "It's being published right now.");

  const done = { campaignId: null, adSets: {}, creatives: {}, ads: {}, ...(draft.published || {}) };
  const save = (data = {}) => prisma.adDraft.update({ where: { id }, data: { published: done, ...data } });
  const graph = (path, body) => require("../meta/service").graphRequest(path, { method: "POST", token: conn.accessToken, body });
  let step = "the campaign";
  try {
    if (!done.campaignId) {
      const c = await graph(`/${conn.adAccountId}/campaigns`, spec.campaignPayload(s));
      done.campaignId = c.id;
      await save();
    }
    for (const [i, set] of s.adSets.entries()) {
      const key = set.key || String(i);
      step = `ad set "${set.name || i + 1}"`;
      if (!done.adSets[key]) {
        const r = await graph(`/${conn.adAccountId}/adsets`, spec.adSetPayload(s, set, done.campaignId));
        done.adSets[key] = r.id;
        await save();
      }
      const goal = spec.GOALS[set.goal];
      for (const [j, ad] of set.ads.entries()) {
        const akey = `${key}:${ad.key || j}`;
        step = `ad "${ad.name || j + 1}" in ${set.name || `ad set ${i + 1}`}`;
        if (!done.creatives[akey]) {
          const cr = await graph(`/${conn.adAccountId}/adcreatives`, spec.creativePayload(ad, goal));
          done.creatives[akey] = cr.id;
          await save();
        }
        if (!done.ads[akey]) {
          const a = await graph(`/${conn.adAccountId}/ads`, { name: String(ad.name || `Ad ${j + 1}`).slice(0, 400), adset_id: done.adSets[key], creative: { creative_id: done.creatives[akey] }, status: "PAUSED" });
          done.ads[akey] = a.id;
          await save();
        }
      }
    }
  } catch (err) {
    const message = `Couldn't create ${step}: ${err.message}`;
    await save({ status: "failed", error: message });
    await manager.log(prisma, store, user, { action: "publish_failed", targetType: "campaign", targetId: done.campaignId, targetName: s.campaign.name, ok: false, error: message, detail: { draftId: id } });
    throw new HttpError(err.statusCode && err.statusCode < 500 ? err.statusCode : 502, message, { ...(err.details || {}), draftId: id, progress: done });
  }
  await save({ status: "published", error: null });
  await prisma.adCampaign.upsert({
    where: { storeId_metaCampaignId: { storeId: store.id, metaCampaignId: done.campaignId } },
    update: { name: s.campaign.name, objective: s.campaign.objective, status: "PAUSED" },
    create: { storeId: store.id, metaCampaignId: done.campaignId, name: s.campaign.name, objective: s.campaign.objective, status: "PAUSED", dailyBudget: s.campaign.budgetLevel === "campaign" && s.campaign.budgetType !== "lifetime" ? Number(s.campaign.budget) : null },
  });
  await manager.log(prisma, store, user, { action: "published", targetType: "campaign", targetId: done.campaignId, targetName: s.campaign.name, detail: { adSets: Object.keys(done.adSets).length, ads: Object.keys(done.ads).length, draftId: id } });
  return { campaignId: done.campaignId, adSets: Object.keys(done.adSets).length, ads: Object.keys(done.ads).length };
}

/** Turns a published campaign on: its ads, ad sets, then the campaign
 * (everything was created paused). The seller confirms first. */
async function launch(prisma, store, id, user, { confirm } = {}) {
  if (!confirm) throw new HttpError(400, "Confirm before turning it on.");
  const d = await getDraft(prisma, store.id, id);
  if (d.status !== "published" || !d.published?.campaignId) throw new HttpError(400, "Publish it first.");
  const conn = await manager.connection(prisma, store.id);
  const post = (objId) => require("../meta/service").graphRequest(`/${objId}`, { method: "POST", token: conn.accessToken, body: { status: "ACTIVE" } });
  for (const adId of Object.values(d.published.ads || {})) await post(adId);
  for (const setId of Object.values(d.published.adSets || {})) await post(setId);
  await post(d.published.campaignId);
  await prisma.adCampaign.updateMany({ where: { storeId: store.id, metaCampaignId: d.published.campaignId }, data: { status: "ACTIVE" } });
  await manager.log(prisma, store, user, { action: "turned_on", targetType: "campaign", targetId: d.published.campaignId, targetName: d.name, detail: { adSets: Object.keys(d.published.adSets || {}).length, ads: Object.keys(d.published.ads || {}).length } });
  return { ok: true };
}

/** A draft copied from a published campaign's spec (to make a similar one). */
async function cloneDraft(prisma, store, id, user) {
  const d = await getDraft(prisma, store.id, id);
  const data = JSON.parse(JSON.stringify(d.data || {}));
  if (data.campaign) data.campaign.name = `${data.campaign.name || "Campaign"} — copy`;
  return prisma.adDraft.create({ data: { storeId: store.id, name: data.campaign?.name || "Copy", data, createdById: user?.id || null } });
}

module.exports = { listDrafts, getDraft, saveDraft, deleteDraft, publish, launch, cloneDraft };

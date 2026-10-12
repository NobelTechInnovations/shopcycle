const { HttpError } = require("@shopcycle/utils");
const client = require("./client");
const spec = require("./spec");
const manager = require("./manager");

/**
 * Google Ads drafts (AdDraft, platform "google") and publishing. Google
 * creates a whole campaign in one atomic request, so a failure leaves
 * nothing behind and "publish again" is always safe. "Check with Google"
 * runs the same request in validate-only mode first, so Google's own
 * rejections (policy, limits, incompatible settings) show up before
 * anything is created. Campaigns are created PAUSED.
 */

const MAX_DRAFT_BYTES = 400 * 1024;

async function listDrafts(prisma, storeId) {
  return prisma.adDraft.findMany({ where: { storeId, platform: "google", status: { in: ["draft", "failed", "publishing"] } }, orderBy: { updatedAt: "desc" }, take: 50, select: { id: true, name: true, status: true, error: true, updatedAt: true } });
}

async function getDraft(prisma, storeId, id) {
  const d = await prisma.adDraft.findFirst({ where: { id, storeId, platform: "google" } });
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
  return prisma.adDraft.create({ data: { storeId: store.id, platform: "google", name, data: data || {}, createdById: user?.id || null } });
}

async function deleteDraft(prisma, storeId, id) {
  await prisma.adDraft.deleteMany({ where: { id, storeId, platform: "google", status: { not: "publishing" } } });
  return { ok: true };
}

const isDateFieldError = (err) => /start_date_time|end_date_time|startDateTime|endDateTime/i.test(`${err.message} ${JSON.stringify(err.details?.errors || [])}`);

/** Points Google's errors at the wizard step they belong to. */
function located(err, where) {
  const errors = (err.details?.errors || []).map((e) => ({ at: e.operation != null ? where[e.operation] || "campaign" : "campaign", text: e.trigger ? `${e.message} ("${e.trigger}")` : e.message }));
  return errors.length ? errors : [{ at: "campaign", text: err.message }];
}

/** Our checks, then Google's (validate-only). Nothing is created. */
async function validate(prisma, store, data) {
  const acct = await manager.account(prisma, store.id);
  const caps = await manager.capabilities(prisma, store).catch(() => null);
  const ours = spec.check(data, { conversions: caps ? caps.conversions.some((c) => c.category === "PURCHASE") : undefined });
  if (!ours.ok) return { ...ours, google: null };
  let built = spec.operations(data, acct.customerId);
  try {
    await client.mutate(prisma, store.id, acct, built.ops, { validateOnly: true });
  } catch (err) {
    if (isDateFieldError(err)) {
      built = spec.operations(data, acct.customerId, { legacyDates: true });
      try {
        await client.mutate(prisma, store.id, acct, built.ops, { validateOnly: true });
        return { ...ours, google: "ok", legacyDates: true };
      } catch (err2) {
        return { ok: false, errors: located(err2, built.where), warnings: ours.warnings, google: "rejected" };
      }
    }
    return { ok: false, errors: located(err, built.where), warnings: ours.warnings, google: "rejected" };
  }
  return { ...ours, google: "ok" };
}

async function publish(prisma, store, id, user, { confirm } = {}) {
  if (!confirm) throw new HttpError(400, "Confirm before publishing.");
  const draft = await getDraft(prisma, store.id, id);
  if (draft.status === "published") throw new HttpError(400, "Already published.");
  const acct = await manager.account(prisma, store.id);
  spec.assertPublishable(draft.data);
  const { count } = await prisma.adDraft.updateMany({ where: { id, status: { in: ["draft", "failed"] } }, data: { status: "publishing", error: null } });
  if (!count) throw new HttpError(409, "It's being published right now.");
  let built = spec.operations(draft.data, acct.customerId);
  let result;
  try {
    try {
      result = await client.mutate(prisma, store.id, acct, built.ops);
    } catch (err) {
      if (!isDateFieldError(err)) throw err;
      built = spec.operations(draft.data, acct.customerId, { legacyDates: true });
      result = await client.mutate(prisma, store.id, acct, built.ops);
    }
  } catch (err) {
    const errors = located(err, built.where);
    await prisma.adDraft.update({ where: { id }, data: { status: "failed", error: errors[0].text } });
    await manager.log(prisma, store, user, { action: "publish_failed", targetType: "campaign", targetName: draft.name, ok: false, error: errors[0].text, detail: { draftId: id } });
    throw new HttpError(err.statusCode && err.statusCode < 500 ? err.statusCode : 502, `Google didn't create it: ${errors[0].text}`, { errors, draftId: id });
  }
  const campaignIdx = built.ops.findIndex((o) => o.campaignOperation);
  const campaignResource = result.mutateOperationResponses?.[campaignIdx]?.campaignResult?.resourceName || null;
  const campaignId = campaignResource ? campaignResource.split("/").pop() : null;
  await prisma.adDraft.update({ where: { id }, data: { status: "published", error: null, published: { campaignResource, campaignId } } });
  await manager.log(prisma, store, user, { action: "published", targetType: "campaign", targetId: campaignId, targetName: draft.data.campaign.name, detail: { draftId: id, type: draft.data.campaign.type } });
  return { campaignId };
}

/** Turns a published campaign on (it was created paused). */
async function launch(prisma, store, id, user, { confirm } = {}) {
  if (!confirm) throw new HttpError(400, "Confirm before turning it on.");
  const d = await getDraft(prisma, store.id, id);
  if (d.status !== "published" || !d.published?.campaignId) throw new HttpError(400, "Publish it first.");
  return manager.update(prisma, store, "campaign", d.published.campaignId, { status: "ENABLED" }, user);
}

module.exports = { listDrafts, getDraft, saveDraft, deleteDraft, validate, publish, launch };

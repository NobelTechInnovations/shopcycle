const { HttpError } = require("@shopcycle/utils");
const { LEGACY_FLAGS } = require("./catalog");

/**
 * What a store's plan lets it do — read from the plan's features (edited
 * in the super admin), plus any per-store grants (a feature switched on
 * for one store, or a higher staff limit). Every feature check in the API
 * goes through here; nothing reads plan flags directly.
 *
 *   { plan: { id, key, name }, features: { api_access: true, … },
 *     limits: { staff: 10, products: null } }      null = unlimited
 */
function activeGrants(prisma, storeId) {
  return prisma.entitlementGrant.findMany({
    where: { storeId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    orderBy: { createdAt: "asc" },
  });
}

/** Plan limit for staff: the "staff" feature row, else Plan.staffLimit. */
function planStaffLimit(planRow) {
  const row = planRow?.features?.find((f) => f.featureKey === "staff");
  if (row) return row.enabled ? row.limitValue ?? null : 0;
  return planRow?.staffLimit ?? 2;
}

function compute(planRow, grants) {
  const features = {};
  const limits = { staff: planStaffLimit(planRow), products: planRow?.productLimit ?? null };
  for (const f of planRow?.features || []) {
    if (f.featureKey !== "staff") features[f.featureKey] = Boolean(f.enabled);
  }
  for (const g of grants || []) {
    if (g.key.startsWith("limit.")) {
      const k = g.key.slice(6);
      const n = Number(g.value);
      if (Number.isFinite(n) && limits[k] != null) limits[k] = Math.max(limits[k], n);
    } else features[g.key] = g.value === true || g.value === "true";
  }
  return {
    plan: planRow ? { id: planRow.id, key: planRow.key, name: planRow.name } : null,
    features,
    limits,
  };
}

async function forStore(prisma, storeId, { planId: planOverride } = {}) {
  let planId = planOverride;
  if (!planId) {
    const sub = await prisma.subscription.findUnique({ where: { storeId }, select: { planId: true } });
    planId = sub?.planId || (await prisma.store.findUnique({ where: { id: storeId }, select: { planId: true } }))?.planId;
  }
  const [planRow, grants] = await Promise.all([
    planId ? prisma.plan.findUnique({ where: { id: planId }, include: { features: true } }) : null,
    activeGrants(prisma, storeId),
  ]);
  return compute(planRow, grants);
}

/** One feature check for code that only has a store (jobs, services). */
async function storeHas(prisma, store, key) {
  return has(await forStore(prisma, store.id), key);
}

function has(ent, key) {
  return Boolean(ent?.features?.[LEGACY_FLAGS[key] || key]);
}

function assertFeature(ent, key, label) {
  if (has(ent, key)) return;
  throw new HttpError(403, `${label || "This feature"} isn't part of your ${ent?.plan?.name || "current"} plan. Upgrade in Settings ▸ Plan & billing to use it.`, {
    code: "plan_upgrade_required",
    feature: LEGACY_FLAGS[key] || key,
  });
}

/** Staff accounts in use: team members other than owners, plus pending
 * invitations. The owner never counts toward the limit. */
async function staffUsage(prisma, storeId) {
  const [members, invites] = await Promise.all([
    prisma.storeUser.count({ where: { storeId, role: { not: "owner" } } }),
    prisma.invitation.count({ where: { storeId, expiresAt: { gt: new Date() } } }),
  ]);
  return members + invites;
}

module.exports = { forStore, compute, activeGrants, planStaffLimit, has, storeHas, assertFeature, staffUsage };

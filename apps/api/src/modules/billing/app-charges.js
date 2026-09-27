const { round2, num } = require("./money");

/**
 * Paid apps (App.priceMonthly), billed like checkout fees — in arrears:
 * one AppCharge for every billing period the app was installed in at any
 * point, collected with the next billing cycle.
 *
 *   install            → a charge for the current period (added to the next bill)
 *   new period starts  → a charge for it, for each app still installed
 *   uninstall          → no new charges; one already created is still owed
 *
 * A period "boundary" is where a new app period starts: a subscription
 * cycle's periodStart, or — for yearly plans, settled monthly — the end
 * of a monthly fees cycle.
 */
const APP_PERIOD_KINDS = ["intro", "regular", "reactivation", "fees"];

function boundaryOf(cycle) {
  return cycle.kind === "fees" ? cycle.periodEnd : cycle.periodStart;
}

/** Start of the app period that contains `now`. */
async function currentPeriodStart(db, sub, now = new Date()) {
  const recent = await db.billingCycle.findMany({
    where: { subscriptionId: sub.id, kind: { in: APP_PERIOD_KINDS }, status: { not: "void" } },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: { kind: true, periodStart: true, periodEnd: true },
  });
  const past = recent.map(boundaryOf).filter((d) => d && new Date(d) <= now).sort((a, b) => new Date(b) - new Date(a));
  return past[0] || sub.trialStartedAt || sub.createdAt;
}

async function installedPaidApps(db, storeId) {
  const installs = await db.storeApp.findMany({ where: { storeId, app: { priceMonthly: { gt: 0 } } }, include: { app: true } });
  return installs.map((i) => i.app);
}

function chargeRow(store, sub, app, periodStart) {
  return { storeId: store.id, subscriptionId: sub.id, appId: app.id, appKey: app.key, appName: app.name, amount: round2(num(app.priceMonthly)), periodStart };
}

/** Called when an app is installed: the current period is charged once. */
async function onInstall(db, store, sub, app, { now = new Date() } = {}) {
  if (!sub || !(num(app.priceMonthly) > 0)) return null;
  const periodStart = await currentPeriodStart(db, sub, now);
  await db.appCharge.createMany({ data: [chargeRow(store, sub, app, periodStart)], skipDuplicates: true });
  return periodStart;
}

/**
 * Inside a cycle's transaction: bills every pending charge from before the
 * boundary to this cycle, then opens the new period's charges for the apps
 * still installed (collected by the following cycle).
 */
async function collect(tx, store, sub, cycleId, boundary) {
  const pending = await tx.appCharge.findMany({ where: { storeId: store.id, status: "pending", periodStart: { lt: boundary } } });
  if (pending.length) {
    await tx.appCharge.updateMany({ where: { id: { in: pending.map((c) => c.id) } }, data: { status: "billed", cycleId } });
  }
  const apps = await installedPaidApps(tx, store.id);
  if (apps.length) {
    await tx.appCharge.createMany({ data: apps.map((app) => chargeRow(store, sub, app, boundary)), skipDuplicates: true });
  }
  return { amount: round2(pending.reduce((s, c) => s + num(c.amount), 0)), count: pending.length };
}

/** A voided cycle gives its charges back — the next cycle collects them —
 * and the period it opened never happens, so that period's charges go. */
async function release(tx, cycle) {
  if (APP_PERIOD_KINDS.includes(cycle.kind)) {
    await tx.appCharge.deleteMany({ where: { storeId: cycle.storeId, status: "pending", periodStart: boundaryOf(cycle) } });
  }
  await tx.appCharge.updateMany({ where: { cycleId: cycle.id, status: "billed" }, data: { status: "pending", cycleId: null } });
}

/** What the next cycle (at `before`) would collect. */
async function pendingTotal(db, storeId, before = null) {
  const rows = await db.appCharge.findMany({ where: { storeId, status: "pending", ...(before && { periodStart: { lt: new Date(before) } }) }, select: { amount: true } });
  return round2(rows.reduce((s, c) => s + num(c.amount), 0));
}

function forCycle(db, cycleId) {
  return db.appCharge.findMany({ where: { cycleId }, orderBy: [{ periodStart: "asc" }, { appName: "asc" }] });
}

module.exports = { onInstall, collect, release, pendingTotal, forCycle, currentPeriodStart, boundaryOf };

const { HttpError } = require("@shopcycle/utils");
const meta = require("../meta/service");
const repository = require("../meta/repository");
const manager = require("./manager");

/**
 * Optional automatic optimisation. Off until the seller turns a rule on;
 * each rule has hard limits (a budget ceiling, a step size, a cool-down),
 * only touches ad sets/ads that are already running, and every change is
 * written to the activity log with why. One switch turns a rule off.
 */

const KINDS = {
  pause_no_results: {
    label: "Pause ad sets that spend without results",
    hint: "Pauses an ad set that spent at least the amount you set with no purchases, chats or leads.",
    defaults: { minSpend: 1500, lookbackDays: 7 },
  },
  pause_high_cpa: {
    label: "Pause ad sets with a high cost per purchase",
    hint: "Pauses an ad set whose cost per purchase is above your limit, once it has spent enough to judge.",
    defaults: { maxCpa: 600, minSpend: 2000, lookbackDays: 7 },
  },
  raise_budget_good_roas: {
    label: "Raise budgets of ad sets that sell well",
    hint: "Raises the daily budget of an ad set with a good return on ad spend — a small step, at most every 3 days, never above your ceiling.",
    defaults: { minRoas: 3, minPurchases: 5, changePercent: 15, lookbackDays: 7 },
  },
  lower_budget_poor_roas: {
    label: "Lower budgets of ad sets that don't pay back",
    hint: "Lowers the daily budget of an ad set whose return on ad spend is below your floor.",
    defaults: { maxRoas: 1, minSpend: 2000, changePercent: 20, lookbackDays: 7 },
  },
};

const RUN_EVERY_MS = 6 * 3600e3;
const COOLDOWN_MS = 3 * 24 * 3600e3;
const num = (v, min, max, d) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : d);

function clean(input) {
  const kind = KINDS[input.kind] ? input.kind : null;
  if (!kind) throw new HttpError(400, "Choose what the rule does.");
  const d = KINDS[kind].defaults;
  const c = input.config || {};
  const config = {
    lookbackDays: num(c.lookbackDays, 3, 30, d.lookbackDays),
    ...(d.minSpend !== undefined && { minSpend: num(c.minSpend, 100, 1e7, d.minSpend) }),
    ...(d.maxCpa !== undefined && { maxCpa: num(c.maxCpa, 1, 1e7, d.maxCpa) }),
    ...(d.minRoas !== undefined && { minRoas: num(c.minRoas, 0.5, 50, d.minRoas) }),
    ...(d.maxRoas !== undefined && { maxRoas: num(c.maxRoas, 0.1, 50, d.maxRoas) }),
    ...(d.minPurchases !== undefined && { minPurchases: num(c.minPurchases, 1, 1000, d.minPurchases) }),
    ...(d.changePercent !== undefined && { changePercent: num(c.changePercent, 5, 30, d.changePercent) }),
  };
  const maxDailyBudget = input.maxDailyBudget == null || input.maxDailyBudget === "" ? null : num(input.maxDailyBudget, 100, 1e7, null);
  if (kind === "raise_budget_good_roas" && !maxDailyBudget) throw new HttpError(400, "Set the most this rule may raise a daily budget to — it's the rule's spending limit.");
  return { name: String(input.name || KINDS[kind].label).slice(0, 120), kind, config, maxDailyBudget, enabled: Boolean(input.enabled) };
}

async function list(prisma, storeId) {
  return prisma.adRule.findMany({ where: { storeId }, orderBy: { createdAt: "asc" } });
}

async function save(prisma, store, input, user, id) {
  const data = clean(input);
  if (id) {
    const r = await prisma.adRule.findFirst({ where: { id, storeId: store.id } });
    if (!r) throw new HttpError(404, "Rule not found");
    return prisma.adRule.update({ where: { id }, data });
  }
  if ((await prisma.adRule.count({ where: { storeId: store.id } })) >= 10) throw new HttpError(400, "Up to 10 rules.");
  return prisma.adRule.create({ data: { storeId: store.id, createdById: user?.id || null, ...data } });
}

async function remove(prisma, storeId, id) {
  await prisma.adRule.deleteMany({ where: { id, storeId } });
  return { ok: true };
}

/** Runs one rule now: what it changed (or would change, with dryRun). */
async function run(prisma, rule, { dryRun = false, log } = {}) {
  const store = await prisma.store.findUnique({ where: { id: rule.storeId } });
  const conn = await repository.findByStore(prisma, rule.storeId);
  if (!store || store.status !== "active" || !conn?.adAccountId) return [];
  const c = rule.config || {};
  const until = new Date(Date.now() - 86400e3).toISOString().slice(0, 10);
  const since = new Date(Date.now() - c.lookbackDays * 86400e3).toISOString().slice(0, 10);
  const [rows, sets] = await Promise.all([
    meta.graphRequest(`/${conn.adAccountId}/insights`, { token: conn.accessToken, params: { level: "adset", fields: "adset_id,adset_name,spend,actions,action_values", time_range: { since, until }, limit: 500, action_attribution_windows: ["7d_click", "1d_view"] } }).then((r) => r.data || []),
    meta.graphRequest(`/${conn.adAccountId}/adsets`, { token: conn.accessToken, params: { fields: "id,name,effective_status,daily_budget", limit: 500, filtering: [{ field: "effective_status", operator: "IN", value: ["ACTIVE"] }] } }).then((r) => r.data || []),
  ]);
  const active = Object.fromEntries(sets.map((s) => [s.id, s]));
  const changes = [];
  for (const row of rows) {
    const set = active[row.adset_id];
    if (!set) continue;
    const m = manager.shapeInsights(row);
    const results = m.purchases + m.chats + m.leads;
    let change = null;
    if (rule.kind === "pause_no_results" && m.spend >= c.minSpend && results === 0) change = { status: "PAUSED", why: `₹${Math.round(m.spend)} spent in ${c.lookbackDays} days with no results` };
    if (rule.kind === "pause_high_cpa" && m.spend >= c.minSpend && m.purchases > 0 && m.cpa > c.maxCpa) change = { status: "PAUSED", why: `₹${Math.round(m.cpa)} per purchase, above your ₹${c.maxCpa} limit` };
    if ((rule.kind === "raise_budget_good_roas" || rule.kind === "lower_budget_poor_roas") && set.daily_budget) {
      const recent = await prisma.adActivity.findFirst({ where: { storeId: rule.storeId, targetId: set.id, source: "rule", action: "budget_changed", createdAt: { gte: new Date(Date.now() - COOLDOWN_MS) } } });
      if (!recent) {
        const budget = Number(set.daily_budget) / 100;
        if (rule.kind === "raise_budget_good_roas" && m.purchases >= c.minPurchases && m.roas >= c.minRoas) {
          const to = Math.min(Math.round(budget * (1 + c.changePercent / 100)), Number(rule.maxDailyBudget));
          if (to > budget) change = { budget: to, from: budget, why: `ROAS ${m.roas.toFixed(2)} from ${m.purchases} purchases` };
        }
        if (rule.kind === "lower_budget_poor_roas" && m.spend >= c.minSpend && (m.roas ?? 0) < c.maxRoas) {
          const to = Math.max(100, Math.round(budget * (1 - c.changePercent / 100)));
          if (to < budget) change = { budget: to, from: budget, why: `ROAS ${(m.roas || 0).toFixed(2)}, below your ${c.maxRoas} floor` };
        }
      }
    }
    if (!change) continue;
    changes.push({ adSetId: set.id, name: set.name, ...change });
    if (dryRun) continue;
    try {
      await manager.update(prisma, store, "adset", set.id, change.status ? { status: change.status } : { budget: change.budget }, { name: `Rule: ${rule.name}` }, { source: "rule" });
    } catch (err) {
      log?.warn({ err, ruleId: rule.id }, "ads rule: change failed");
    }
  }
  if (!dryRun) await prisma.adRule.update({ where: { id: rule.id }, data: { lastRunAt: new Date() } });
  return changes;
}

/** Jobs tick: enabled rules not run in the last 6 hours. */
async function processDue(prisma, { log } = {}) {
  const due = await prisma.adRule.findMany({ where: { enabled: true, OR: [{ lastRunAt: null }, { lastRunAt: { lt: new Date(Date.now() - RUN_EVERY_MS) } }] }, take: 20 });
  let changed = 0;
  for (const rule of due) {
    try {
      changed += (await run(prisma, rule, { log })).length;
    } catch (err) {
      log?.warn({ err, ruleId: rule.id }, "ads rule failed");
      await prisma.adRule.update({ where: { id: rule.id }, data: { lastRunAt: new Date() } }).catch(() => {});
    }
  }
  return changed;
}

module.exports = { KINDS, list, save, remove, run, processDue };

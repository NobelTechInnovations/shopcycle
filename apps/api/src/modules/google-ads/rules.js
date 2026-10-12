const { HttpError } = require("@shopcycle/utils");
const client = require("./client");
const manager = require("./manager");
const metaRules = require("../meta-ads/rules");

/**
 * Optional automatic rules for Google campaigns — the same kinds, limits
 * and log as Meta's (AdRule, platform "google"), applied per campaign
 * (Google budgets live on the campaign). Off until switched on.
 */

const KINDS = Object.fromEntries(
  Object.entries(metaRules.KINDS).map(([k, v]) => [k, { ...v, label: v.label.replace(/ad sets/g, "campaigns"), hint: v.hint.replace(/an ad set/g, "a campaign").replace(/ad set/g, "campaign") }])
);
const RUN_EVERY_MS = 6 * 3600e3;
const COOLDOWN_MS = 3 * 24 * 3600e3;

async function list(prisma, storeId) {
  return prisma.adRule.findMany({ where: { storeId, platform: "google" }, orderBy: { createdAt: "asc" } });
}

async function save(prisma, store, input, user, id) {
  // Same validation and limits as Meta's rules.
  const data = metaRules.clean(input);
  if (id) {
    const r = await prisma.adRule.findFirst({ where: { id, storeId: store.id, platform: "google" } });
    if (!r) throw new HttpError(404, "Rule not found");
    return prisma.adRule.update({ where: { id }, data });
  }
  if ((await prisma.adRule.count({ where: { storeId: store.id, platform: "google" } })) >= 10) throw new HttpError(400, "Up to 10 rules.");
  return prisma.adRule.create({ data: { storeId: store.id, platform: "google", createdById: user?.id || null, ...data } });
}

async function remove(prisma, storeId, id) {
  await prisma.adRule.deleteMany({ where: { id, storeId, platform: "google" } });
  return { ok: true };
}

async function run(prisma, rule, { dryRun = false, log } = {}) {
  const store = await prisma.store.findUnique({ where: { id: rule.storeId } });
  const acct = await prisma.googleAdsAccount.findUnique({ where: { storeId: rule.storeId } });
  if (!store || store.status !== "active" || !acct) return [];
  const c = rule.config || {};
  const until = new Date(Date.now() - 86400e3).toISOString().slice(0, 10);
  const since = new Date(Date.now() - c.lookbackDays * 86400e3).toISOString().slice(0, 10);
  const rows = await client.search(prisma, store.id, acct, `SELECT campaign.id, campaign.name, campaign.status, campaign_budget.amount_micros, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE campaign.status = 'ENABLED' AND segments.date BETWEEN '${since}' AND '${until}'`);
  const changes = [];
  for (const r of rows) {
    const spend = client.fromMicros(r.metrics.costMicros) || 0;
    const purchases = Number(r.metrics.conversions || 0);
    const roas = spend ? Number(r.metrics.conversionsValue || 0) / spend : 0;
    const cpa = purchases ? spend / purchases : null;
    const id = String(r.campaign.id);
    let change = null;
    if (rule.kind === "pause_no_results" && spend >= c.minSpend && purchases === 0) change = { status: "PAUSED", why: `₹${Math.round(spend)} spent in ${c.lookbackDays} days with no purchases` };
    if (rule.kind === "pause_high_cpa" && spend >= c.minSpend && purchases > 0 && cpa > c.maxCpa) change = { status: "PAUSED", why: `₹${Math.round(cpa)} per purchase, above your ₹${c.maxCpa} limit` };
    if ((rule.kind === "raise_budget_good_roas" || rule.kind === "lower_budget_poor_roas") && r.campaignBudget?.amountMicros) {
      const recent = await prisma.adActivity.findFirst({ where: { storeId: rule.storeId, platform: "google", targetId: id, source: "rule", action: "budget_changed", createdAt: { gte: new Date(Date.now() - COOLDOWN_MS) } } });
      if (!recent) {
        const budget = client.fromMicros(r.campaignBudget.amountMicros);
        if (rule.kind === "raise_budget_good_roas" && purchases >= c.minPurchases && roas >= c.minRoas) {
          const to = Math.min(Math.round(budget * (1 + c.changePercent / 100)), Number(rule.maxDailyBudget));
          if (to > budget) change = { budget: to, from: budget, why: `ROAS ${roas.toFixed(2)} from ${purchases} purchases` };
        }
        if (rule.kind === "lower_budget_poor_roas" && spend >= c.minSpend && roas < c.maxRoas) {
          const to = Math.max(100, Math.round(budget * (1 - c.changePercent / 100)));
          if (to < budget) change = { budget: to, from: budget, why: `ROAS ${roas.toFixed(2)}, below your ${c.maxRoas} floor` };
        }
      }
    }
    if (!change) continue;
    changes.push({ adSetId: id, name: r.campaign.name, ...change });
    if (dryRun) continue;
    try {
      await manager.update(prisma, store, "campaign", id, change.status ? { status: "PAUSED" } : { budget: change.budget }, { name: `Rule: ${rule.name}` }, { source: "rule" });
    } catch (err) {
      log?.warn({ err, ruleId: rule.id }, "google ads rule: change failed");
    }
  }
  if (!dryRun) await prisma.adRule.update({ where: { id: rule.id }, data: { lastRunAt: new Date() } });
  return changes;
}

async function processDue(prisma, { log } = {}) {
  const due = await prisma.adRule.findMany({ where: { platform: "google", enabled: true, OR: [{ lastRunAt: null }, { lastRunAt: { lt: new Date(Date.now() - RUN_EVERY_MS) } }] }, take: 20 });
  let changed = 0;
  for (const rule of due) {
    try {
      changed += (await run(prisma, rule, { log })).length;
    } catch (err) {
      log?.warn({ err, ruleId: rule.id }, "google ads rule failed");
      await prisma.adRule.update({ where: { id: rule.id }, data: { lastRunAt: new Date() } }).catch(() => {});
    }
  }
  return changed;
}

module.exports = { KINDS, list, save, remove, run, processDue };

/**
 * Platform billing settings (super admin ▸ Billing ▸ Settings), stored in
 * PlatformSetting under "billing". Every rule the engine applies — tax
 * rate, trial length, grace days, reminders — is read from here, with
 * these defaults when nothing has been saved.
 */
const DEFAULTS = {
  // GST on everything Oyklane charges, added on top (never included).
  taxRate: 18,
  trialDays: 3,
  // The one-time first paid month after the trial (before tax).
  introEnabled: true,
  introPrice: 99,
  // Yearly = monthly × 12 × (1 − discount).
  annualDiscountPercent: 20,
  // After a failed payment (or an expired period): full access this long.
  graceDays: 7,
  // Unpaid cycles in a row before the store is taken offline.
  maxConsecutiveFailures: 3,
  // Automatic retries of a failed charge, in days after the failure.
  retryOffsetsDays: [1, 3, 5],
  // Reminder emails before a renewal, and before the trial / grace ends.
  reminderDaysBeforeBilling: [7, 3, 1],
  trialEndingReminderDays: [1],
  graceEndingReminderDays: [2, 1],
  // Extra fee on orders placed with the One-Click Checkout app.
  oneClickFeePercent: 0.3,
  // The plan a new store's trial starts on (its key).
  defaultTrialPlan: "growth",
  // Highest single charge each mandate type may take (₹).
  mandateMaxAmount: { upi: 15000, card: 100000, emandate: 100000 },
  // Mandates expire after this many years (renewed by the seller).
  mandateYears: 10,
  // Seller-side support contact shown on locked screens.
  supportEmail: "support@oyklane.com",
};

const KEY = "billing";
let cache = null;
let cachedAt = 0;
const TTL_MS = 30_000;

function merge(raw) {
  const v = raw && typeof raw === "object" ? raw : {};
  return {
    ...DEFAULTS,
    ...v,
    mandateMaxAmount: { ...DEFAULTS.mandateMaxAmount, ...(v.mandateMaxAmount || {}) },
  };
}

async function getSettings(prisma, { fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cachedAt < TTL_MS) return cache;
  const row = await prisma.platformSetting.findUnique({ where: { key: KEY } }).catch(() => null);
  cache = merge(row?.value);
  cachedAt = Date.now();
  return cache;
}

const numberList = (v, fallback) =>
  Array.isArray(v) ? [...new Set(v.map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n <= 365))].sort((a, b) => b - a) : fallback;

/** Validates and saves a partial update from the super admin. */
async function saveSettings(prisma, patch, { actor } = {}) {
  const current = await getSettings(prisma, { fresh: true });
  const next = { ...current };
  const num = (k, min, max) => {
    if (patch[k] === undefined) return;
    const n = Number(patch[k]);
    if (!Number.isFinite(n) || n < min || n > max) throw Object.assign(new Error(`${k} must be between ${min} and ${max}`), { statusCode: 400 });
    next[k] = n;
  };
  num("taxRate", 0, 40);
  num("trialDays", 0, 60);
  num("introPrice", 0, 100000);
  num("annualDiscountPercent", 0, 90);
  num("graceDays", 0, 60);
  num("maxConsecutiveFailures", 1, 12);
  num("oneClickFeePercent", 0, 10);
  num("mandateYears", 1, 30);
  if (patch.introEnabled !== undefined) next.introEnabled = Boolean(patch.introEnabled);
  if (patch.defaultTrialPlan !== undefined) next.defaultTrialPlan = String(patch.defaultTrialPlan);
  if (patch.supportEmail !== undefined) next.supportEmail = String(patch.supportEmail).slice(0, 200);
  for (const k of ["retryOffsetsDays", "reminderDaysBeforeBilling", "trialEndingReminderDays", "graceEndingReminderDays"]) {
    if (patch[k] !== undefined) next[k] = numberList(patch[k], current[k]);
  }
  if (patch.mandateMaxAmount) {
    for (const m of ["upi", "card", "emandate"]) {
      if (patch.mandateMaxAmount[m] !== undefined) {
        const n = Number(patch.mandateMaxAmount[m]);
        if (!Number.isFinite(n) || n < 100) throw Object.assign(new Error("Mandate limits must be at least ₹100"), { statusCode: 400 });
        next.mandateMaxAmount[m] = n;
      }
    }
  }
  await prisma.platformSetting.upsert({
    where: { key: KEY },
    update: { value: next, updatedBy: actor || null },
    create: { key: KEY, value: next, updatedBy: actor || null },
  });
  cache = next;
  cachedAt = Date.now();
  return next;
}

function resetCache() {
  cache = null;
}

module.exports = { DEFAULTS, getSettings, saveSettings, resetCache };

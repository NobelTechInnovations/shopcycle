const { env } = require("../../config/env");
const { sendEmail } = require("../../lib/mailer");
const { billingNotice } = require("../../emails/templates");
const { formatCurrency } = require("@shopcycle/utils");

/**
 * Billing notices to the seller: a row the dashboard shows (banner +
 * Billing page), and an email to the store's owners. Each notice has a
 * dedupe key, so a reminder can be triggered on every engine run and
 * still goes out once.
 */
const inr = (n) => formatCurrency(Number(n || 0), "INR");
const day = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }) : "");
const billingUrl = () => `${env.ADMIN_ORIGIN.replace(/\/$/, "")}/admin/settings/billing`;
const payUrl = () => `${env.ADMIN_ORIGIN.replace(/\/$/, "")}/billing`;

/** Title, lines, severity and email button for each notice type. */
const TEMPLATES = {
  trial_started: (d) => ({ severity: "info", title: "Your free trial has started", lines: [`You have ${d.trialDays} days of ${d.planName} free, until ${day(d.trialEndsAt)}.`, `Set up autopay any time before then — your first month after the trial is just ${inr(d.introTotal)} (incl. GST).`], cta: "Set up autopay", url: payUrl() }),
  trial_ending: (d) => ({ severity: "warning", title: "Your trial ends soon", lines: [`Your free trial of ${d.planName} ends on ${day(d.trialEndsAt)}.`, d.mandateActive ? `Autopay is set up — we'll charge ${inr(d.introTotal)} for your first month.` : "Set up autopay now to keep your dashboard open."], cta: d.mandateActive ? "View billing" : "Set up autopay", url: d.mandateActive ? billingUrl() : payUrl() }),
  trial_expired: (d) => ({ severity: "danger", title: "Your trial has ended", lines: ["Your dashboard is paused until you set up your subscription. Your store stays live for your customers meanwhile.", `Pay ${inr(d.amount)} to continue.`], cta: "Complete your subscription", url: payUrl() }),
  subscription_activated: (d) => ({ severity: "success", title: "Your subscription is active", lines: [`You're on ${d.planName} (${d.interval === "year" ? "yearly" : "monthly"}). Next billing: ${day(d.nextBillingAt)}.`], cta: "View billing", url: billingUrl() }),
  subscription_renewed: (d) => ({ severity: "success", title: "Subscription renewed", lines: [`${d.planName} renewed until ${day(d.periodEnd)}.`] , cta: "View invoice", url: billingUrl() }),
  subscription_cancelled: (d) => ({ severity: "warning", title: "Subscription cancelled", lines: [`Auto-renew is off. ${d.planName} stays active until ${day(d.periodEnd)}.`, "You can resume any time before then."], cta: "Resume subscription", url: billingUrl() }),
  subscription_expired: (d) => ({ severity: "danger", title: "Your subscription has ended", lines: [`Renew within ${d.graceDays} days (by ${day(d.graceEndsAt)}) to keep your dashboard open.`], cta: "Renew now", url: payUrl() }),
  payment_successful: (d) => ({ severity: "success", title: "Payment received", lines: [`We received ${inr(d.amount)}. Thank you!`], rows: d.rows, cta: "View invoice", url: billingUrl() }),
  payment_failed: (d) => ({ severity: "danger", title: "Your subscription payment failed", lines: [d.reason ? `Reason: ${d.reason}` : "Your bank or card declined the payment.", `You have ${d.graceDays} days (until ${day(d.graceEndsAt)}) to complete payment.`, `Next action required: pay ${inr(d.amount)}.`], cta: `Pay ${inr(d.amount)}`, url: payUrl() }),
  payment_retry: (d) => ({ severity: "warning", title: "We're retrying your payment", lines: [`We're trying ${inr(d.amount)} again on your saved payment method (attempt ${d.attempt}).`], cta: "Pay now instead", url: payUrl() }),
  grace_started: (d) => ({ severity: "warning", title: "Payment grace period started", lines: [`Your dashboard stays open until ${day(d.graceEndsAt)}. Pay ${inr(d.amount)} before then to avoid interruption.`], cta: "Pay now", url: payUrl() }),
  grace_ending: (d) => ({ severity: "danger", title: "Your grace period ends soon", lines: [`Pay ${inr(d.amount)} by ${day(d.graceEndsAt)} or your dashboard will be paused.`], cta: "Pay now", url: payUrl() }),
  dashboard_locked: (d) => ({ severity: "danger", title: "Your dashboard is paused", lines: ["We couldn't collect your subscription payment. Your store is still live for customers.", `Pay ${inr(d.amount)} to unlock your dashboard. After ${d.maxFailures} unpaid billing cycles your store goes offline.`], cta: `Pay ${inr(d.amount)}`, url: payUrl() }),
  store_suspended: (d) => ({ severity: "danger", title: "Your store is offline", lines: [`After ${d.maxFailures} unpaid billing cycles your store has been suspended — customers can't see it or check out.`, `Pay ${inr(d.amount)} to bring it back online straight away.`], cta: "Restore my store", url: payUrl() }),
  billing_reminder: (d) => ({ severity: "info", title: `Upcoming payment in ${d.days} day${d.days === 1 ? "" : "s"}`, lines: [`On ${day(d.dueAt)} we'll charge about ${inr(d.amount)} (incl. GST) for ${d.planName}${d.fees > 0 ? ` and ${inr(d.fees)} of checkout fees` : ""}.`], cta: "View billing", url: billingUrl() }),
  store_restored: () => ({ severity: "success", title: "Your store is back", lines: ["Thanks — your payment went through and everything is running again."], cta: "Open dashboard", url: billingUrl() }),
  limit_request: (d) => ({ severity: d.approved ? "success" : "info", title: d.approved ? "Staff limit increased" : "Staff limit request update", lines: [d.approved ? `You can now have up to ${d.value} staff accounts.` : `Your request wasn't approved${d.note ? `: ${d.note}` : "."}`], cta: "View billing", url: billingUrl() }),
};

/** Who billing is addressed to: the store's first owner. */
async function ownerContact(prisma, storeId) {
  const [owner, store] = await Promise.all([
    prisma.storeUser.findFirst({ where: { storeId, role: "owner" }, orderBy: { createdAt: "asc" }, include: { user: { select: { name: true, email: true } } } }),
    prisma.store.findUnique({ where: { id: storeId }, select: { supportPhone: true } }),
  ]);
  const digits = String(store?.supportPhone || "").replace(/\D/g, "").slice(-10);
  return { name: owner?.user?.name || null, email: owner?.user?.email || null, contact: digits.length === 10 ? `+91${digits}` : null };
}

async function ownerEmails(prisma, storeId) {
  const owners = await prisma.storeUser.findMany({ where: { storeId, role: "owner" }, include: { user: { select: { email: true } } } });
  return [...new Set(owners.map((o) => o.user?.email).filter(Boolean))];
}

/**
 * Sends one notice. Returns null if this `dedupeKey` was already sent.
 * Never throws — a failed email must not stop billing.
 */
async function notify(prisma, store, type, data = {}, { dedupeKey, email = true, log } = {}) {
  const build = TEMPLATES[type];
  if (!build) return null;
  const t = build(data);
  const key = dedupeKey || `${type}:${store.id}:${Date.now()}`;
  let row;
  try {
    row = await prisma.billingNotification.create({
      data: { storeId: store.id, type, dedupeKey: key, title: t.title, body: t.lines.join(" "), severity: t.severity },
    });
  } catch (err) {
    if (err.code === "P2002") return null; // already sent
    log?.warn({ err, type }, "billing: couldn't record notice");
    return null;
  }
  if (email) {
    try {
      const to = await ownerEmails(prisma, store.id);
      const { subject, html } = billingNotice({ storeName: store.name, title: t.title, lines: t.lines, rows: t.rows || [], cta: t.cta, ctaUrl: t.url });
      for (const addr of to) {
        await sendEmail(prisma, { to: addr, subject, html, template: `billing_${type}`, storeId: store.id, refType: "billing", refId: row.id, log });
      }
      await prisma.billingNotification.update({ where: { id: row.id }, data: { emailed: to.length > 0 } });
    } catch (err) {
      log?.warn({ err, type }, "billing: notice email failed");
    }
  }
  return row;
}

module.exports = { notify, ownerContact, TEMPLATES, inr };

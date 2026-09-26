const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");
const billingService = require("../billing/service");
const planChange = require("../billing/plan-change");
const commission = require("../billing/commission");

const updateStoreSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  currency: z.string().min(3).max(3).optional(),
  timezone: z.string().optional(),
  // A bare host, e.g. "shop.example.com" — no scheme/path. Empty string
  // clears it (Prisma's @unique on a nullable column tolerates any number
  // of nulls, but not two rows sharing "" — so an empty string is coerced
  // to null here rather than passed straight through).
  domain: z
    .string()
    .regex(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i, "Enter a valid domain")
    .optional()
    .or(z.literal(""))
    .nullable(),
});

/** Billing and store-level settings are for owners and admins. Staff can
 * see the billing screen but not change the plan, billing details, or
 * the store's domain — those affect what the business pays and where the
 * store lives. */
function assertCanManageBilling(request) {
  if (request.storeRole === "staff") {
    throw new HttpError(403, "Only the store owner or an admin can change billing.");
  }
}

const switchPlanSchema = z.object({
  planId: z.string().min(1),
});

async function getStoreHandler(request, reply) {
  reply.send({ store: request.store, role: request.storeRole });
}

async function updateStoreHandler(request, reply) {
  assertCanManageBilling(request);
  const body = updateStoreSchema.parse(request.body);
  if ("domain" in body) {
    body.domain = body.domain || null;
    // Every store already has {handle}.<root domain> for free (see
    // apps/storefront/lib/domain.js) — that namespace is reserved for the
    // platform's own subdomain routing, so a merchant "connecting" one of
    // those addresses here would just be pointing the field at itself,
    // and worse, an arbitrary *.{root domain} value would collide with
    // whatever real handle it happens to spell.
    const root = env.STOREFRONT_ROOT_DOMAIN.toLowerCase();
    if (body.domain && (body.domain.toLowerCase() === root || body.domain.toLowerCase().endsWith(`.${root}`))) {
      throw new HttpError(
        400,
        `Every store already gets its own ${request.store.handle}.${root} address for free — enter a domain you own instead.`
      );
    }
  }

  try {
    const store = await request.server.prisma.store.update({
      where: { id: request.store.id },
      data: body,
    });
    reply.send({ store });
  } catch (err) {
    if (err.code === "P2002") throw new HttpError(409, "That domain is already in use by another store");
    throw err;
  }
}

async function listPlansHandler(request, reply) {
  const plans = await request.server.prisma.plan.findMany({ orderBy: { priceMonthly: "asc" } });
  reply.send({ plans });
}

/** Switching plans for a store that already has a subscription — see
 * billing/plan-change.js for when each direction takes effect and how
 * Razorpay is kept in step. (A store's FIRST plan goes through
 * subscribeHandler below, which sets up the Razorpay mandate.) */
async function switchPlanHandler(request, reply) {
  assertCanManageBilling(request);
  const { planId } = switchPlanSchema.parse(request.body);
  const plan = await request.server.prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new HttpError(404, "Plan not found");
  const result = await planChange.changePlan(request.server.prisma, request.store, plan, {
    ensureRazorpayPlan: billingService.ensureRazorpayPlan,
  });
  reply.send(result);
}

/** Cancels a downgrade scheduled for the end of the paid period. */
async function cancelPendingPlanHandler(request, reply) {
  assertCanManageBilling(request);
  const result = await planChange.cancelPendingChange(request.server.prisma, request.store);
  reply.send(result);
}

/** Everything the billing screen shows, in one call: the plan catalog,
 * this store's subscription state, platform fees, usage against plan
 * limits, and invoices. Reachable regardless of accessState — fixing
 * billing is the whole point of this screen (requireActiveSubscription is
 * never applied to this module). */
async function getBillingHandler(request, reply) {
  const { prisma } = request.server;
  const storeId = request.store.id;
  const [plans, fees, invoices, productCount, staffCount] = await Promise.all([
    prisma.plan.findMany({ orderBy: { priceMonthly: "asc" } }),
    commission.feeSummary(prisma, storeId),
    prisma.platformInvoice.findMany({
      where: { storeId },
      orderBy: { issuedAt: "desc" },
      take: 24,
      select: { id: true, number: true, total: true, status: true, issuedAt: true, periodStart: true, periodEnd: true },
    }),
    prisma.product.count({ where: { storeId } }),
    prisma.storeUser.count({ where: { storeId } }),
  ]);
  reply.send({
    plans,
    billing: billingService.serializeBillingStatus(request.store),
    fees,
    usage: { products: productCount, staff: staffCount },
    invoices,
  });
}

// GSTIN: 2-digit state code, 10-char PAN, entity number, "Z", checksum.
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const billingDetailsSchema = z.object({
  billingName: z.string().trim().max(160).optional().nullable(),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(GSTIN_PATTERN, "Enter a valid 15-character GSTIN, e.g. 27ABCDE1234F1Z5")
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
  billingAddress: z.string().trim().max(500).optional().nullable(),
  billingState: z.string().trim().max(60).optional().nullable(),
});

/** The merchant's details printed on Oyklane's invoices to them. Only
 * affects invoices issued from now on — issued invoices keep the details
 * they were issued with. */
async function updateBillingDetailsHandler(request, reply) {
  assertCanManageBilling(request);
  const data = billingDetailsSchema.parse(request.body);
  const store = await request.server.prisma.store.update({ where: { id: request.store.id }, data });
  reply.send({ billing: billingService.serializeBillingStatus(store) });
}

/** One invoice, for the printable invoice page. Scoped to the caller's
 * store — an invoice id from another store is a 404, not a leak. */
async function getInvoiceHandler(request, reply) {
  const invoice = await request.server.prisma.platformInvoice.findFirst({
    where: { id: request.params.id, storeId: request.store.id },
  });
  if (!invoice) throw new HttpError(404, "Invoice not found");
  reply.send({ invoice });
}

const subscribeSchema = z.object({ planId: z.string().min(1) });

/** Step 1 of going from no_plan (or re-subscribing after a cancellation)
 * to trialing: pick a plan, get back a Razorpay subscription to hand to
 * the checkout widget. Nothing in our database changes yet — that only
 * happens once the mandate is actually authorized (subscribeVerifyHandler). */
async function subscribeHandler(request, reply) {
  assertCanManageBilling(request);
  const { planId } = subscribeSchema.parse(request.body);
  const plan = await request.server.prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new HttpError(404, "Plan not found");

  const result = await billingService.createSubscription(request.server.prisma, request.store, plan);
  if (result.sandbox) {
    // Local test mode — no mandate step; the trial has already started.
    return reply.send({ sandbox: true, trialEndsAt: result.trialEndsAt, planId: plan.id });
  }
  const { subscriptionId, razorpayKeyId, trialEndsAt } = result;
  reply.send({ subscriptionId, razorpayKeyId, trialEndsAt, planId: plan.id });
}

const subscribeVerifySchema = z.object({
  // Still accepted from older clients, but ignored: the plan is read from
  // Razorpay's record of the subscription (billingService.resolveMandatePlan).
  planId: z.string().optional(),
  razorpay_payment_id: z.string().min(1),
  razorpay_subscription_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

/** Step 2 — the checkout widget's own callback, proven genuine by
 * signature (never trusting a client-reported "it worked" on its own; see
 * billingService.verifySubscriptionSignature). This is the one place a
 * store's subscriptionStatus actually becomes "trialing." */
async function subscribeVerifyHandler(request, reply) {
  assertCanManageBilling(request);
  const body = subscribeVerifySchema.parse(request.body);
  if (billingService.billingMode() !== "razorpay") {
    throw new HttpError(400, "There's no Razorpay mandate to verify on this platform.");
  }
  if (!billingService.verifySubscriptionSignature(body)) {
    throw new HttpError(400, "Payment verification failed.");
  }
  const plan = await billingService.resolveMandatePlan(
    request.server.prisma,
    request.store,
    body.razorpay_subscription_id
  );

  // The subscription's real start_at (set when it was created in
  // subscribeHandler, ~30 days out) is authoritative on Razorpay's side but
  // isn't persisted anywhere here until this call — verify runs moments
  // after create in the checkout flow, so "30 days from now" at verify time
  // is the same date for all practical purposes, without a round trip to
  // fetch the subscription back from Razorpay just to read it.
  const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const store = await billingService.activateSubscription(request.server.prisma, request.store, plan, {
    subscriptionId: body.razorpay_subscription_id,
    trialEndsAt,
  });
  reply.send({ store });
}

module.exports = {
  getStoreHandler,
  updateStoreHandler,
  listPlansHandler,
  switchPlanHandler,
  cancelPendingPlanHandler,
  updateBillingDetailsHandler,
  getInvoiceHandler,
  getBillingHandler,
  subscribeHandler,
  subscribeVerifyHandler,
};

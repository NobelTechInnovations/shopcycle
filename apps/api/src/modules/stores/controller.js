const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");
const billingService = require("../billing/service");

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

const switchPlanSchema = z.object({
  planId: z.string().min(1),
});

async function getStoreHandler(request, reply) {
  reply.send({ store: request.store, role: request.storeRole });
}

async function updateStoreHandler(request, reply) {
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

/** Changing tiers for a store that's already actively subscribed — never
 * the first plan a store ever goes on (that's subscribeHandler below,
 * which sets up the real Razorpay mandate). Only adjusts limits/features
 * in this database; it does not change which Razorpay plan the existing
 * subscription bills against, so a merchant moving, say, Starter → Premium
 * this way keeps paying the Starter price until they re-subscribe — noted
 * here because it's a real limitation, not an oversight. */
async function switchPlanHandler(request, reply) {
  if (request.store.subscriptionStatus === "no_plan") {
    throw new HttpError(400, "Choose a plan and authorize billing first — see /api/store/subscribe.");
  }
  const { planId } = switchPlanSchema.parse(request.body);
  const plan = await request.server.prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new HttpError(404, "Plan not found");

  const productCount = await request.server.prisma.product.count({ where: { storeId: request.store.id } });
  if (productCount > plan.productLimit) {
    throw new HttpError(
      400,
      `This plan allows up to ${plan.productLimit} products — you currently have ${productCount}. Remove some products first.`
    );
  }
  const staffCount = await request.server.prisma.storeUser.count({ where: { storeId: request.store.id } });
  if (staffCount > plan.staffLimit) {
    throw new HttpError(
      400,
      `This plan allows up to ${plan.staffLimit} staff accounts — you currently have ${staffCount}. Remove some team members first.`
    );
  }

  const store = await request.server.prisma.store.update({
    where: { id: request.store.id },
    data: { planId },
    include: { plan: true },
  });
  reply.send({ store });
}

/** What the billing screen itself needs: the full plan catalog (so a
 * blocked merchant can pick one) plus this store's current billing state
 * — reachable regardless of accessState, since fixing that is the whole
 * point of this endpoint (see requireActiveSubscription, never applied to
 * this module). */
async function getBillingHandler(request, reply) {
  const plans = await request.server.prisma.plan.findMany({ orderBy: { priceMonthly: "asc" } });
  reply.send({ plans, billing: billingService.serializeBillingStatus(request.store) });
}

const subscribeSchema = z.object({ planId: z.string().min(1) });

/** Step 1 of going from no_plan (or re-subscribing after a cancellation)
 * to trialing: pick a plan, get back a Razorpay subscription to hand to
 * the checkout widget. Nothing in our database changes yet — that only
 * happens once the mandate is actually authorized (subscribeVerifyHandler). */
async function subscribeHandler(request, reply) {
  const { planId } = subscribeSchema.parse(request.body);
  const plan = await request.server.prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new HttpError(404, "Plan not found");

  const { subscriptionId, razorpayKeyId, trialEndsAt } = await billingService.createSubscription(
    request.server.prisma,
    request.store,
    plan
  );
  reply.send({ subscriptionId, razorpayKeyId, trialEndsAt, planId: plan.id });
}

const subscribeVerifySchema = z.object({
  planId: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_subscription_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

/** Step 2 — the checkout widget's own callback, proven genuine by
 * signature (never trusting a client-reported "it worked" on its own; see
 * billingService.verifySubscriptionSignature). This is the one place a
 * store's subscriptionStatus actually becomes "trialing." */
async function subscribeVerifyHandler(request, reply) {
  const body = subscribeVerifySchema.parse(request.body);
  if (!billingService.verifySubscriptionSignature(body)) {
    throw new HttpError(400, "Payment verification failed.");
  }
  const plan = await request.server.prisma.plan.findUnique({ where: { id: body.planId } });
  if (!plan) throw new HttpError(404, "Plan not found");

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
  getBillingHandler,
  subscribeHandler,
  subscribeVerifyHandler,
};

const { slugify } = require("@shopcycle/utils");
const themesService = require("../modules/themes/service");
const { GRACE_DAYS_BEFORE_PLAN_REQUIRED } = require("../modules/billing/access");

// A store's handle doubles as its default storefront subdomain —
// {handle}.<root domain> (see apps/storefront/lib/domain.js) — so none of
// these can ever be handed out: each is either a reserved platform
// subdomain (store., admin., api., www., ...) or a non-store technical
// host (cdn/mail/ftp) that resolving {handle}.<root domain> must never
// mistake for an actual store.
const RESERVED_HANDLES = new Set([
  "www", "store", "admin", "api", "app", "assets", "cdn", "static",
  "mail", "smtp", "ftp", "blog", "help", "support", "status", "docs",
]);

/**
 * Everything a brand-new store needs before a merchant should ever see
 * it: a unique handle, ownership for the given user, and a default theme
 * actually installed (Classic) — without this last step every new store
 * hit the "no active theme installed" 404 wall the first time anyone
 * visited its storefront, which is exactly the bug this function exists
 * to close. `installTheme` already auto-activates a store's first theme,
 * so this store is live the moment registration (or "add another store")
 * completes.
 *
 * No plan is assigned here and no trial starts yet — there is no more Free
 * plan (see seed.js's Starter/Premium catalog). A brand-new store starts
 * `subscriptionStatus: "no_plan"` with a `mandateDeadline` a couple of days
 * out; the admin stays usable until that deadline passes (see
 * billing/access.js), which is the window for the owner to pick a plan and
 * authorize the Razorpay mandate (POST /api/store/subscribe) — only that
 * call ever sets a trialEndsAt, and it's the real one-month free trial.
 */
async function provisionStore(tx, { name, ownerId, role = "owner" }) {
  const baseHandle = slugify(name) || "store";
  let handle = baseHandle;
  let suffix = 1;
  while (RESERVED_HANDLES.has(handle) || (await tx.store.findUnique({ where: { handle } }))) {
    handle = `${baseHandle}-${suffix++}`;
  }

  const store = await tx.store.create({
    data: {
      name,
      handle,
      planId: null,
      subscriptionStatus: "no_plan",
      mandateDeadline: new Date(Date.now() + GRACE_DAYS_BEFORE_PLAN_REQUIRED * 24 * 60 * 60 * 1000),
      storeUsers: { create: { userId: ownerId, role } },
    },
  });

  await themesService.installTheme(tx, store.id, "classic");

  return store;
}

module.exports = { provisionStore };

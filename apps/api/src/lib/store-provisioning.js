const crypto = require("crypto");
const { slugify, HttpError } = require("@shopcycle/utils");
const themesService = require("../modules/themes/service");
const subscriptions = require("../modules/billing/subscriptions");

// A store's handle doubles as its default storefront subdomain —
// {handle}.<root domain> (see apps/storefront/lib/domain.js) — so none of
// these can ever be handed out: each is either a reserved platform
// subdomain (store., admin., api., www., ...) or a non-store technical
// host (cdn/mail/ftp) that resolving {handle}.<root domain> must never
// mistake for an actual store.
const RESERVED_HANDLES = new Set([
  "www", "store", "admin", "api", "app", "assets", "cdn", "static",
  "mail", "smtp", "ftp", "blog", "help", "support", "status", "docs",
  "superadmin", "platform", "console", "dashboard", "login", "account", "checkout",
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
 * Billing is per store: every new store — a second one by the same owner
 * included — starts its own free trial here (billing/subscriptions.js),
 * then the ₹99 first month and the regular price, like any other store.
 */
async function provisionStore(tx, { name, ownerId, planKey, role = "owner" }) {
  // Every new store starts on the plan its owner chose (its free trial,
  // then the ₹99 first month, run on that plan).
  const plan = planKey ? await tx.plan.findFirst({ where: { key: String(planKey), isActive: true } }) : null;
  if (!plan) throw new HttpError(400, "Choose a plan for your store.");

  // The handle is the store's free address ({handle}.<root>). If the name
  // is taken, add a short random tag — sonchiri-2f3a — rather than a
  // counter that hints at how many stores share the name.
  const baseHandle = (slugify(name) || "store").slice(0, 34).replace(/-+$/, "") || "store";
  let handle = baseHandle;
  for (let attempt = 0; RESERVED_HANDLES.has(handle) || (await tx.store.findUnique({ where: { handle } })); attempt += 1) {
    const tag = crypto.randomBytes(attempt < 5 ? 2 : 4).toString("hex");
    handle = `${baseHandle}-${tag}`;
  }

  const store = await tx.store.create({
    data: {
      name,
      handle,
      storeUsers: { create: { userId: ownerId, role } },
    },
  });

  await themesService.installTheme(tx, store.id, "classic");
  await subscriptions.createForStore(tx, store, { planId: plan.id });

  return store;
}

module.exports = { provisionStore, RESERVED_HANDLES };

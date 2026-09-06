const { slugify } = require("@shopcycle/utils");
const themesService = require("../modules/themes/service");

/**
 * Everything a brand-new store needs before a merchant should ever see
 * it: a unique handle, a free-trial plan, ownership for the given user,
 * and a default theme actually installed (Classic) — without this last
 * step every new store hit the "no active theme installed" 404 wall the
 * first time anyone visited its storefront, which is exactly the bug
 * this function exists to close. `installTheme` already auto-activates a
 * store's first theme, so this store is live the moment registration (or
 * "add another store") completes.
 */
async function provisionStore(tx, { name, ownerId, role = "owner" }) {
  const baseHandle = slugify(name) || "store";
  let handle = baseHandle;
  let suffix = 1;
  while (await tx.store.findUnique({ where: { handle } })) {
    handle = `${baseHandle}-${suffix++}`;
  }

  const freePlan = await tx.plan.findUnique({ where: { name: "Free" } });

  const store = await tx.store.create({
    data: {
      name,
      handle,
      planId: freePlan?.id,
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      storeUsers: { create: { userId: ownerId, role } },
    },
  });

  await themesService.installTheme(tx, store.id, "classic");

  return store;
}

module.exports = { provisionStore };

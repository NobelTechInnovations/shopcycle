const bcrypt = require("bcryptjs");
const { HttpError } = require("@shopcycle/utils");
const { provisionStore } = require("../../lib/store-provisioning");

// A real bcrypt hash of a random string, compared against when the email
// doesn't exist — so "no such account" takes as long as "wrong password"
// and response timing can't be used to discover which emails are registered.
const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8.6fXhjMpJ9C3kWo8wP2E6jz1rQ4mC";

function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

/** Emails are matched case-insensitively — "Owner@X.com" and
 * "owner@x.com" are the same person. New accounts are stored lowercase;
 * the insensitive lookup also finds any older mixed-case rows. */
function findUserByEmail(prisma, email) {
  return prisma.user.findFirst({ where: { email: { equals: normalizeEmail(email), mode: "insensitive" } } });
}

async function register(prisma, { name, email, password, storeName, plan }) {
  const existing = await findUserByEmail(prisma, email);
  if (existing) {
    throw new HttpError(409, "An account with that email already exists");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const { user, store } = await prisma.$transaction(
    async (tx) => {
      const user = await tx.user.create({ data: { name, email: normalizeEmail(email), passwordHash } });
      const store = await provisionStore(tx, { name: storeName, ownerId: user.id, planKey: plan });
      return { user, store };
    },
    { timeout: 30000 }
  );

  return { user, store };
}

/** Throws the same 401 for "no such email" and "wrong password" (and
 * spends the same bcrypt time on both) — the two must be indistinguishable
 * to a caller, or the login form becomes a way to test which emails exist. */
async function login(prisma, { email, password }) {
  const user = await findUserByEmail(prisma, email);
  const valid = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
  if (!user || !valid) throw new HttpError(401, "Invalid email or password");

  if (user.status === "disabled") {
    throw new HttpError(403, "This account has been disabled");
  }

  return user;
}

/** The store a freshly-issued session should land on: the account's
 * oldest membership. Switching stores re-issues the session after this. */
async function defaultStoreIdFor(prisma, userId) {
  const storeUser = await prisma.storeUser.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } });
  return storeUser?.storeId || null;
}

function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    status: user.status,
    isSuperAdmin: user.isSuperAdmin,
    twoFactorEnabled: Boolean(user.totpEnabledAt),
    emailVerified: Boolean(user.emailVerifiedAt),
  };
}

module.exports = { register, login, serializeUser, defaultStoreIdFor, normalizeEmail, findUserByEmail };

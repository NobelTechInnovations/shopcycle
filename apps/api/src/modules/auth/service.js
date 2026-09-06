const bcrypt = require("bcryptjs");
const { HttpError } = require("@shopcycle/utils");
const { provisionStore } = require("../../lib/store-provisioning");

async function register(prisma, { name, email, password, storeName }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new HttpError(409, "An account with that email already exists");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const { user, store } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { name, email, passwordHash } });
    const store = await provisionStore(tx, { name: storeName, ownerId: user.id });
    return { user, store };
  });

  return { user, store };
}

async function login(prisma, { email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new HttpError(401, "Invalid email or password");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new HttpError(401, "Invalid email or password");

  if (user.status === "disabled") {
    throw new HttpError(403, "This account has been disabled");
  }

  return user;
}

/** The store a freshly-issued session should land on: the account's
 * oldest membership. `switchStore` (team module... actually stores
 * module) is what moves a session to a different one after this. */
async function defaultStoreIdFor(prisma, userId) {
  const storeUser = await prisma.storeUser.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } });
  return storeUser?.storeId || null;
}

function serializeUser(user) {
  return { id: user.id, name: user.name, email: user.email, status: user.status, isSuperAdmin: user.isSuperAdmin };
}

module.exports = { register, login, serializeUser, defaultStoreIdFor };

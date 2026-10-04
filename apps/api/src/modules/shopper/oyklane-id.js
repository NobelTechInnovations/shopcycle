const customersRepository = require("../customers/repository");
const { toE164 } = require("../../lib/phone");
const service = require("./service");

/**
 * One shopper sign-in across every Oyklane store ("Oyklane account").
 *
 * Signing in to any store with something that proves who you are — an
 * emailed code, Google, a phone code, or a password on an account whose
 * email was proven before — also gives the browser an Oyklane ID: a signed
 * token saying "this person owns <email> / <phone>". The storefront keeps
 * it in an HttpOnly cookie shared by every *.oyklane.com store. On another
 * store it signs the shopper in:
 *   - to the account they already have there (same proven email or phone),
 *     on any page;
 *   - or, when they open their account, sign-in or checkout (a click, not
 *     a script), to a new account made from those details — so a store
 *     only learns who a shopper is once the shopper chooses to use it.
 * Only proven details travel: an email typed at sign-up but never
 * confirmed is not in the ID.
 */

const ID_TTL = "90d";
const display = (phone) => `+${phone}`;

/** The Oyklane ID for a shopper who just signed in, or null when nothing
 * about them is proven. */
function issue(fastify, customer) {
  if (!customer) return null;
  const e = customer.emailVerifiedAt ? service.normalizeEmail(customer.email) : null;
  const p = customer.phoneVerifiedAt && customer.phone ? toE164(customer.phone) : null;
  if (!e && !p) return null;
  return fastify.jwt.sign(
    {
      aud: "oyklane-id",
      ...(e && { e }),
      ...(p && { p }),
      // With only the phone proven, the email they gave — used for a new
      // account elsewhere only if no account there has it already.
      ...(!e && customer.email && { ue: service.normalizeEmail(customer.email) }),
      n: String(customer.name || "").slice(0, 120),
    },
    { expiresIn: ID_TTL }
  );
}

function read(fastify, token) {
  if (!token || typeof token !== "string" || token.length > 3000) return null;
  try {
    const id = fastify.jwt.verify(token);
    return id.aud === "oyklane-id" && (id.e || id.p) ? id : null;
  } catch {
    return null;
  }
}

/**
 * Signs the ID's holder in to `store`: { token, created } — or { none }
 * (no account here and `create` is off, or one can't safely be made), or
 * { invalid } (expired or forged: the storefront drops the cookie).
 */
async function signIn(fastify, store, idToken, { create = false } = {}) {
  const id = read(fastify, idToken);
  if (!id) return { invalid: true };
  const prisma = fastify.prisma;

  let customer = null;
  if (id.e) customer = await customersRepository.findByEmail(prisma, store.id, id.e);
  if (!customer && id.p) {
    customer = await prisma.customer.findFirst({ where: { storeId: store.id, phone: display(id.p), phoneVerifiedAt: { not: null } }, orderBy: { phoneVerifiedAt: "desc" } });
  }

  let created = false;
  if (!customer) {
    if (!create) return { none: true };
    const email = id.e || id.ue;
    if (!email) return { none: true };
    // Only the phone is proven: the email can't be one this store already
    // has (that account's orders need the email proven).
    if (!id.e && (await customersRepository.findByEmail(prisma, store.id, email))) return { none: true };
    customer = await customersRepository.create(prisma, store.id, { email, name: id.n || email.split("@")[0] });
    created = true;
  }

  // What the ID proves is now proven at this store too.
  const data = { lastSignInAt: new Date() };
  if (id.e && service.normalizeEmail(customer.email) === id.e && !customer.emailVerifiedAt) data.emailVerifiedAt = new Date();
  if (id.p && !customer.phoneVerifiedAt && (!customer.phone || toE164(customer.phone) === id.p)) {
    const taken = await prisma.customer.findFirst({ where: { storeId: store.id, phone: display(id.p), phoneVerifiedAt: { not: null }, id: { not: customer.id } }, select: { id: true } });
    if (!taken) Object.assign(data, { phone: display(id.p), phoneVerifiedAt: new Date() });
  }
  customer = await prisma.customer.update({ where: { id: customer.id }, data });
  return { token: service.signSession(fastify, store, customer, "oyklane"), created, customer };
}

module.exports = { issue, read, signIn, ID_TTL };

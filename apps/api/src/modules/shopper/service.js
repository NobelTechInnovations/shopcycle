const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { HttpError } = require("@shopcycle/utils");
const { sendEmail } = require("../../lib/mailer");
const { safeEqual } = require("../../lib/crypto");
const templates = require("../../emails/templates");
const customersRepository = require("../customers/repository");
const { toE164 } = require("../../lib/phone");

/**
 * Shopper accounts, for one store only. Two ways in:
 *   - a 6-digit code emailed to them (ShopperOtp) — this also proves they
 *     own the address (emailVerifiedAt);
 *   - an email and password, set at sign-up or later from the account page.
 * A password account whose email was never verified only sees orders
 * placed while signed in to it, and can't be created over an existing
 * customer record that already holds someone's orders or address.
 * Guest checkout keeps working exactly as before — an account just
 * remembers their details and shows their orders.
 *
 * Session: a JWT with aud "shopper", the store id (`sid`) and the
 * customer's tokenVersion (`tv`). The storefront keeps it in an HttpOnly
 * cookie on the store's own domain and hands it to the API per request
 * (x-shopper-token). A token from one store is refused by every other.
 */

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_WINDOW = 3; // per email, per store, per 10 minutes
const SESSION_TTL = "30d";
const MIN_PASSWORD = 8;
// Lets a shopper who signed in by code set a new password without the old
// one (the "forgot password" path) — only shortly after that sign-in.
const CODE_SESSION_RESET_WINDOW_S = 30 * 60;
// Compared against when no password exists, so "no such account" takes as
// long as "wrong password".
const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8.6fXhjMpJ9C3kWo8wP2E6jz1rQ4mC";

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

function hashCode(storeId, email, code) {
  // Salted with store + email so equal codes never share a hash.
  return crypto.createHash("sha256").update(`${storeId}:${email}:${code}`).digest("hex");
}

async function requestCode(prisma, store, rawEmail, log) {
  const email = normalizeEmail(rawEmail);
  const recent = await prisma.shopperOtp.count({
    where: { storeId: store.id, email, createdAt: { gt: new Date(Date.now() - CODE_TTL_MS) } },
  });
  if (recent >= MAX_CODES_PER_WINDOW) {
    throw new HttpError(429, "We've sent a few codes already. Check your inbox (and spam), or try again in 10 minutes.");
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.$transaction([
    // Only the newest code works.
    prisma.shopperOtp.updateMany({ where: { storeId: store.id, email, consumedAt: null }, data: { consumedAt: new Date() } }),
    prisma.shopperOtp.create({
      data: { storeId: store.id, email, codeHash: hashCode(store.id, email, code), expiresAt: new Date(Date.now() + CODE_TTL_MS) },
    }),
  ]);

  const { subject, html } = templates.signInCode({ store, code });
  await sendEmail(prisma, {
    to: email,
    subject,
    html,
    template: "sign_in_code",
    storeId: store.id,
    fromName: store.name,
    replyTo: store.supportEmail || undefined,
    refType: "shopper",
    refId: email,
    // The code is in the real subject line; the store's email log (which
    // staff can read) must never show it.
    logSubject: `Sign-in code for ${store.name}`,
    log,
  });
}

/** Checks the code and returns the (possibly new) Customer. Wrong guesses
 * count against the code; the fifth burns it. */
async function verifyCode(prisma, store, rawEmail, rawCode) {
  const email = normalizeEmail(rawEmail);
  const code = String(rawCode || "").replace(/\D/g, "");
  const otp = await prisma.shopperOtp.findFirst({
    where: { storeId: store.id, email, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  const expired = !otp || otp.expiresAt < new Date() || otp.attempts >= MAX_ATTEMPTS;
  if (expired) throw new HttpError(400, "That code has expired. Request a new one.");

  if (code.length !== 6 || !safeEqual(otp.codeHash, hashCode(store.id, email, code))) {
    const attempts = otp.attempts + 1;
    await prisma.shopperOtp.update({
      where: { id: otp.id },
      data: { attempts, ...(attempts >= MAX_ATTEMPTS && { consumedAt: new Date() }) },
    });
    throw new HttpError(
      400,
      attempts >= MAX_ATTEMPTS ? "Too many wrong codes. Request a new one." : "That code isn't right. Check the email and try again."
    );
  }

  // Spend it atomically — a code can be used once.
  const { count } = await prisma.shopperOtp.updateMany({ where: { id: otp.id, consumedAt: null }, data: { consumedAt: new Date() } });
  if (count !== 1) throw new HttpError(400, "That code has already been used. Request a new one.");

  const existing = await customersRepository.findByEmail(prisma, store.id, email);
  const customer = existing
    ? existing
    : await customersRepository.create(prisma, store.id, { email, name: email.split("@")[0] });
  return prisma.customer.update({
    where: { id: customer.id },
    data: { lastSignInAt: new Date(), emailVerifiedAt: customer.emailVerifiedAt || new Date() },
  });
}

/** `method` is how they signed in ("code" or "password"). */
function signSession(fastify, store, customer, method = "code") {
  return fastify.jwt.sign(
    { sub: customer.id, sid: store.id, tv: customer.tokenVersion ?? 0, aud: "shopper", m: method },
    { expiresIn: SESSION_TTL }
  );
}

function checkPassword(password) {
  const value = String(password || "");
  if (value.length < MIN_PASSWORD) throw new HttpError(400, `Use at least ${MIN_PASSWORD} characters for your password.`);
  if (value.length > 200) throw new HttpError(400, "That password is too long.");
  return value;
}

/** A customer record a new sign-up may take over: nobody has signed in to
 * it, and it holds nothing private yet (a newsletter signup, say). */
async function claimable(prisma, customer) {
  if (customer.passwordHash || customer.emailVerifiedAt) return false;
  if (customer.address1 || customer.phone) return false;
  const orders = await prisma.order.count({ where: { storeId: customer.storeId, OR: [{ customerId: customer.id }, { email: { equals: customer.email, mode: "insensitive" } }] } });
  return orders === 0;
}

async function register(prisma, store, input) {
  const email = normalizeEmail(input.email);
  const password = checkPassword(input.password);
  const name = String(input.name || "").trim() || email.split("@")[0];
  const existing = await customersRepository.findByEmail(prisma, store.id, email);
  if (existing && existing.passwordHash) {
    throw new HttpError(409, "There's already an account with this email. Sign in instead.");
  }
  if (existing && !(await claimable(prisma, existing))) {
    // They've ordered or signed in here before. Typing the address proves
    // nothing, so their order history needs an emailed code first.
    throw new HttpError(
      409,
      "You've shopped here before with this email. To keep your orders private, sign in with an email code first — you can set a password from your account after that."
    );
  }
  const data = {
    name,
    passwordHash: await bcrypt.hash(password, 10),
    passwordSetAt: new Date(),
    lastSignInAt: new Date(),
    ...(input.acceptsMarketing && { acceptsEmailMarketing: true }),
  };
  if (existing) return prisma.customer.update({ where: { id: existing.id }, data });
  const created = await customersRepository.create(prisma, store.id, { email, name });
  return prisma.customer.update({ where: { id: created.id }, data });
}

async function passwordSignIn(prisma, store, rawEmail, password) {
  const email = normalizeEmail(rawEmail);
  const customer = await customersRepository.findByEmail(prisma, store.id, email);
  const ok = await bcrypt.compare(String(password || ""), customer?.passwordHash || DUMMY_HASH);
  if (!customer?.passwordHash || !ok) throw new HttpError(400, "Email or password is incorrect.");
  return prisma.customer.update({ where: { id: customer.id }, data: { lastSignInAt: new Date() } });
}

/** Sets or changes the password from the account page. The current one is
 * needed, unless they signed in by emailed code in the last half hour
 * (how a forgotten password is replaced). Other devices are signed out;
 * the caller gets a fresh session for this one. */
async function setPassword(prisma, customer, { currentPassword, password }) {
  const next = checkPassword(password);
  const viaRecentCode = customer.signInMethod === "code" && Date.now() / 1000 - (customer.signedInAt || 0) < CODE_SESSION_RESET_WINDOW_S;
  if (customer.passwordHash && !viaRecentCode) {
    if (!(await bcrypt.compare(String(currentPassword || ""), customer.passwordHash))) {
      throw new HttpError(400, "Your current password isn't right.");
    }
  }
  return prisma.customer.update({
    where: { id: customer.id },
    data: { passwordHash: await bcrypt.hash(next, 10), passwordSetAt: new Date(), tokenVersion: { increment: 1 } },
  });
}

/** The signed-in shopper for this store, or null. Anything off — wrong
 * store, revoked, a seller/platform token — is simply "not signed in". */
async function customerFromToken(fastify, store, token) {
  if (!token || typeof token !== "string" || token.length > 2000) return null;
  let payload;
  try {
    payload = fastify.jwt.verify(token);
  } catch {
    return null;
  }
  if (payload.aud !== "shopper" || payload.sid !== store.id || !payload.sub) return null;
  const customer = await fastify.prisma.customer.findFirst({ where: { id: payload.sub, storeId: store.id } });
  if (!customer || (payload.tv ?? 0) !== customer.tokenVersion) return null;
  // Sessions from before passwords existed were all by code.
  return Object.assign(customer, { signInMethod: payload.m === "password" ? "password" : "code", signedInAt: payload.iat || 0 });
}

async function updateProfile(prisma, store, customer, input) {
  const phone = input.phone || null;
  const samePhone = toE164(phone) && toE164(phone) === toE164(customer.phone);
  return customersRepository.update(prisma, customer.id, {
    name: input.name,
    phone: samePhone ? customer.phone : phone,
    // A changed number isn't verified until it's used to sign in by code.
    ...(!samePhone && customer.phoneVerifiedAt && { phoneVerifiedAt: null }),
    address1: input.address1 || null,
    address2: input.address2 || null,
    city: input.city || null,
    province: input.province || null,
    zip: input.zip || null,
    country: input.country || null,
    acceptsEmailMarketing: Boolean(input.acceptsEmailMarketing),
  });
}

/** Signs the shopper out on every device. */
async function signOutEverywhere(prisma, customer) {
  await prisma.customer.update({ where: { id: customer.id }, data: { tokenVersion: { increment: 1 } } });
}

module.exports = {
  requestCode,
  verifyCode,
  register,
  passwordSignIn,
  setPassword,
  signSession,
  customerFromToken,
  updateProfile,
  signOutEverywhere,
  normalizeEmail,
  claimable,
  SESSION_TTL,
};

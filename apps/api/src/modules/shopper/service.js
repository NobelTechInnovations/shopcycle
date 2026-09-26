const crypto = require("crypto");
const { HttpError } = require("@shopcycle/utils");
const { sendEmail } = require("../../lib/mailer");
const { safeEqual } = require("../../lib/crypto");
const templates = require("../../emails/templates");
const customersRepository = require("../customers/repository");

/**
 * Shopper accounts. There are no passwords: a shopper signs in with a
 * 6-digit code emailed to them (ShopperOtp), and gets a session for that
 * one store only. Guest checkout keeps working exactly as before — an
 * account just remembers their details and shows their orders.
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

function signSession(fastify, store, customer) {
  return fastify.jwt.sign(
    { sub: customer.id, sid: store.id, tv: customer.tokenVersion ?? 0, aud: "shopper" },
    { expiresIn: SESSION_TTL }
  );
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
  return customer;
}

async function updateProfile(prisma, store, customer, input) {
  return customersRepository.update(prisma, customer.id, {
    name: input.name,
    phone: input.phone || null,
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

module.exports = { requestCode, verifyCode, signSession, customerFromToken, updateProfile, signOutEverywhere, normalizeEmail };

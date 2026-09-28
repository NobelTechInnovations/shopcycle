const crypto = require("crypto");
const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");
const { toE164 } = require("../../lib/phone");
const { safeEqual } = require("../../lib/crypto");
const messaging = require("../../lib/messaging");
const customersRepository = require("../customers/repository");
const service = require("./service");

/**
 * Shopper sign-in by phone (the paid "Phone Login" app): a 6-digit code by
 * SMS or WhatsApp. Only a customer whose phone was verified this way can
 * be signed into — a number typed at checkout proves nothing. A new number
 * finishes sign-up with a name and email; taking over an account that
 * already has history needs that email's code too.
 */
const APP_KEY = "phone-login";
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_WINDOW = 3; // per number, per store, per 10 minutes

const hashCode = (storeId, phone, code) => crypto.createHash("sha256").update(`phone:${storeId}:${phone}:${code}`).digest("hex");
const allowedCountries = () => env.PHONE_LOGIN_COUNTRIES.split(",").map((c) => c.trim().replace(/^\+/, "")).filter(Boolean);
const display = (phone) => `+${phone}`;

/** Whether the store offers phone sign-in, and over which channels. */
async function config(prisma, store) {
  const install = await prisma.storeApp.findFirst({ where: { storeId: store.id, app: { key: APP_KEY } }, select: { settings: true } });
  if (!install) return { enabled: false, channels: [] };
  const setting = install.settings?.channel;
  const wanted = setting === "whatsapp" ? ["whatsapp"] : setting === "both" ? ["sms", "whatsapp"] : ["sms"];
  const channels = liveChannels(wanted);
  return { enabled: channels.length > 0, channels };
}

/** The channels that can carry a code right now. Without a provider,
 * codes are only logged — fine locally, useless in production. */
function liveChannels(wanted = ["sms", "whatsapp"]) {
  const live = messaging.channels();
  return wanted.filter((c) => live[c] || env.NODE_ENV !== "production");
}

function parsePhone(raw) {
  const phone = toE164(raw);
  if (!phone) throw new HttpError(400, "Enter a valid mobile number.");
  const countries = allowedCountries();
  if (!countries.some((cc) => phone.startsWith(cc))) {
    throw new HttpError(400, `Phone sign-in works with ${countries.map((c) => `+${c}`).join(", ")} numbers. Sign in with your email instead.`);
  }
  return phone;
}

/** Sends a code. `cfg` lets express checkout (One-Click app) use its own
 * channels; Phone Login's come from its app settings. */
async function requestCode(prisma, store, { phone: rawPhone, channel }, log, { cfg: given } = {}) {
  const cfg = given || (await config(prisma, store));
  if (!cfg.enabled) throw new HttpError(404, "Phone sign-in isn't available in this store.");
  const ch = cfg.channels.includes(channel) ? channel : cfg.channels[0];
  const phone = parsePhone(rawPhone);

  const since = new Date(Date.now() - CODE_TTL_MS);
  const [recent, today] = await Promise.all([
    prisma.shopperPhoneOtp.count({ where: { storeId: store.id, phone, createdAt: { gt: since } } }),
    prisma.shopperPhoneOtp.count({ where: { storeId: store.id, createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
  ]);
  if (recent >= MAX_CODES_PER_WINDOW) throw new HttpError(429, "We've sent a few codes already. Check your messages, or try again in 10 minutes.");
  if (today >= env.PHONE_LOGIN_DAILY_LIMIT) throw new HttpError(429, "Phone sign-in is busy right now. Please sign in with your email instead.");

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const otp = await prisma.$transaction(async (tx) => {
    await tx.shopperPhoneOtp.updateMany({ where: { storeId: store.id, phone, consumedAt: null }, data: { consumedAt: new Date() } });
    return tx.shopperPhoneOtp.create({ data: { storeId: store.id, phone, channel: ch, codeHash: hashCode(store.id, phone, code), expiresAt: new Date(Date.now() + CODE_TTL_MS) } });
  });

  const sent = await messaging.sendOtp(prisma, { to: phone, code, channel: ch, storeId: store.id, storeName: store.name, log });
  if (sent.status === "failed") {
    await prisma.shopperPhoneOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
    throw new HttpError(502, "We couldn't send the code. Try again, or sign in with your email.");
  }
  return { phone: display(phone), channel: ch };
}

/** Checks the code. Returns { customer } for a known verified number, or
 * { phone } when the number is new and sign-up must be finished. */
async function verifyCode(prisma, store, { phone: rawPhone, code: rawCode }) {
  const phone = parsePhone(rawPhone);
  await checkCode(prisma, store, phone, rawCode);
  const customer = await verifiedCustomer(prisma, store, phone);
  if (customer) return { customer: await prisma.customer.update({ where: { id: customer.id }, data: { lastSignInAt: new Date() } }) };
  return { phone };
}

/** Uses up the latest code for `phone` if `rawCode` matches it; throws otherwise. */
async function checkCode(prisma, store, phone, rawCode) {
  const code = String(rawCode || "").replace(/\D/g, "");
  const otp = await prisma.shopperPhoneOtp.findFirst({ where: { storeId: store.id, phone, consumedAt: null }, orderBy: { createdAt: "desc" } });
  if (!otp || otp.expiresAt < new Date() || otp.attempts >= MAX_ATTEMPTS) throw new HttpError(400, "That code has expired. Request a new one.");

  if (code.length !== 6 || !safeEqual(otp.codeHash, hashCode(store.id, phone, code))) {
    const attempts = otp.attempts + 1;
    await prisma.shopperPhoneOtp.update({ where: { id: otp.id }, data: { attempts, ...(attempts >= MAX_ATTEMPTS && { consumedAt: new Date() }) } });
    throw new HttpError(400, attempts >= MAX_ATTEMPTS ? "Too many wrong codes. Request a new one." : "That code isn't right. Check the message and try again.");
  }
  const { count } = await prisma.shopperPhoneOtp.updateMany({ where: { id: otp.id, consumedAt: null }, data: { consumedAt: new Date() } });
  if (count !== 1) throw new HttpError(400, "That code has already been used. Request a new one.");
}

function verifiedCustomer(prisma, store, phone) {
  return prisma.customer.findFirst({ where: { storeId: store.id, phone: display(phone), phoneVerifiedAt: { not: null } }, orderBy: { phoneVerifiedAt: "desc" } });
}

/** Proof that this browser verified `phone` a moment ago — the only way
 * into finishing sign-up. Short-lived, bound to the store. */
function signupTicket(fastify, store, phone) {
  return fastify.jwt.sign({ aud: "phone-signup", sid: store.id, ph: phone }, { expiresIn: "20m" });
}

function readTicket(fastify, store, ticket) {
  let payload = null;
  try {
    payload = fastify.jwt.verify(String(ticket || ""));
  } catch {}
  if (!payload || payload.aud !== "phone-signup" || payload.sid !== store.id || !payload.ph) {
    throw new HttpError(400, "Your phone verification expired. Enter your number again.");
  }
  return payload.ph;
}

/** One verified owner per number per store: linking it here unlinks it elsewhere. */
async function link(prisma, store, customer, phone, name) {
  await prisma.customer.updateMany({ where: { storeId: store.id, phone: display(phone), phoneVerifiedAt: { not: null }, id: { not: customer.id } }, data: { phoneVerifiedAt: null } });
  return prisma.customer.update({
    where: { id: customer.id },
    data: { phone: display(phone), phoneVerifiedAt: new Date(), lastSignInAt: new Date(), ...(name && !customer.name?.trim() && { name }) },
  });
}

/**
 * Finishes sign-up for a new number: { customer } when done, or
 * { needsEmailCode } when the email belongs to an account with history —
 * then the same call again with the emailed `code`.
 */
async function completeSignup(fastify, store, { ticket, name, email: rawEmail, code }, log) {
  const prisma = fastify.prisma;
  const phone = readTicket(fastify, store, ticket);
  const already = await verifiedCustomer(prisma, store, phone);
  if (already) return { customer: await prisma.customer.update({ where: { id: already.id }, data: { lastSignInAt: new Date() } }) };

  const email = service.normalizeEmail(rawEmail);
  const cleanName = String(name || "").trim().slice(0, 120) || email.split("@")[0];
  const existing = await customersRepository.findByEmail(prisma, store.id, email);
  if (!existing) {
    const created = await customersRepository.create(prisma, store.id, { email, name: cleanName });
    return { customer: await link(prisma, store, created, phone, cleanName) };
  }
  if (await service.claimable(prisma, existing)) {
    return { customer: await link(prisma, store, await prisma.customer.update({ where: { id: existing.id }, data: { name: cleanName } }), phone) };
  }
  if (!code) {
    await service.requestCode(prisma, store, email, log);
    return { needsEmailCode: true, email };
  }
  const verified = await service.verifyCode(prisma, store, email, code);
  return { customer: await link(prisma, store, verified, phone, cleanName) };
}

module.exports = { config, liveChannels, parsePhone, display, requestCode, verifyCode, checkCode, verifiedCustomer, signupTicket, readTicket, link, completeSignup, APP_KEY };

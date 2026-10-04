const { authenticator } = require("otplib");
const QRCode = require("qrcode");
const { encryptSecret, decryptSecret } = require("./crypto");

// ±1 time step (30s either side) tolerates a phone clock that's slightly
// off without meaningfully widening the guessing window.
authenticator.options = { window: 1 };

const ISSUER = "Oyklane Platform";
const CHALLENGE_PURPOSE = "platform-2fa";
const CHALLENGE_TTL = "5m";

/** A fresh secret plus what the setup screen shows: an otpauth:// URL
 * (what the QR code encodes) and the QR as a data: URL, rendered here so
 * the secret never goes to a third-party QR service. The secret is
 * returned encrypted for storage — plaintext only ever lives in memory
 * and in the QR/manual-entry key shown once to the user. */
async function createEnrollment(email) {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(email, ISSUER, secret);
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 });
  return { encryptedSecret: encryptSecret(secret), manualKey: secret, otpauthUrl, qrDataUrl };
}

/** Checks a code against the user's stored secret — no replay check; use
 * consumeCode for sign-in, where a code must only ever work once. */
function verifyCode(user, code) {
  if (!user?.totpSecret) return false;
  try {
    return authenticator.check(String(code), decryptSecret(user.totpSecret));
  } catch {
    return false;
  }
}

/** verifyCode plus one-time use: a code that's already been accepted is
 * rejected for the rest of its validity window, so a code seen over
 * someone's shoulder (or replayed from a captured request) is worthless.
 * If Redis is down the replay check is skipped rather than blocking
 * sign-in — the code itself is still verified. */
async function consumeCode(fastify, user, code) {
  if (!verifyCode(user, code)) return false;
  const key = `2fa:used:${user.id}:${code}`;
  try {
    // NX = only set if absent; null means the code was already used.
    const ok = await fastify.redis.set(key, "1", "EX", 90, "NX");
    return ok === "OK";
  } catch (err) {
    fastify.log.warn({ err }, "two-factor: Redis unavailable, replay check skipped");
    return true;
  }
}

/** A short-lived token proving "password step passed" — carries `purpose`,
 * which plugins/jwt-auth.js's verifySession rejects, so it can never be
 * used as a session itself. */
function issueChallenge(fastify, user) {
  return fastify.jwt.sign(
    { userId: user.id, purpose: CHALLENGE_PURPOSE, tv: user.tokenVersion ?? 0 },
    { expiresIn: CHALLENGE_TTL }
  );
}

/** The user a challenge token belongs to, or null if it's expired, forged,
 * the wrong kind of token, or the account changed since it was issued
 * (disabled, sessions revoked, 2FA turned off, no longer a super admin). */
async function userFromChallenge(fastify, token) {
  let payload;
  try {
    payload = fastify.jwt.verify(token);
  } catch {
    return null;
  }
  if (payload.purpose !== CHALLENGE_PURPOSE) return null;
  const user = await fastify.prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user || user.status === "disabled" || !user.isSuperAdmin || !user.totpEnabledAt) return null;
  if ((payload.tv ?? 0) !== user.tokenVersion) return null;
  return user;
}

module.exports = { createEnrollment, verifyCode, consumeCode, issueChallenge, userFromChallenge };

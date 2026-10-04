const crypto = require("crypto");
const { env } = require("../config/env");

/**
 * Constant-time string comparison for signatures and tokens. A plain `===`
 * returns as soon as the first character differs, so response timing leaks
 * how much of a guessed signature was right. Length isn't secret here (an
 * HMAC-SHA256 hex digest is always 64 chars), so an early length check is
 * safe and keeps timingSafeEqual from throwing on mismatched buffers.
 */
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// ── Encryption at rest for third-party secrets (e.g. Meta access tokens) ──

const PREFIX = "enc:v1:";
let warnedAboutDerivedKey = false;

/** 32-byte AES key. DATA_ENCRYPTION_KEY (64 hex chars) is the real one.
 * Without it, a key is derived from JWT_SECRET so development works out of
 * the box — with a one-time warning, because a production deployment should
 * never tie two unrelated secrets together (rotating JWT_SECRET would then
 * make every stored token undecryptable). */
function encryptionKey() {
  if (env.DATA_ENCRYPTION_KEY) return Buffer.from(env.DATA_ENCRYPTION_KEY, "hex");
  if (!warnedAboutDerivedKey) {
    warnedAboutDerivedKey = true;
    console.warn(
      "[crypto] DATA_ENCRYPTION_KEY is not set — deriving one from JWT_SECRET. Set a dedicated key in production: " +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return crypto.createHash("sha256").update(`${env.JWT_SECRET}:data-encryption`).digest();
}

/** AES-256-GCM: confidentiality plus tamper detection (a modified
 * ciphertext fails to decrypt instead of yielding garbage). Output is
 * self-describing — "enc:v1:<iv>:<tag>:<ciphertext>", base64 parts — so the
 * format can change later without guessing what an old row holds. */
function encryptSecret(plaintext) {
  if (plaintext == null || plaintext === "") return plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

/** Inverse of encryptSecret. A value without the prefix is returned as-is:
 * rows written before encryption existed still work, and are re-encrypted
 * the next time they're saved. */
function decryptSecret(stored) {
  if (typeof stored !== "string" || !stored.startsWith(PREFIX)) return stored;
  const [ivB64, tagB64, dataB64] = stored.slice(PREFIX.length).split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

module.exports = { safeEqual, encryptSecret, decryptSecret };

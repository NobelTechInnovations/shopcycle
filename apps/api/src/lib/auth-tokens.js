const crypto = require("crypto");

/**
 * One-time links for sellers (AuthToken in schema.prisma). The raw token
 * only ever exists in the email; the database keeps its SHA-256, so
 * reading the table gives nothing that can be used.
 */
const TTL_MS = {
  password_reset: 30 * 60 * 1000,
  email_verify: 3 * 24 * 60 * 60 * 1000,
};

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

/** Issues a fresh token for `purpose`, retiring any earlier unused ones for
 * the same user and purpose — only the newest link works. */
async function issueToken(prisma, userId, purpose) {
  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.authToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.authToken.create({
      data: { userId, purpose, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TTL_MS[purpose]) },
    }),
  ]);
  return token;
}

/** The live (unused, unexpired) token row for this raw token, or null. */
async function findLiveToken(prisma, token, purpose) {
  if (!token || typeof token !== "string" || token.length > 200) return null;
  const row = await prisma.authToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt < new Date()) return null;
  return row;
}

/** Marks the token spent. The `usedAt: null` condition makes it atomic:
 * two simultaneous uses of one link can't both succeed. */
async function consumeToken(prisma, row) {
  const { count } = await prisma.authToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  return count === 1;
}

module.exports = { issueToken, findLiveToken, consumeToken, hashToken };

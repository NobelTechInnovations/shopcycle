const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const twoFactor = require("../../lib/two-factor");
const { recordAudit } = require("../../lib/audit");
const { clearPlatformSession } = require("../../lib/session");

const codeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app"),
});

/** Current 2FA state for the signed-in operator's own account. */
async function getSecurityHandler(request, reply) {
  const user = request.currentUser;
  reply.send({ twoFactorEnabled: Boolean(user.totpEnabledAt), twoFactorEnabledAt: user.totpEnabledAt });
}

/** Step 1 of enabling 2FA: generate a secret and show it (QR + manual
 * key). Stored but NOT enforced yet — totpEnabledAt stays null until step
 * 2 proves the operator's app is producing correct codes, so a botched
 * scan can't lock anyone out. Re-running this replaces a pending secret. */
async function startTwoFactorSetupHandler(request, reply) {
  const user = request.currentUser;
  if (user.totpEnabledAt) throw new HttpError(409, "Two-factor authentication is already on.");
  const enrollment = await twoFactor.createEnrollment(user.email);
  await request.server.prisma.user.update({
    where: { id: user.id },
    data: { totpSecret: enrollment.encryptedSecret },
  });
  reply.send({ qrDataUrl: enrollment.qrDataUrl, manualKey: enrollment.manualKey });
}

/** Step 2: the first valid code turns enforcement on. */
async function confirmTwoFactorHandler(request, reply) {
  const { code } = codeSchema.parse(request.body);
  const user = request.currentUser;
  if (user.totpEnabledAt) throw new HttpError(409, "Two-factor authentication is already on.");
  if (!user.totpSecret) throw new HttpError(400, "Start setup first.");
  if (!twoFactor.verifyCode(user, code)) {
    throw new HttpError(400, "That code didn't match. Make sure your phone's clock is set automatically and try the newest code.");
  }
  await request.server.prisma.user.update({ where: { id: user.id }, data: { totpEnabledAt: new Date() } });
  await recordAudit(request, { scope: "platform", actor: user, action: "auth.2fa_enabled", targetType: "user", targetId: user.id });
  reply.send({ twoFactorEnabled: true });
}

/** Turning 2FA off requires a current code (a stolen session alone can't
 * strip the second factor) and ends every session, including this one. */
async function disableTwoFactorHandler(request, reply) {
  const { code } = codeSchema.parse(request.body);
  const user = request.currentUser;
  if (!user.totpEnabledAt) throw new HttpError(409, "Two-factor authentication is already off.");
  if (!(await twoFactor.consumeCode(request.server, user, code))) {
    throw new HttpError(400, "That code didn't match.");
  }
  await request.server.prisma.user.update({
    where: { id: user.id },
    data: { totpEnabledAt: null, totpSecret: null, tokenVersion: { increment: 1 } },
  });
  await recordAudit(request, { scope: "platform", actor: user, action: "auth.2fa_disabled", targetType: "user", targetId: user.id });
  clearPlatformSession(reply);
  reply.send({ twoFactorEnabled: false });
}

/** Ends every platform AND seller session for this account. */
async function signOutEverywhereHandler(request, reply) {
  const user = request.currentUser;
  await request.server.prisma.user.update({ where: { id: user.id }, data: { tokenVersion: { increment: 1 } } });
  await recordAudit(request, { scope: "platform", actor: user, action: "auth.sign_out_everywhere", targetType: "user", targetId: user.id });
  clearPlatformSession(reply);
  reply.send({ ok: true });
}

const auditQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  storeId: z.string().optional(),
  action: z.string().optional(),
});

/** Newest-first, cursor-paginated (by id), filterable by store/action. */
async function listAuditLogsHandler(request, reply) {
  const { cursor, limit, storeId, action } = auditQuerySchema.parse(request.query);
  const rows = await request.server.prisma.auditLog.findMany({
    where: { ...(storeId && { storeId }), ...(action && { action: { startsWith: action } }) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  });
  const hasMore = rows.length > limit;
  const entries = hasMore ? rows.slice(0, limit) : rows;
  reply.send({ entries, nextCursor: hasMore ? entries[entries.length - 1].id : null });
}

module.exports = {
  getSecurityHandler,
  startTwoFactorSetupHandler,
  confirmTwoFactorHandler,
  disableTwoFactorHandler,
  signOutEverywhereHandler,
  listAuditLogsHandler,
};

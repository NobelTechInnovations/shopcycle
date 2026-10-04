const bcrypt = require("bcryptjs");
const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");
const { issueToken, findLiveToken, consumeToken } = require("../../lib/auth-tokens");
const { sendEmail } = require("../../lib/mailer");
const { recordAudit } = require("../../lib/audit");
const loginGuard = require("../../lib/login-guard");
const templates = require("../../emails/templates");
const service = require("./service");

/**
 * Seller account recovery: forgotten passwords and email verification.
 *
 * Platform-admin accounts are deliberately left out of email reset. The
 * platform console is protected by a password AND an authenticator app;
 * letting an inbox reset the password would make the inbox the weakest
 * link to every store. Those accounts are recovered by the operator
 * (prisma/seed.js or a direct database update), never by email.
 */

const adminUrl = (path) => `${env.ADMIN_ORIGIN.replace(/\/$/, "")}${path}`;

async function sendVerificationEmail(prisma, user, log) {
  const token = await issueToken(prisma, user.id, "email_verify");
  const { subject, html } = templates.verifyEmail({ name: user.name, url: adminUrl(`/verify-email?token=${token}`) });
  return sendEmail(prisma, { to: user.email, subject, html, template: "email_verify", refType: "user", refId: user.id, log });
}

const forgotSchema = z.object({ email: z.string().email("Enter a valid email") });

/** Always answers the same way, and before doing any work — whether or not
 * the email has an account. Answering after the lookup and the send would
 * make real accounts measurably slower, which would tell anyone which
 * emails are Oyklane sellers just as surely as a different message. */
async function forgotPasswordHandler(request, reply) {
  const { email } = forgotSchema.parse(request.body);
  const { prisma } = request.server;
  reply.send({ ok: true });

  try {
    const user = await service.findUserByEmail(prisma, email);
    if (!user || user.isSuperAdmin || user.status === "disabled") return;
    const token = await issueToken(prisma, user.id, "password_reset");
    const { subject, html } = templates.passwordReset({ name: user.name, url: adminUrl(`/reset-password?token=${token}`) });
    await sendEmail(prisma, { to: user.email, subject, html, template: "password_reset", refType: "user", refId: user.id, log: request.log });
    await recordAudit(request, { scope: "store", actor: user, action: "auth.password_reset_requested", targetType: "user", targetId: user.id });
  } catch (err) {
    request.log.error({ err }, "password reset: could not send the reset email");
  }
}

const tokenQuery = z.object({ token: z.string().min(1).max(200) });

/** Lets the reset page say "this link has expired" before the user types
 * a new password, instead of after. */
async function checkResetTokenHandler(request, reply) {
  const { token } = tokenQuery.parse(request.query);
  const row = await findLiveToken(request.server.prisma, token, "password_reset");
  reply.send({ valid: Boolean(row) });
}

const resetSchema = z.object({
  token: z.string().min(1).max(200),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

async function resetPasswordHandler(request, reply) {
  const { token, password } = resetSchema.parse(request.body);
  const { prisma } = request.server;
  const row = await findLiveToken(prisma, token, "password_reset");
  if (!row || row.user.isSuperAdmin || !(await consumeToken(prisma, row))) {
    throw new HttpError(400, "This reset link has expired or was already used. Request a new one.");
  }

  // New password + tokenVersion bump in one write: every existing session
  // (including an attacker's, if that's why they're resetting) ends now.
  // Reaching the link proves they own the inbox, so the email counts as
  // verified too.
  const user = await prisma.user.update({
    where: { id: row.userId },
    data: {
      passwordHash: await bcrypt.hash(password, 10),
      tokenVersion: { increment: 1 },
      emailVerifiedAt: row.user.emailVerifiedAt || new Date(),
    },
  });
  await loginGuard.clearFailures(request.server, "seller", user.email);
  await recordAudit(request, { scope: "store", actor: user, action: "auth.password_reset", targetType: "user", targetId: user.id });

  const when = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
  const notice = templates.passwordChanged({ name: user.name, when: `${when} IST`, ip: request.ip });
  await sendEmail(prisma, { to: user.email, ...notice, template: "password_changed", refType: "user", refId: user.id, log: request.log });

  reply.send({ ok: true });
}

const verifySchema = z.object({ token: z.string().min(1).max(200) });

async function verifyEmailHandler(request, reply) {
  const { token } = verifySchema.parse(request.body);
  const { prisma } = request.server;
  const row = await findLiveToken(prisma, token, "email_verify");
  if (!row || !(await consumeToken(prisma, row))) {
    throw new HttpError(400, "This link has expired or was already used. Sign in and send a new one from your dashboard.");
  }
  await prisma.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: row.user.emailVerifiedAt || new Date() } });
  reply.send({ ok: true, email: row.user.email });
}

async function resendVerificationHandler(request, reply) {
  const user = request.authUser;
  if (user.emailVerifiedAt) {
    reply.send({ ok: true, alreadyVerified: true });
    return;
  }
  const result = await sendVerificationEmail(request.server.prisma, user, request.log);
  if (result.status === "failed") throw new HttpError(502, "We couldn't send the email just now. Please try again in a minute.");
  reply.send({ ok: true });
}

/** What really happened to the last confirmation email (it's delivered in
 * the background) — so the dashboard never claims "sent" when it wasn't. */
async function verificationStatusHandler(request, reply) {
  const user = request.authUser;
  if (user.emailVerifiedAt) return reply.send({ verified: true });
  const row = await request.server.prisma.emailLog.findFirst({
    where: { refType: "user", refId: user.id, template: "email_verify" },
    orderBy: { createdAt: "desc" },
    select: { status: true, createdAt: true, sentAt: true },
  });
  const status = !row ? "none" : ["queued", "sending"].includes(row.status) ? "sending" : row.status === "failed" ? "failed" : "sent";
  reply.send({ verified: false, status, at: row?.sentAt || row?.createdAt || null });
}

module.exports = {
  verificationStatusHandler,
  sendVerificationEmail,
  forgotPasswordHandler,
  checkResetTokenHandler,
  resetPasswordHandler,
  verifyEmailHandler,
  resendVerificationHandler,
};

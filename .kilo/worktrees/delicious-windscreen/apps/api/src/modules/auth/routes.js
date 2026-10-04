const controller = require("./controller");
const recovery = require("./recovery");
const google = require("./google");
const billingService = require("../billing/service");
const { getSettings } = require("../billing/settings");

// Per-IP limits (the @fastify/rate-limit plugin, registered in app.js).
// These sit alongside the per-account lockout in lib/login-guard.js — this
// stops one machine hammering the endpoint; that stops many machines
// targeting one account.
const signInLimit = { rateLimit: { max: 10, timeWindow: "1 minute" } };
const signUpLimit = { rateLimit: { max: 5, timeWindow: "15 minutes" } };
const twoFactorLimit = { rateLimit: { max: 10, timeWindow: "5 minutes" } };
// Each of these sends an email, so they're limited like sign-up is.
const emailLimit = { rateLimit: { max: 5, timeWindow: "15 minutes" } };
const tokenLimit = { rateLimit: { max: 20, timeWindow: "15 minutes" } };

async function authRoutes(fastify) {
  fastify.post("/register", { config: signUpLimit }, controller.registerHandler);
  fastify.post("/login", { config: signInLimit }, controller.loginHandler);
  fastify.post("/logout", controller.logoutHandler);
  fastify.post("/logout-everywhere", { preHandler: [fastify.authenticate] }, controller.logoutEverywhereHandler);
  fastify.get("/me", { preHandler: [fastify.authenticate] }, controller.meHandler);

  // The plans a new store chooses from at sign-up (public: prices are on
  // the marketing site too).
  fastify.get("/plans", async () => {
    const settings = await getSettings(fastify.prisma);
    return { plans: await billingService.listPlans(fastify.prisma, { settings }), trialDays: settings.trialDays, introPrice: Number(settings.introPrice), introEnabled: settings.introEnabled };
  });

  // "Continue with Google" — see google.js.
  fastify.get("/google/config", google.configHandler);
  fastify.get("/google/start", { config: signInLimit }, google.startHandler);
  fastify.get("/google/callback", { config: signInLimit }, google.callbackHandler);
  fastify.post("/google/register", { config: signUpLimit }, google.registerHandler);

  // Account recovery (see recovery.js) — seller accounts only.
  fastify.post("/password/forgot", { config: emailLimit }, recovery.forgotPasswordHandler);
  fastify.get("/password/reset", { config: tokenLimit }, recovery.checkResetTokenHandler);
  fastify.post("/password/reset", { config: tokenLimit }, recovery.resetPasswordHandler);
  fastify.post("/email/verify", { config: tokenLimit }, recovery.verifyEmailHandler);
  fastify.post("/email/resend", { preHandler: [fastify.authenticate], config: emailLimit }, recovery.resendVerificationHandler);
  fastify.get("/email/status", { preHandler: [fastify.authenticate] }, recovery.verificationStatusHandler);

  // Multi-store (Phase 7): listing/creating/switching only ever need to
  // know who the user is, never "the current store" — a user with no
  // current store yet is exactly who needs these.
  fastify.get("/my-stores", { preHandler: [fastify.authenticate] }, controller.myStoresHandler);
  fastify.post("/stores", { preHandler: [fastify.authenticate], config: signUpLimit }, controller.createStoreHandler);
  fastify.post("/switch-store", { preHandler: [fastify.authenticate] }, controller.switchStoreHandler);

  // Platform-admin panel — its own cookie, its own session, see
  // authenticateSuperAdmin's doc comment in plugins/jwt-auth.js.
  fastify.post("/super-admin-login", { config: signInLimit }, controller.superAdminLoginHandler);
  fastify.post("/super-admin-login/verify", { config: twoFactorLimit }, controller.superAdminVerifyTwoFactorHandler);
  fastify.post("/super-admin-logout", controller.superAdminLogoutHandler);
  fastify.get("/super-admin-me", { preHandler: [fastify.authenticateSuperAdmin] }, controller.superAdminMeHandler);
}

module.exports = authRoutes;

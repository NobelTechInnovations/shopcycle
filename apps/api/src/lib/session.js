const { env } = require("../config/env");
const { AUDIENCE } = require("../plugins/jwt-auth");

/**
 * The one place session cookies are set and cleared. Every sign-in path
 * (login, register, accept invite, switch store, platform login) goes
 * through here, so cookie flags can't drift between copies again — the
 * accept-invite flow used to keep its own settings and missed `domain`,
 * which broke new staff members' sessions in production.
 *
 * SameSite=Lax: every Oyklane app lives under one registrable domain
 * (store./superadmin./api.oyklane.com in production, localhost in dev), so
 * they're all "same-site" and Lax cookies flow between them normally. What
 * Lax blocks is a *different* site's page submitting a form to the API with
 * the merchant's cookie attached — cross-site request forgery. (The old
 * SameSite=None allowed exactly that; it dated from a plan to host the
 * platform console on a separate domain, which never happened.)
 */
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7, // 7 days — matches JWT_EXPIRES_IN's default
  ...(env.COOKIE_DOMAIN && { domain: env.COOKIE_DOMAIN }),
};

const clearOptions = { path: "/", ...(env.COOKIE_DOMAIN && { domain: env.COOKIE_DOMAIN }) };

function setSellerSession(reply, fastify, user, storeId) {
  const token = fastify.signSession(user, { audience: AUDIENCE.seller, storeId: storeId || null });
  reply.setCookie(env.COOKIE_NAME, token, cookieOptions);
}

function setPlatformSession(reply, fastify, user) {
  const token = fastify.signSession(user, { audience: AUDIENCE.platform });
  reply.setCookie(env.SUPER_ADMIN_COOKIE_NAME, token, cookieOptions);
}

function clearSellerSession(reply) {
  reply.clearCookie(env.COOKIE_NAME, clearOptions);
}

function clearPlatformSession(reply) {
  reply.clearCookie(env.SUPER_ADMIN_COOKIE_NAME, clearOptions);
}

module.exports = { setSellerSession, setPlatformSession, clearSellerSession, clearPlatformSession };

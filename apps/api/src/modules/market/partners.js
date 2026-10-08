const bcrypt = require("bcryptjs");
const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const loginGuard = require("../../lib/login-guard");

/**
 * Developer ("partner") accounts on oyklanestore.com. Separate from
 * sellers and platform staff: their own table, their own token audience
 * ("partner"), sent by the Oyklane Store's server as a Bearer token — a
 * seller or super admin session can never act as a partner, or the
 * reverse.
 */

const AUDIENCE = "partner";
const VPA = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/;
// Compared against when the email is unknown, so timing doesn't say which emails exist.
let dummyHash = null;
const DUMMY_HASH = () => (dummyHash ||= bcrypt.hashSync(`no-account-${Date.now()}`, 10));

const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters").max(200),
  company: z.string().trim().max(120).optional().nullable(),
});
const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });
const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  company: z.string().trim().max(120).optional().nullable(),
  website: z.string().trim().url("Enter a full link, https://…").max(300).optional().nullable().or(z.literal("").transform(() => null)),
  payoutUpi: z.string().trim().toLowerCase().regex(VPA, "Enter a UPI ID like you@okhdfcbank").optional().nullable().or(z.literal("").transform(() => null)),
  payoutName: z.string().trim().max(80).optional().nullable(),
});

const publicPartner = (p) => ({ id: p.id, email: p.email, name: p.name, company: p.company, website: p.website, payoutUpi: p.payoutUpi, payoutName: p.payoutName, createdAt: p.createdAt });

function sign(fastify, partner) {
  return fastify.jwt.sign({ partnerId: partner.id, tv: partner.tokenVersion, aud: AUDIENCE }, { expiresIn: "30d" });
}

async function register(fastify, input) {
  const data = registerSchema.parse(input || {});
  const prisma = fastify.prisma;
  if (await prisma.partner.findUnique({ where: { email: data.email } })) throw new HttpError(409, "There's already a developer account with this email — sign in instead.");
  const partner = await prisma.partner.create({ data: { name: data.name, email: data.email, company: data.company || null, passwordHash: await bcrypt.hash(data.password, 10), lastLoginAt: new Date() } });
  return { token: sign(fastify, partner), partner: publicPartner(partner) };
}

async function login(fastify, input) {
  const { email, password } = loginSchema.parse(input || {});
  await loginGuard.assertNotLocked(fastify, "partner", email);
  const partner = await fastify.prisma.partner.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, partner?.passwordHash || DUMMY_HASH());
  if (!partner || !ok) {
    await loginGuard.recordFailure(fastify, "partner", email);
    throw new HttpError(401, "Wrong email or password.");
  }
  if (partner.status !== "active") throw new HttpError(403, "This developer account is suspended. Write to partners@oyklane.com.");
  await loginGuard.clearFailures(fastify, "partner", email);
  await fastify.prisma.partner.update({ where: { id: partner.id }, data: { lastLoginAt: new Date() } });
  return { token: sign(fastify, partner), partner: publicPartner(partner) };
}

/** preHandler: `Authorization: Bearer <partner token>` → request.partner. */
function authenticatePartner(fastify) {
  return async function checkPartner(request, reply) {
    const header = String(request.headers.authorization || "");
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    let payload = null;
    try {
      payload = token ? fastify.jwt.verify(token) : null;
    } catch {
      payload = null;
    }
    if (!payload || payload.aud !== AUDIENCE || !payload.partnerId) return reply.code(401).send({ error: "Please sign in to your developer account." });
    const partner = await fastify.prisma.partner.findUnique({ where: { id: payload.partnerId } });
    if (!partner || partner.status !== "active" || partner.tokenVersion !== payload.tv) return reply.code(401).send({ error: "Please sign in again." });
    request.partner = partner;
  };
}

async function updateProfile(prisma, partner, input) {
  const data = profileSchema.parse(input || {});
  return publicPartner(await prisma.partner.update({ where: { id: partner.id }, data }));
}

async function signOutEverywhere(prisma, partner) {
  await prisma.partner.update({ where: { id: partner.id }, data: { tokenVersion: { increment: 1 } } });
}

module.exports = { AUDIENCE, register, login, authenticatePartner, updateProfile, signOutEverywhere, publicPartner };

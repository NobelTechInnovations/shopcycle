const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const storefrontService = require("../storefront/service");
const service = require("./service");
const phone = require("./phone");
const express = require("./express");
const { exchangeTicket } = require("./google");
const oyklaneId = require("./oyklane-id");
const abandoned = require("../checkout/abandoned");
const returns = require("../orders/returns");
const { FULL_INCLUDE } = require("../orders/operations");
const { renderInvoiceHtml, invoiceLogo } = require("../orders/invoice");
const { ensureStatusToken } = require("../orders/notify");
const { throttle } = require("../../lib/throttle");

/**
 * Public endpoints behind the storefront's account, order-status and
 * checkout pages. Only the storefront server calls these (server to
 * server); the signed-in shopper arrives as the x-shopper-token header.
 */

const emailSchema = z.object({ email: z.string().trim().email("Enter a valid email").max(200) });
const verifySchema = emailSchema.extend({ code: z.string().trim().min(4).max(12) });
const passwordLoginSchema = emailSchema.extend({ password: z.string().min(1, "Enter your password").max(200) });
const registerSchema = emailSchema.extend({
  name: z.string().trim().min(1, "Enter your name").max(120),
  password: z.string().max(200),
  acceptsMarketing: z.coerce.boolean().optional(),
});
const passwordSchema = z.object({ currentPassword: z.string().max(200).optional().nullable(), password: z.string().max(200) });

const profileSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  address1: z.string().trim().max(200).optional().or(z.literal("")),
  address2: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  province: z.string().trim().max(100).optional().or(z.literal("")),
  zip: z.string().trim().max(20).optional().or(z.literal("")),
  country: z.string().trim().max(60).optional().or(z.literal("")),
  acceptsEmailMarketing: z.coerce.boolean().optional(),
});

const lookupSchema = z.object({
  orderNumber: z.string().trim().regex(/^#?\d{1,9}$/, "Enter your order number, like 1001"),
  email: z.string().trim().email("Enter the email you ordered with").max(200),
});

const returnSchema = z.object({
  items: z.array(z.object({ orderItemId: z.string().min(1), quantity: z.coerce.number().int().min(0) })).max(200),
  reason: z.string().trim().max(200).optional().nullable(),
  note: z.string().trim().max(2000).optional().nullable(),
});

const contactSchema = z.object({
  cartId: z.string().min(1).max(100),
  email: z.string().trim().email().max(200),
  name: z.string().trim().max(120).optional().nullable(),
});

async function storeFor(request) {
  return storefrontService.loadStoreOrThrow(request.server.prisma, request.params.handle);
}

async function requireShopper(request, store) {
  const customer = await service.customerFromToken(request.server, store, request.headers["x-shopper-token"]);
  if (!customer) throw new HttpError(401, "Please sign in again.");
  return customer;
}

const phoneCodeSchema = z.object({ phone: z.string().trim().min(6, "Enter your mobile number").max(24), channel: z.enum(["sms", "whatsapp"]).optional() });
const phoneVerifySchema = z.object({ phone: z.string().trim().min(6).max(24), code: z.string().trim().min(4).max(12) });
const phoneCompleteSchema = z.object({
  ticket: z.string().min(10).max(4000),
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().email("Enter a valid email").max(200),
  code: z.string().trim().min(4).max(12).optional(),
});

async function phoneCodeHandler(request, reply) {
  const store = await storeFor(request);
  const body = phoneCodeSchema.parse(request.body);
  const sent = await phone.requestCode(request.server.prisma, store, body, request.log);
  reply.send({ ok: true, ...sent });
}

async function phoneVerifyHandler(request, reply) {
  const store = await storeFor(request);
  const body = phoneVerifySchema.parse(request.body);
  await throttle(request.server, `phone-verify:${store.id}:${body.phone.replace(/\D/g, "")}`, { max: 15, windowSeconds: 15 * 60 });
  const result = await phone.verifyCode(request.server.prisma, store, body);
  if (result.customer) {
    return reply.send({ token: service.signSession(request.server, store, result.customer, "phone"), oyklaneId: oyklaneId.issue(request.server, result.customer), customer: { id: result.customer.id, name: result.customer.name } });
  }
  reply.send({ signupTicket: phone.signupTicket(request.server, store, result.phone) });
}

// Express checkout (One-Click popup): code to the number, then its saved addresses.
async function expressCodeHandler(request, reply) {
  const store = await storeFor(request);
  const body = phoneCodeSchema.parse(request.body);
  reply.send(await express.requestCode(request.server.prisma, store, body, request.log));
}

async function expressVerifyHandler(request, reply) {
  const store = await storeFor(request);
  const body = phoneVerifySchema.parse(request.body);
  await throttle(request.server, `express-verify:${store.id}:${body.phone.replace(/\D/g, "")}`, { max: 15, windowSeconds: 15 * 60 });
  const { customer, ...result } = await express.verify(request.server, store, body);
  // A number that belongs to an account signs the shopper in (the
  // storefront keeps the token in its HttpOnly session cookie).
  reply.send(customer ? { ...result, token: service.signSession(request.server, store, customer, "phone"), oyklaneId: oyklaneId.issue(request.server, customer), signedIn: true } : result);
}

async function expressMineHandler(request, reply) {
  const store = await storeFor(request);
  const customer = await requireShopper(request, store);
  reply.send(await express.mine(request.server.prisma, store, customer));
}

async function phoneCompleteHandler(request, reply) {
  const store = await storeFor(request);
  const body = phoneCompleteSchema.parse(request.body);
  if (body.code) await throttle(request.server, `otp-verify:${store.id}:${service.normalizeEmail(body.email)}`, { max: 15, windowSeconds: 15 * 60 });
  const result = await phone.completeSignup(request.server, store, body, request.log);
  if (result.needsEmailCode) return reply.send({ needsEmailCode: true, email: result.email });
  reply.send({ token: service.signSession(request.server, store, result.customer, "phone"), oyklaneId: oyklaneId.issue(request.server, result.customer), customer: { id: result.customer.id, name: result.customer.name } });
}

async function googleExchangeHandler(request, reply) {
  const store = await storeFor(request);
  const { ticket, nonce } = z.object({ ticket: z.string().min(10).max(4000), nonce: z.string().min(16).max(200) }).parse(request.body);
  const { token, customer } = await exchangeTicket(request.server, store, ticket, nonce);
  reply.send({ token, oyklaneId: oyklaneId.issue(request.server, customer), customer: { id: customer.id, name: customer.name } });
}

const oyklaneSchema = z.object({ idToken: z.string().min(20).max(3000), create: z.boolean().optional() });

/** Oyklane account: the storefront hands over the shopper's Oyklane ID
 * (shared cookie) for a session at this store — see oyklane-id.js. */
async function oyklaneHandler(request, reply) {
  const store = await storeFor(request);
  const { idToken, create } = oyklaneSchema.parse(request.body);
  const key = require("crypto").createHash("sha256").update(idToken).digest("hex").slice(0, 24);
  await throttle(request.server, `oyklane-id:${store.id}:${key}`, { max: 60, windowSeconds: 10 * 60 });
  const result = await oyklaneId.signIn(request.server, store, idToken, { create: Boolean(create) });
  if (result.invalid) return reply.send({ invalid: true });
  if (result.none) return reply.send({ none: true });
  reply.send({ token: result.token, created: result.created, customer: { id: result.customer.id, name: result.customer.name } });
}

async function requestCodeHandler(request, reply) {
  const store = await storeFor(request);
  const { email } = emailSchema.parse(request.body);
  await service.requestCode(request.server.prisma, store, email, request.log);
  reply.send({ ok: true });
}

async function verifyCodeHandler(request, reply) {
  const store = await storeFor(request);
  const { email, code } = verifySchema.parse(request.body);
  // Codes also burn after 5 wrong tries; this caps guessing across codes.
  await throttle(request.server, `otp-verify:${store.id}:${service.normalizeEmail(email)}`, { max: 15, windowSeconds: 15 * 60 });
  const customer = await service.verifyCode(request.server.prisma, store, email, code);
  reply.send({ token: service.signSession(request.server, store, customer), oyklaneId: oyklaneId.issue(request.server, customer), customer: { id: customer.id, name: customer.name } });
}

async function registerHandler(request, reply) {
  const store = await storeFor(request);
  const body = registerSchema.parse(request.body);
  await throttle(request.server, `shopper-register:${store.id}:${service.normalizeEmail(body.email)}`, { max: 5, windowSeconds: 15 * 60 });
  const customer = await service.register(request.server.prisma, store, body);
  reply.code(201).send({ token: service.signSession(request.server, store, customer, "password"), oyklaneId: oyklaneId.issue(request.server, customer), customer: { id: customer.id, name: customer.name } });
}

async function passwordLoginHandler(request, reply) {
  const store = await storeFor(request);
  const { email, password } = passwordLoginSchema.parse(request.body);
  await throttle(request.server, `shopper-password:${store.id}:${service.normalizeEmail(email)}`, { max: 10, windowSeconds: 15 * 60 });
  const customer = await service.passwordSignIn(request.server.prisma, store, email, password);
  reply.send({ token: service.signSession(request.server, store, customer, "password"), oyklaneId: oyklaneId.issue(request.server, customer), customer: { id: customer.id, name: customer.name } });
}

async function setPasswordHandler(request, reply) {
  const store = await storeFor(request);
  const customer = await requireShopper(request, store);
  const body = passwordSchema.parse(request.body);
  await throttle(request.server, `shopper-set-password:${customer.id}`, { max: 10, windowSeconds: 15 * 60 });
  const updated = await service.setPassword(request.server.prisma, customer, body);
  // The old sessions are gone (tokenVersion moved on); this device keeps going.
  reply.send({ token: service.signSession(request.server, store, updated, "password") });
}

async function updateProfileHandler(request, reply) {
  const store = await storeFor(request);
  const customer = await requireShopper(request, store);
  const body = profileSchema.parse(request.body);
  await service.updateProfile(request.server.prisma, store, customer, body);
  reply.send({ ok: true });
}

async function signOutEverywhereHandler(request, reply) {
  const store = await storeFor(request);
  const customer = await requireShopper(request, store);
  await service.signOutEverywhere(request.server.prisma, customer);
  reply.send({ ok: true });
}

/** Order number + email → the order's status link. Both must match, and
 * the route is rate limited, so it can't be used to browse orders. */
async function lookupHandler(request, reply) {
  const store = await storeFor(request);
  const { orderNumber, email } = lookupSchema.parse(request.body);
  await throttle(request.server, `order-lookup:${store.id}:${email.toLowerCase()}`, { max: 10, windowSeconds: 15 * 60 });
  const order = await request.server.prisma.order.findFirst({
    where: { storeId: store.id, orderNumber: Number(orderNumber.replace("#", "")), email: { equals: email, mode: "insensitive" } },
  });
  if (!order) throw new HttpError(404, "We couldn't find an order with that number and email.");
  reply.send({ token: await ensureStatusToken(request.server.prisma, order) });
}

async function orderByToken(request, store) {
  const token = String(request.params.token || "");
  if (!token || token.length > 100) throw new HttpError(404, "Order not found");
  const order = await request.server.prisma.order.findFirst({ where: { storeId: store.id, statusToken: token }, include: FULL_INCLUDE });
  if (!order) throw new HttpError(404, "Order not found");
  return order;
}

async function requestReturnHandler(request, reply) {
  const store = await storeFor(request);
  const order = await orderByToken(request, store);
  const body = returnSchema.parse(request.body);
  await throttle(request.server, `return-request:${order.id}`, { max: 5, windowSeconds: 60 * 60 });
  await returns.requestReturn(request.server.prisma, store, order, body, { byShopper: true, log: request.log });
  reply.code(201).send({ ok: true });
}

async function invoiceHandler(request, reply) {
  const store = await storeFor(request);
  const order = await orderByToken(request, store);
  if (!order.invoiceNumber) throw new HttpError(404, "There's no invoice for this order yet.");
  reply.header("content-type", "text/html; charset=utf-8");
  reply.send(renderInvoiceHtml(store, order, { logoUrl: await invoiceLogo(request.server.prisma, store) }));
}

async function contactHandler(request, reply) {
  const store = await storeFor(request);
  const body = contactSchema.parse(request.body);
  await throttle(request.server, `checkout-contact:${store.id}:${body.cartId}`, { max: 30, windowSeconds: 10 * 60 });
  reply.send(await abandoned.captureContact(request.server.prisma, store, body));
}

async function recoverHandler(request, reply) {
  const store = await storeFor(request);
  const { token } = z.object({ token: z.string().min(1).max(100) }).parse(request.body);
  reply.send(await abandoned.recoverCart(request.server.prisma, store, token));
}

module.exports = {
  oyklaneHandler,
  requestCodeHandler,
  verifyCodeHandler,
  registerHandler,
  passwordLoginHandler,
  setPasswordHandler,
  updateProfileHandler,
  signOutEverywhereHandler,
  lookupHandler,
  requestReturnHandler,
  invoiceHandler,
  contactHandler,
  recoverHandler,
  phoneCodeHandler,
  expressCodeHandler,
  expressVerifyHandler,
  expressMineHandler,
  phoneVerifyHandler,
  phoneCompleteHandler,
  googleExchangeHandler,
};

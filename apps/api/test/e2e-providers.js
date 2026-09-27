#!/usr/bin/env node
/**
 * Email / SMS / WhatsApp / image-CDN providers, Google sign-in, shopper
 * phone login and paid-app billing — against one local mock server that
 * plays ZeptoMail, Brevo, Twilio, MSG91, Meta, ImageKit and Google.
 * Nothing real is contacted.
 *
 *   node apps/api/test/e2e-providers.js
 *
 * Part 1 runs the provider code in this process. Part 2 starts an API
 * (port 4193, sandbox billing + test clock) on the database in the root
 * .env, creates throwaway stores, and deletes everything it made.
 */
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "../../..");
require(path.join(ROOT, "apps/api/node_modules/dotenv")).config({ path: path.join(ROOT, ".env") });

const MOCK_PORT = 4293;
const API_PORT = 4193;
const MOCK = `http://localhost:${MOCK_PORT}`;
const API = `http://localhost:${API_PORT}`;
const ORIGIN = process.env.ADMIN_ORIGIN || "http://localhost:3000";
const ADMIN = (process.env.ADMIN_ORIGIN || "http://localhost:3000").replace(/\/$/, "");

function dbUrl(limit) {
  const u = new URL(process.env.DATABASE_URL);
  if (/pooler\.supabase\.com$/.test(u.hostname) && u.port === "5432") {
    u.port = "6543";
    u.searchParams.set("pgbouncer", "true");
  }
  u.searchParams.set("connection_limit", String(limit));
  u.searchParams.set("connect_timeout", "30");
  u.searchParams.set("pool_timeout", "30");
  return u.toString();
}
const API_DATABASE_URL = dbUrl(3);

// Everything points at the mock; nothing is sent for real, from here or the API.
const MOCK_ENV = {
  NODE_ENV: "test",
  DATABASE_URL: dbUrl(2),
  SMTP_HOST: "",
  EMAIL_PROVIDER: "log",
  SMS_PROVIDER: "log",
  WHATSAPP_PROVIDER: "log",
  ZEPTOMAIL_API_URL: `${MOCK}/zepto`,
  BREVO_API_URL: `${MOCK}/brevo`,
  TWILIO_API_URL: `${MOCK}/twilio`,
  MSG91_API_URL: `${MOCK}/msg91`,
  META_GRAPH_API_URL: `${MOCK}/graph`,
  MEDIA_STORAGE: "imagekit",
  IMAGEKIT_PUBLIC_KEY: "public_test",
  IMAGEKIT_PRIVATE_KEY: "private_test",
  IMAGEKIT_URL_ENDPOINT: "https://ik.imagekit.io/oyktest",
  IMAGEKIT_UPLOAD_URL: `${MOCK}/ik/upload`,
  IMAGEKIT_API_URL: `${MOCK}/ik/api`,
  CLOUDINARY_CLOUD_NAME: "",
  GOOGLE_CLIENT_ID: "google-client-test",
  GOOGLE_CLIENT_SECRET: "google-secret-test",
  GOOGLE_OAUTH_URL: `${MOCK}/google/auth`,
  GOOGLE_TOKEN_URL: `${MOCK}/google/token`,
  RAZORPAY_KEY_ID: "",
  RAZORPAY_KEY_SECRET: "",
  RAZORPAY_WEBHOOK_SECRET: "",
  BILLING_SANDBOX: "true",
  BILLING_TEST_CLOCK: "true",
  BILLING_JOBS: "false",
  JOBS_DISABLED: "true",
  PHONE_LOGIN_COUNTRIES: "91",
};
Object.assign(process.env, MOCK_ENV);

let pass = 0;
let fail = 0;
function check(label, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${label}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${label}${detail !== undefined ? `  -- ${typeof detail === "string" ? detail : JSON.stringify(detail)?.slice(0, 700)}` : ""}`);
  }
}
const b64url = (s) => Buffer.from(s).toString("base64url");
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

function startMock() {
  const calls = [];
  const ik = new Map();
  let googleClaims = null;
  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    const url = new URL(req.url, MOCK);
    calls.push({ method: req.method, path: url.pathname, headers: req.headers, body: raw });
    const send = (code, obj) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    let m;
    if (url.pathname === "/zepto") return send(201, { request_id: "zep_req_1", data: [{ message_id: "zep_msg_1" }] });
    if (url.pathname === "/brevo") return send(201, { messageId: "<brevo-1@smtp>" });
    if (/^\/twilio\/Accounts\/[^/]+\/Messages\.json$/.test(url.pathname)) return send(201, { sid: "SM_test_1" });
    if (url.pathname === "/msg91/flow") return send(200, { type: "success", message: "msg91_req_1" });
    if (/^\/graph\/v[\d.]+\/[^/]+\/messages$/.test(url.pathname)) return send(200, { messages: [{ id: "wamid.test1" }] });
    if ((m = url.pathname.match(/^\/ik\/api\/files\/([^/]+)\/details$/))) return ik.has(m[1]) ? send(200, ik.get(m[1])) : send(404, { message: "The requested file does not exist." });
    if ((m = url.pathname.match(/^\/ik\/api\/files\/([^/]+)$/)) && req.method === "DELETE") {
      ik.delete(m[1]);
      res.writeHead(204);
      return res.end();
    }
    if (url.pathname === "/google/token") return send(200, { access_token: "at", id_token: [b64url("{}"), b64url(JSON.stringify(googleClaims)), "sig"].join(".") });
    return send(404, { error: `mock: no route ${req.method} ${url.pathname}` });
  });
  return new Promise((resolve) => server.listen(MOCK_PORT, () => resolve({ server, calls, ik, setGoogle: (c) => (googleClaims = c), last: (p) => [...calls].reverse().find((c) => p.test(c.path)) })));
}

function client() {
  const jar = {};
  const call = async (method, url, body, headers = {}) => {
    const res = await fetch(`${API}${url}`, {
      method,
      redirect: "manual",
      headers: {
        ...(body !== undefined && { "content-type": "application/json" }),
        ...(method !== "GET" && { origin: ORIGIN }),
        cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; "),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie?.() || []) {
      const [pair] = c.split(";");
      const [k, ...v] = pair.split("=");
      if (v.join("=") === "") delete jar[k.trim()];
      else jar[k.trim()] = v.join("=");
    }
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, data, location: res.headers.get("location") };
  };
  call.jar = jar;
  return call;
}

async function startApi() {
  const child = spawn(process.execPath, [path.join(ROOT, "apps/api/src/server.js")], {
    cwd: path.join(ROOT, "apps/api"),
    env: { ...process.env, DATABASE_URL: API_DATABASE_URL, API_PORT: String(API_PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  for (let i = 0; i < 90; i += 1) {
    try {
      if ((await fetch(`${API}/health`)).ok) return { child, log: () => log };
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error(`API did not start:\n${log.slice(-3000)}`);
}

// ── Part 1: the provider code itself ────────────────────────────────────
async function partOne(mock) {
  const { env } = require(path.join(ROOT, "apps/api/src/config/env"));
  const mailer = require(path.join(ROOT, "apps/api/src/lib/mailer"));
  const messaging = require(path.join(ROOT, "apps/api/src/lib/messaging"));
  const storage = require(path.join(ROOT, "apps/api/src/modules/uploads/storage"));
  const google = require(path.join(ROOT, "apps/api/src/lib/google-oauth"));
  const logged = [];
  const fakePrisma = { emailLog: { create: async ({ data }) => (logged.push(data), { id: "log1", ...data }) }, messageLog: { create: async ({ data }) => (logged.push(data), data) } };
  const json = (c) => JSON.parse(c.body);
  const form = (c) => Object.fromEntries(new URLSearchParams(c.body));

  // Email
  Object.assign(env, { EMAIL_PROVIDER: "zeptomail", ZEPTOMAIL_TOKEN: "zep-token" });
  let r = await mailer.sendEmail(fakePrisma, { to: "buyer@test.oyklane.dev", subject: "Hello", html: "<p>Hi <b>there</b></p>", fromName: "Loom", replyTo: "help@loom.test", template: "t" });
  let c = mock.last(/^\/zepto$/);
  check("ZeptoMail: sent over its API with the Send Mail Token", r.status === "sent" && c.headers.authorization === "Zoho-enczapikey zep-token", { r, auth: c?.headers.authorization });
  check("ZeptoMail: from/to/reply-to/html/text shaped for its API", json(c).to[0].email_address.address === "buyer@test.oyklane.dev" && json(c).from.name === "Loom" && json(c).reply_to[0].address === "help@loom.test" && json(c).htmlbody.includes("<b>there</b>") && json(c).textbody === "Hi there", json(c));
  check("email log records the provider, not the body, for a real send", logged.at(-1).provider === "zeptomail" && logged.at(-1).html === null && logged.at(-1).status === "sent", logged.at(-1));

  Object.assign(env, { EMAIL_PROVIDER: "brevo", BREVO_API_KEY: "brevo-key" });
  r = await mailer.sendEmail(fakePrisma, { to: "buyer@test.oyklane.dev", subject: "Hello", html: "<p>Hi</p>", replyTo: "help@loom.test" });
  c = mock.last(/^\/brevo$/);
  check("Brevo: api-key header and its payload shape", r.status === "sent" && c.headers["api-key"] === "brevo-key" && json(c).to[0].email === "buyer@test.oyklane.dev" && json(c).replyTo.email === "help@loom.test" && json(c).htmlContent === "<p>Hi</p>", json(c));

  Object.assign(env, { EMAIL_PROVIDER: "zeptomail", ZEPTOMAIL_API_URL: `${MOCK}/nope` });
  r = await mailer.sendEmail(fakePrisma, { to: "buyer@test.oyklane.dev", subject: "x", html: "<p>x</p>" });
  check("a provider error is recorded as failed, never thrown", r.status === "failed" && /404/.test(r.error), r);
  Object.assign(env, { EMAIL_PROVIDER: "zeptomail", ZEPTOMAIL_TOKEN: "" });
  check("a provider without its key falls back to the log", mailer.emailProvider() === "log");
  Object.assign(env, { EMAIL_PROVIDER: "log", ZEPTOMAIL_API_URL: `${MOCK}/zepto` });

  // SMS / WhatsApp
  check("no messaging provider: codes only logged", !messaging.channels().sms && !messaging.channels().whatsapp);
  r = await messaging.sendOtp(fakePrisma, { to: "919876543210", code: "123456", channel: "sms", storeName: "Loom" });
  check("log mode keeps the message body (dev only)", r.status === "logged" && logged.at(-1).body.includes("123456"), logged.at(-1));

  Object.assign(env, { SMS_PROVIDER: "twilio", TWILIO_ACCOUNT_SID: "AC_test", TWILIO_AUTH_TOKEN: "tw_token", TWILIO_MESSAGING_SERVICE_SID: "MG_test" });
  r = await messaging.sendOtp(fakePrisma, { to: "919876543210", code: "123456", channel: "sms", storeName: "Loom" });
  c = mock.last(/^\/twilio\//);
  check("Twilio SMS: basic auth, Messaging Service, E.164 number, code in the text", r.status === "sent" && c.path === "/twilio/Accounts/AC_test/Messages.json" && c.headers.authorization === `Basic ${Buffer.from("AC_test:tw_token").toString("base64")}` && form(c).To === "+919876543210" && form(c).MessagingServiceSid === "MG_test" && form(c).Body.startsWith("123456 is your Loom sign-in code"), form(c));
  check("a real send never stores the code", logged.at(-1).body === null && logged.at(-1).providerMessageId === "SM_test_1", logged.at(-1));

  Object.assign(env, { WHATSAPP_PROVIDER: "twilio", TWILIO_WHATSAPP_FROM: "+14155238886", TWILIO_WHATSAPP_CONTENT_SID: "HX_test" });
  r = await messaging.sendOtp(fakePrisma, { to: "919876543210", code: "654321", channel: "whatsapp" });
  c = mock.last(/^\/twilio\//);
  check("Twilio WhatsApp: whatsapp: addresses and the approved template's {{1}}", r.status === "sent" && form(c).To === "whatsapp:+919876543210" && form(c).From === "whatsapp:+14155238886" && form(c).ContentSid === "HX_test" && JSON.parse(form(c).ContentVariables)["1"] === "654321", form(c));

  Object.assign(env, { SMS_PROVIDER: "msg91", MSG91_AUTH_KEY: "msg91-key", MSG91_OTP_TEMPLATE_ID: "tpl_1", MSG91_OTP_VAR: "otp" });
  r = await messaging.sendOtp(fakePrisma, { to: "919876543210", code: "111222", channel: "sms" });
  c = mock.last(/^\/msg91\//);
  check("MSG91: authkey header, DLT template id, the code in the template variable", r.status === "sent" && c.headers.authkey === "msg91-key" && json(c).template_id === "tpl_1" && json(c).recipients[0].mobiles === "919876543210" && json(c).recipients[0].otp === "111222", json(c));

  Object.assign(env, { WHATSAPP_PROVIDER: "meta", META_WHATSAPP_TOKEN: "EAAB_test", META_WHATSAPP_PHONE_NUMBER_ID: "1180350", META_WHATSAPP_OTP_TEMPLATE: "login_code" });
  r = await messaging.sendOtp(fakePrisma, { to: "919876543210", code: "333444", channel: "whatsapp" });
  c = mock.last(/^\/graph\//);
  const tpl = json(c).template;
  check("Meta WhatsApp: bearer token, auth template with the code in body and copy button", r.status === "sent" && c.path.endsWith("/1180350/messages") && c.headers.authorization === "Bearer EAAB_test" && tpl.name === "login_code" && tpl.components[0].parameters[0].text === "333444" && tpl.components[1].sub_type === "url" && tpl.components[1].parameters[0].text === "333444", json(c));
  check("both channels live once configured", messaging.channels().sms && messaging.channels().whatsapp);
  Object.assign(env, { SMS_PROVIDER: "log", WHATSAPP_PROVIDER: "log" });

  // Image CDN signatures
  const ikSign = storage.PROVIDERS.imagekit.sign("store_1");
  check("ImageKit: HMAC-SHA1(private key, token+expire), store folder, expiry under an hour", ikSign.fields.signature === crypto.createHmac("sha1", "private_test").update(ikSign.fields.token + ikSign.fields.expire).digest("hex") && ikSign.fields.folder === "/stores/store_1" && Number(ikSign.fields.expire) - Date.now() / 1000 < 3600 && ikSign.fields.publicKey === "public_test", ikSign.fields);
  Object.assign(env, { CLOUDINARY_CLOUD_NAME: "demo", CLOUDINARY_API_KEY: "ck", CLOUDINARY_API_SECRET: "cs" });
  const cl = storage.PROVIDERS.cloudinary.sign("store_1");
  check("Cloudinary: SHA-1 of the sorted params + secret, folder is signed", cl.fields.signature === crypto.createHash("sha1").update(`folder=stores/store_1&timestamp=${cl.fields.timestamp}cs`).digest("hex") && cl.uploadUrl.endsWith("/demo/image/upload"), cl);
  check("SVG and oversize images are refused", storage.checkImage({ mime: "image/svg+xml", size: 10 }) && storage.checkImage({ mime: "image/png", size: 9 * 1024 * 1024 }) && !storage.checkImage({ mime: "image/webp", size: 1000 }));
  Object.assign(env, { CLOUDINARY_CLOUD_NAME: "" });

  // Google identity checks
  const now = Math.floor(Date.now() / 1000);
  const claims = { aud: "google-client-test", iss: "https://accounts.google.com", exp: now + 300, nonce: "n-1", sub: "g-1", email: "Mixed@Test.Oyklane.dev", email_verified: true, name: "Mix" };
  mock.setGoogle(claims);
  const who = await google.exchange({ code: "code-1", callbackPath: "/cb", nonce: "n-1" });
  c = mock.last(/^\/google\/token$/);
  check("Google: code exchanged with the client secret and exact redirect URI", form(c).client_secret === "google-secret-test" && form(c).grant_type === "authorization_code" && form(c).redirect_uri.endsWith("/cb"), form(c));
  check("Google: verified identity, email lowercased", who.email === "mixed@test.oyklane.dev" && who.sub === "g-1", who);
  const rejects = async (patch) => {
    mock.setGoogle({ ...claims, ...patch });
    try {
      await google.exchange({ code: "c", callbackPath: "/cb", nonce: "n-1" });
      return false;
    } catch {
      return true;
    }
  };
  check("Google: wrong nonce, audience, issuer or expiry refused", (await rejects({ nonce: "other" })) && (await rejects({ aud: "someone-else" })) && (await rejects({ iss: "evil.example" })) && (await rejects({ exp: now - 10 })));
  check("Google: an unverified email is refused", await rejects({ email_verified: false }));
}

// ── Part 2: through the API ─────────────────────────────────────────────
async function partTwo(mock, prisma) {
  const { oyklaneAddress } = require(path.join(ROOT, "apps/api/src/lib/storefront-url"));
  const stamp = Date.now();
  const created = { storeIds: [], emails: [] };
  const api = await startApi();
  const owner = client();
  try {
    const email = `providers-${stamp}@test.oyklane.dev`;
    created.emails.push(email);
    let r = await owner("POST", "/api/auth/register", { name: "Provider Test", email, password: "correct-horse-battery", storeName: `Providers ${stamp}` });
    check("register a store", r.status === 201, r.data);
    const store = r.data.store;
    created.storeIds.push(store.id);

    // Direct uploads to ImageKit
    r = await owner("GET", "/api/files/upload/config");
    check("uploads go direct to ImageKit", r.data.direct === true && r.data.storage === "imagekit", r.data);
    r = await owner("POST", "/api/files/upload/sign", {});
    check("upload signature for this store's folder", r.data.fields?.folder === `/stores/${store.id}` && r.data.uploadUrl === `${MOCK}/ik/upload` && r.data.fields.signature, r.data);
    const ikFile = (id, extra = {}) => ({ fileId: id, name: `${id}.png`, filePath: `/stores/${store.id}/${id}.png`, url: `https://ik.imagekit.io/oyktest/stores/${store.id}/${id}.png`, fileType: "image", mime: "image/png", size: 2048, width: 40, height: 30, ...extra });
    mock.ik.set("fid_ok", ikFile("fid_ok"));
    r = await owner("POST", "/api/files/upload/complete", { providerFileId: "fid_ok", name: "shirt.png" });
    const file = r.data.file;
    check("verified with ImageKit, recorded with its CDN URL (no bytes in the DB)", r.status === 201 && file.storage === "imagekit" && file.url.startsWith("https://ik.imagekit.io/") && file.width === 40 && file.name === "shirt.png", r.data);
    r = await owner("POST", "/api/files/upload/complete", { providerFileId: "fid_ok" });
    check("completing twice returns the same file", r.data.file?.id === file.id, r.data);
    mock.ik.set("fid_other", ikFile("fid_other", { filePath: "/stores/someone-else/x.png" }));
    r = await owner("POST", "/api/files/upload/complete", { providerFileId: "fid_other" });
    check("a file outside this store's folder can't be claimed", r.status === 404, r.data);
    mock.ik.set("fid_svg", ikFile("fid_svg", { mime: "image/svg+xml", name: "x.svg" }));
    r = await owner("POST", "/api/files/upload/complete", { providerFileId: "fid_svg" });
    check("an SVG is refused and deleted from ImageKit", r.status === 400 && !mock.ik.has("fid_svg"), r.data);
    r = await owner("DELETE", `/api/files/${file.id}`);
    check("deleting a file removes it from ImageKit too", r.status === 204 && !mock.ik.has("fid_ok"));

    // The paid Phone Login app
    r = await owner("GET", "/api/apps");
    const phoneApp = (r.data.apps || []).find((a) => a.key === "phone-login");
    check("Phone Login app in the catalog at ₹299/month", phoneApp?.priceMonthly === 299 && phoneApp.settingsSchema?.[0]?.type === "select", phoneApp);
    r = await owner("POST", "/api/apps/phone-login/install", { settings: { channel: "sms" } });
    check("installed", r.status === 200 && r.data.app?.installed && r.data.app.chargedFrom, r.data);
    const charges = await prisma.appCharge.findMany({ where: { storeId: store.id } });
    check("installing adds one ₹299 charge for the current period", charges.length === 1 && Number(charges[0].amount) === 299 && charges[0].status === "pending", charges);
    await owner("POST", "/api/apps/phone-login/install", { settings: { channel: "sms" } });
    check("saving its settings again doesn't add a second charge", (await prisma.appCharge.count({ where: { storeId: store.id } })) === 1);
    r = await owner("GET", "/api/billing");
    check("next payment shows the app", r.data.next?.apps === 299, r.data.next);

    // Shopper phone sign-in
    const h = store.handle;
    const sf = (p, body, headers) => fetch(`${API}/api/storefront/${h}${p}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }).then(async (res) => ({ status: res.status, data: await res.json().catch(() => null) }));
    const lastCode = async (to) => (await prisma.messageLog.findFirst({ where: { storeId: store.id, to }, orderBy: { createdAt: "desc" } }))?.body?.match(/^(\d{6})/)?.[1];

    r = await sf("/account/phone/code", { phone: "98765 43210" });
    check("code sent to an Indian number (normalised)", r.status === 200 && r.data.phone === "+919876543210" && r.data.channel === "sms", r.data);
    let code = await lastCode("919876543210");
    r = await sf("/account/phone/verify", { phone: "+91 98765 43210", code: code === "000000" ? "111111" : "000000" });
    check("a wrong code is refused", r.status === 400, r.data);
    r = await sf("/account/phone/verify", { phone: "9876543210", code });
    check("new number: verified, sign-up still to finish", r.status === 200 && r.data.signupTicket && !r.data.token, r.data);
    const buyerEmail = `phone-buyer-${stamp}@test.oyklane.dev`;
    r = await sf("/account/phone/complete", { ticket: r.data.signupTicket, name: "Phone Buyer", email: buyerEmail });
    const phoneToken = r.data?.token;
    check("sign-up finished → signed in", r.status === 200 && phoneToken, r.data);
    let buyer = await prisma.customer.findFirst({ where: { storeId: store.id, email: buyerEmail } });
    check("customer saved with the verified number", buyer?.phone === "+919876543210" && buyer.phoneVerifiedAt, buyer);

    r = await sf("/account/phone/code", { phone: "9876543210" });
    r = await sf("/account/phone/verify", { phone: "9876543210", code: await lastCode("919876543210") });
    check("returning number signs straight in", r.status === 200 && r.data.token && r.data.customer?.id === buyer.id, r.data);

    r = await sf("/account/phone/code", { phone: "+1 415 555 0100" });
    check("numbers outside the allowed countries are refused (SMS-pumping guard)", r.status === 400 && /\+91/.test(r.data?.error || ""), r.data);

    // A number joining an account that already has history needs that email's code.
    const regular = await prisma.customer.create({ data: { storeId: store.id, email: `regular-${stamp}@test.oyklane.dev`, name: "Regular", address1: "12 MG Road" } });
    r = await sf("/account/phone/code", { phone: "9123456780" });
    r = await sf("/account/phone/verify", { phone: "9123456780", code: await lastCode("919123456780") });
    const ticket2 = r.data.signupTicket;
    r = await sf("/account/phone/complete", { ticket: ticket2, name: "Someone", email: regular.email });
    check("existing account with history → email code required", r.status === 200 && r.data.needsEmailCode === true && !r.data.token, r.data);
    const codeMail = await prisma.emailLog.findFirst({ where: { storeId: store.id, to: regular.email, template: "sign_in_code" }, orderBy: { createdAt: "desc" } });
    const emailCode = String(codeMail?.html || "").match(/>(\d)<\/div><\/td>/g)?.map((m) => m[1]).join("");
    r = await sf("/account/phone/complete", { ticket: ticket2, name: "Someone", email: regular.email, code: emailCode === "000000" ? "111111" : "000000" });
    check("…a wrong email code is refused", r.status === 400, r.data);
    r = await sf("/account/phone/complete", { ticket: ticket2, name: "Someone", email: regular.email, code: emailCode });
    const linked = await prisma.customer.findUnique({ where: { id: regular.id } });
    check("…the right one links the number to that account", r.data?.token && r.data.customer?.id === regular.id && linked.phoneVerifiedAt && linked.phone === "+919123456780" && linked.name === "Regular", linked);

    r = await sf("/account/profile", { name: "Phone Buyer", phone: "9000000001" }, { "x-shopper-token": phoneToken });
    buyer = await prisma.customer.findUnique({ where: { id: buyer.id } });
    check("changing the number in the profile un-verifies it", r.status === 200 && buyer.phone === "9000000001" && buyer.phoneVerifiedAt === null, buyer);

    // Paid app on real billing cycles (sandbox autopay + test clock)
    r = await owner("POST", "/api/billing/checkout", { method: "upi" });
    check("sandbox autopay on", r.data?.completed === true, r.data);
    const sub = await prisma.subscription.findUnique({ where: { storeId: store.id } });
    await owner("POST", "/api/billing/_test/clock", { now: new Date(new Date(sub.trialEndsAt).getTime() + 3600e3).toISOString() });
    const intro = await prisma.billingCycle.findFirst({ where: { subscriptionId: sub.id, kind: "intro" } });
    check("first bill: ₹99 intro + ₹299 app (installed during the trial) + GST", intro && Number(intro.planAmount) === 99 && Number(intro.appsAmount) === 299 && Number(intro.total) === 469.64 && intro.status === "paid", intro && { plan: intro.planAmount, apps: intro.appsAmount, total: intro.total, status: intro.status });
    const inv = intro && (await prisma.platformInvoice.findUnique({ where: { cycleId: intro.id } }));
    check("invoice lists the app", (inv?.lines || []).some((l) => /Phone Login app/.test(l.description) && Number(l.amount) === 299), inv?.lines);

    r = await owner("POST", "/api/apps/phone-login/uninstall");
    check("app removed", r.status === 204);
    r = await sf("/account/phone/code", { phone: "9876543210" });
    check("phone sign-in is gone without the app", r.status === 404, r.data);

    const s2 = await prisma.subscription.findUnique({ where: { storeId: store.id } });
    await owner("POST", "/api/billing/_test/clock", { now: new Date(new Date(s2.currentPeriodEnd).getTime() + 3600e3).toISOString() });
    const renew1 = await prisma.billingCycle.findFirst({ where: { subscriptionId: sub.id, kind: "regular" }, orderBy: { periodStart: "asc" } });
    check("removing it mid-period: that period's ₹299 is still on the next bill", renew1 && Number(renew1.appsAmount) === 299, renew1 && { apps: renew1.appsAmount });
    const s3 = await prisma.subscription.findUnique({ where: { storeId: store.id } });
    await owner("POST", "/api/billing/_test/clock", { now: new Date(new Date(s3.currentPeriodEnd).getTime() + 3600e3).toISOString() });
    const renew2 = await prisma.billingCycle.findFirst({ where: { subscriptionId: sub.id, kind: "regular" }, orderBy: { periodStart: "desc" } });
    check("…and nothing after that", renew2 && renew2.id !== renew1?.id && Number(renew2.appsAmount) === 0, renew2 && { apps: renew2.appsAmount });

    // Google sign-in — sellers
    const googleStart = async (who, p) => {
      const r1 = await who("GET", p);
      const loc = new URL(r1.location || "http://x/");
      return { state: loc.searchParams.get("state"), nonce: loc.searchParams.get("nonce"), redirect: loc.searchParams.get("redirect_uri"), status: r1.status, loc: r1.location };
    };
    const now = Math.floor(Date.now() / 1000);
    const gEmail = `google-seller-${stamp}@test.oyklane.dev`;
    created.emails.push(gEmail);
    const seller = client();
    let g = await googleStart(seller, "/api/auth/google/start");
    check("seller Google: redirect to Google with state + nonce", g.status === 302 && g.state && g.nonce && g.redirect.endsWith("/api/auth/google/callback"), g);
    mock.setGoogle({ aud: "google-client-test", iss: "accounts.google.com", exp: now + 600, nonce: g.nonce, sub: `gsub-${stamp}`, email: gEmail, email_verified: true, name: "Gia Seller" });
    r = await seller("GET", `/api/auth/google/callback?code=c1&state=${encodeURIComponent(g.state)}`);
    check("new Google account → register with a ticket", r.status === 302 && r.location.startsWith(`${ADMIN}/register?google=`), r.location);
    const gTicket = new URL(r.location).searchParams.get("google");
    r = await seller("POST", "/api/auth/google/register", { ticket: gTicket, storeName: `Google Store ${stamp}` });
    check("store created, email verified", r.status === 201 && r.data.user?.emailVerified === true, r.data);
    if (r.data.store?.id) created.storeIds.push(r.data.store.id);
    r = await seller("POST", "/api/auth/google/register", { ticket: gTicket, storeName: "Again" });
    check("the ticket can't create a second account", r.status === 409, r.data);

    const returning = client();
    g = await googleStart(returning, "/api/auth/google/start");
    mock.setGoogle({ aud: "google-client-test", iss: "accounts.google.com", exp: now + 600, nonce: g.nonce, sub: `gsub-${stamp}`, email: gEmail, email_verified: true });
    r = await returning("GET", `/api/auth/google/callback?code=c2&state=${encodeURIComponent(g.state)}`);
    const cookieName = process.env.COOKIE_NAME || "sc_session";
    check("returning Google user signed straight in", r.status === 302 && r.location === `${ADMIN}/admin` && Object.keys(returning.jar).some((k) => k === cookieName || /session|token/i.test(k)), { loc: r.location, jar: Object.keys(returning.jar) });

    const attacker = client();
    g = await googleStart(attacker, "/api/auth/google/start");
    const victim = client();
    r = await victim("GET", `/api/auth/google/callback?code=c3&state=${encodeURIComponent(g.state)}`);
    check("a sign-in started in another browser is refused (login CSRF)", r.status === 302 && r.location.startsWith(`${ADMIN}/login?error=`), r.location);

    // Google sign-in — shoppers
    const base = oyklaneAddress(store);
    const shopperNonce = crypto.randomBytes(24).toString("base64url");
    const shopper = client();
    r = await shopper("GET", `/api/shopper/google/start?store=${h}&base=${encodeURIComponent("https://evil.example")}&sn=${sha256(shopperNonce)}`);
    check("shopper Google: a return address that isn't the store's is refused", r.status === 400, r.data);
    g = await googleStart(shopper, `/api/shopper/google/start?store=${h}&base=${encodeURIComponent(base)}&sn=${sha256(shopperNonce)}&return_to=checkout`);
    check("shopper Google: redirect to Google", g.status === 302 && g.redirect.endsWith("/api/shopper/google/callback"), g);
    const gsEmail = `google-shopper-${stamp}@test.oyklane.dev`;
    mock.setGoogle({ aud: "google-client-test", iss: "https://accounts.google.com", exp: now + 600, nonce: g.nonce, sub: `gs-${stamp}`, email: gsEmail, email_verified: true, name: "Gus Shopper" });
    r = await shopper("GET", `/api/shopper/google/callback?code=c4&state=${encodeURIComponent(g.state)}`);
    check("back to the store's own address with a ticket", r.status === 302 && r.location.startsWith(`${base}/account/google/callback?ticket=`) && r.location.includes("return_to=checkout"), r.location);
    const sTicket = new URL(r.location).searchParams.get("ticket");
    r = await sf("/account/google/exchange", { ticket: sTicket, nonce: "not-the-right-nonce-value" });
    check("the ticket only works in the browser that started it", r.status === 400, r.data);
    r = await sf("/account/google/exchange", { ticket: sTicket, nonce: shopperNonce });
    const gShopper = await prisma.customer.findFirst({ where: { storeId: store.id, email: gsEmail } });
    check("shopper signed in; customer created with a verified email", r.status === 200 && r.data.token && gShopper?.emailVerifiedAt && gShopper.name === "Gus Shopper", r.data);
    r = await sf("/account/google/exchange", { ticket: sTicket, nonce: shopperNonce });
    check("a ticket works once", r.status === 400, r.data);
  } catch (err) {
    fail += 1;
    console.log(`FAIL  unexpected error: ${err.stack || err}`);
    console.log(api.log().split("\n").filter((l) => /"level":(40|50)|Error/.test(l)).slice(-10).join("\n").slice(-4000));
  } finally {
    api.child.kill();
    for (const id of created.storeIds) {
      await prisma.messageLog.deleteMany({ where: { storeId: id } }).catch(() => {});
      await prisma.taxTransaction.deleteMany({ where: { storeId: id } }).catch(() => {});
      await prisma.store.delete({ where: { id } }).catch((e) => console.log("cleanup:", e.message));
    }
    await prisma.user.deleteMany({ where: { email: { in: created.emails } } }).catch(() => {});
    await prisma.emailLog.deleteMany({ where: { to: { endsWith: "@test.oyklane.dev" } } }).catch(() => {});
    console.log("      (test stores, users, messages and emails deleted)");
  }
}

async function main() {
  const mock = await startMock();
  const { PrismaClient } = require(path.join(ROOT, "packages/database/node_modules/@prisma/client"));
  const prisma = new PrismaClient();
  try {
    await partOne(mock);
    await partTwo(mock, prisma);
  } catch (err) {
    fail += 1;
    console.log(`FAIL  unexpected error: ${err.stack || err}`);
  } finally {
    await prisma.$disconnect();
    mock.server.close();
  }
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();

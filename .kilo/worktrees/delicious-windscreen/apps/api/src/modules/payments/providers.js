const crypto = require("crypto");
const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");
const { safeEqual } = require("../../lib/crypto");

/**
 * The payment gateways a seller can connect (Settings ▸ Payments). Each
 * takes the seller's own credentials, so shoppers pay the seller directly.
 *
 * Every provider implements:
 *   fields                — what the seller enters (secret ones are never shown back)
 *   check(creds, test)    — a cheap authenticated call: are the keys right?
 *   start(ctx)            — begin a payment for an order (ctx.mode: the way
 *                           the shopper chose at checkout — "upi", "card",
 *                           "netbanking", … — to open the gateway on); returns how the
 *                           shopper continues: { kind: "redirect", url } |
 *                           { kind: "form", action, fields } |
 *                           { kind: "razorpay", … } | { kind: "cashfree", … }
 *                           plus `ref`, the gateway's id to store on the order
 *   confirm(ctx, params)  — server-to-server: did the payment for `ref`
 *                           succeed, and for the right amount? Returns
 *                           { paid, reference, message }
 *
 * No SDKs — plain HTTPS calls, so each is small and testable against a mock.
 */

const paise = (amount) => Math.round(Number(amount) * 100);
const fixed2 = (amount) => (Math.round(Number(amount) * 100) / 100).toFixed(2);

async function json(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

// ── Razorpay ─────────────────────────────────────────────────────────
const razorpay = {
  key: "razorpay",
  name: "Razorpay",
  blurb: "UPI, cards, net banking and wallets. Popular across India.",
  currencies: ["INR"],
  docs: "https://dashboard.razorpay.com/app/website-app-settings/api-keys",
  fields: [
    { key: "keyId", label: "Key ID", placeholder: "rzp_live_… or rzp_test_…" },
    { key: "keySecret", label: "Key secret", secret: true },
  ],
  base: () => env.RAZORPAY_API_URL || "https://api.razorpay.com/v1",
  auth: (c) => `Basic ${Buffer.from(`${c.keyId}:${c.keySecret}`).toString("base64")}`,
  async check(c) {
    const res = await fetch(`${razorpay.base()}/orders?count=1`, { headers: { authorization: razorpay.auth(c) } });
    if (res.status === 401) throw new HttpError(400, "Razorpay rejected these keys.");
    if (!res.ok && res.status !== 404) throw new HttpError(400, `Razorpay answered ${res.status}.`);
  },
  async start({ creds, order, amount, store, mode }) {
    const res = await fetch(`${razorpay.base()}/orders`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: razorpay.auth(creds) },
      body: JSON.stringify({ amount: paise(amount), currency: store.currency || "INR", receipt: order.id }),
    });
    const data = await json(res);
    if (!res.ok) throw new HttpError(502, `Razorpay: ${data?.error?.description || res.status}`);
    // Checkout.js opens on the chosen method (the storefront's pay page).
    return { ref: data.id, kind: "razorpay", orderId: data.id, amount: data.amount, currency: data.currency || "INR", keyId: creds.keyId, method: mode || null };
  },
  async confirm({ creds, ref }, params) {
    const { razorpay_order_id: rzOrder, razorpay_payment_id: rzPayment, razorpay_signature: sig } = params;
    if (!rzOrder || !rzPayment || !sig || !safeEqual(String(rzOrder), String(ref))) return { paid: false, message: "Payment verification failed" };
    const expected = crypto.createHmac("sha256", creds.keySecret).update(`${rzOrder}|${rzPayment}`).digest("hex");
    if (!safeEqual(expected, String(sig))) return { paid: false, message: "Payment verification failed" };
    return { paid: true, reference: rzPayment };
  },
};

// ── Cashfree ─────────────────────────────────────────────────────────
const CASHFREE_MODES = { upi: "upi", card: "cc,dc,ppc", netbanking: "nb", wallet: "app", emi: "ccemi,dcemi,cardlessemi", paylater: "paylater" };
const cashfree = {
  key: "cashfree",
  name: "Cashfree Payments",
  blurb: "UPI, cards, net banking, wallets and pay later.",
  currencies: ["INR"],
  docs: "https://merchant.cashfree.com/merchants/pg/developers/api-keys",
  fields: [
    { key: "appId", label: "App ID (client ID)" },
    { key: "secretKey", label: "Secret key", secret: true },
  ],
  base: (test) => env.CASHFREE_API_URL || (test ? "https://sandbox.cashfree.com/pg" : "https://api.cashfree.com/pg"),
  headers: (c) => ({ "x-client-id": c.appId, "x-client-secret": c.secretKey, "x-api-version": "2023-08-01", "content-type": "application/json" }),
  async check(c, test) {
    const res = await fetch(`${cashfree.base(test)}/orders/oy_key_check_${Date.now()}`, { headers: cashfree.headers(c) });
    if (res.status === 401 || res.status === 403) throw new HttpError(400, "Cashfree rejected these keys — check them, and that test mode matches the keys.");
  },
  async start({ creds, test, order, amount, store, urls, mode }) {
    const ref = `oy_${order.id}`;
    const res = await fetch(`${cashfree.base(test)}/orders`, {
      method: "POST",
      headers: cashfree.headers(creds),
      body: JSON.stringify({
        order_id: ref,
        order_amount: Number(fixed2(amount)),
        order_currency: store.currency || "INR",
        customer_details: {
          customer_id: (order.customerId || order.id).slice(0, 50),
          customer_email: order.email,
          customer_phone: String(order.phone || "9999999999").replace(/\D/g, "").slice(-10),
          customer_name: order.shippingName || undefined,
        },
        // Only the way the shopper chose at checkout (Cashfree's payment_methods).
        order_meta: { return_url: urls.return, ...(CASHFREE_MODES[mode] && { payment_methods: CASHFREE_MODES[mode] }) },
      }),
    });
    const data = await json(res);
    if (!res.ok || !data.payment_session_id) throw new HttpError(502, `Cashfree: ${data?.message || res.status}`);
    return { ref, kind: "cashfree", sessionId: data.payment_session_id, mode: test ? "sandbox" : "production" };
  },
  async confirm({ creds, test, ref, amount }) {
    const res = await fetch(`${cashfree.base(test)}/orders/${encodeURIComponent(ref)}`, { headers: cashfree.headers(creds) });
    const data = await json(res);
    if (!res.ok) return { paid: false, message: "We couldn't confirm the payment with Cashfree." };
    const paid = data.order_status === "PAID" && Math.abs(Number(data.order_amount) - Number(amount)) < 0.01;
    return { paid, reference: data.cf_order_id ? String(data.cf_order_id) : ref, message: paid ? null : "The payment wasn't completed." };
  },
};

// ── PayU (India) ─────────────────────────────────────────────────────
const PAYU_MODES = { upi: "upi", card: "creditcard|debitcard", netbanking: "netbanking", wallet: "cashcard", emi: "emi", paylater: "bnpl" };
const payuHash = (s) => crypto.createHash("sha512").update(s).digest("hex");
const payu = {
  key: "payu",
  name: "PayU",
  blurb: "UPI, cards, net banking and EMI on PayU's hosted page.",
  currencies: ["INR"],
  docs: "https://onboarding.payu.in/app/account",
  fields: [
    { key: "merchantKey", label: "Merchant key" },
    { key: "salt", label: "Salt (v1)", secret: true },
  ],
  base: (test) => env.PAYU_API_URL || (test ? "https://test.payu.in" : "https://secure.payu.in"),
  async check(c) {
    // PayU has no simple key check; the format is what we can verify.
    if (!/^[A-Za-z0-9]{4,}$/.test(c.merchantKey || "") || String(c.salt || "").length < 8) {
      throw new HttpError(400, "That doesn't look like a PayU merchant key and salt.");
    }
  },
  async start({ creds, test, order, amount, urls, mode }) {
    const txnid = `oy${order.orderNumber}${crypto.randomBytes(3).toString("hex")}`;
    const f = {
      key: creds.merchantKey,
      txnid,
      amount: fixed2(amount),
      productinfo: `Order ${order.orderNumber}`,
      firstname: (order.shippingName || "Customer").split(" ")[0].slice(0, 60),
      email: order.email,
      phone: String(order.phone || "").replace(/\D/g, "").slice(-10),
      surl: urls.return,
      furl: urls.return,
    };
    f.hash = payuHash(`${f.key}|${f.txnid}|${f.amount}|${f.productinfo}|${f.firstname}|${f.email}|||||||||||${creds.salt}`);
    // Only the way the shopper chose at checkout (not part of the hash).
    if (PAYU_MODES[mode]) f.enforce_paymethod = PAYU_MODES[mode];
    return { ref: txnid, kind: "form", action: `${payu.base(test)}/_payment`, fields: f };
  },
  async confirm({ creds, ref, amount }, p) {
    // PayU posts the result back to us, signed with the salt (reverse hash).
    if (String(p.txnid) !== String(ref) || String(p.key) !== String(creds.merchantKey)) return { paid: false, message: "Payment verification failed" };
    const expected = payuHash(
      `${creds.salt}|${p.status}|||||||||||${p.email}|${p.firstname}|${p.productinfo}|${p.amount}|${p.txnid}|${p.key}`
    );
    if (!p.hash || !safeEqual(expected, String(p.hash).toLowerCase())) return { paid: false, message: "Payment verification failed" };
    const paid = p.status === "success" && Math.abs(Number(p.amount) - Number(amount)) < 0.01;
    return { paid, reference: p.mihpayid || p.txnid, message: paid ? null : p.error_Message || "The payment wasn't completed." };
  },
};

// ── Stripe ───────────────────────────────────────────────────────────
const stripe = {
  key: "stripe",
  name: "Stripe",
  blurb: "Cards and wallets worldwide on Stripe Checkout.",
  currencies: null,
  docs: "https://dashboard.stripe.com/apikeys",
  fields: [
    { key: "publishableKey", label: "Publishable key", placeholder: "pk_live_… or pk_test_…" },
    { key: "secretKey", label: "Secret key", secret: true, placeholder: "sk_live_… or sk_test_…" },
  ],
  base: () => env.STRIPE_API_URL || "https://api.stripe.com",
  async call(c, method, path, form) {
    const res = await fetch(`${stripe.base()}${path}`, {
      method,
      headers: { authorization: `Bearer ${c.secretKey}`, ...(form && { "content-type": "application/x-www-form-urlencoded" }) },
      body: form ? new URLSearchParams(form).toString() : undefined,
    });
    return { res, data: await json(res) };
  },
  async check(c, test) {
    if (test && !String(c.secretKey).startsWith("sk_test_")) throw new HttpError(400, "Test mode needs a test secret key (sk_test_…).");
    if (!test && String(c.secretKey).startsWith("sk_test_")) throw new HttpError(400, "Live mode needs a live secret key (sk_live_…).");
    const { res, data } = await stripe.call(c, "GET", "/v1/balance");
    if (!res.ok) throw new HttpError(400, `Stripe rejected the key: ${data?.error?.message || res.status}`);
  },
  async start({ creds, order, amount, store, urls }) {
    const { res, data } = await stripe.call(creds, "POST", "/v1/checkout/sessions", {
      mode: "payment",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": String(store.currency || "INR").toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(paise(amount)),
      "line_items[0][price_data][product_data][name]": `${store.name} — order #${order.orderNumber}`,
      customer_email: order.email,
      client_reference_id: order.id,
      "metadata[orderId]": order.id,
      success_url: `${urls.return}${urls.return.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: urls.cancel,
    });
    if (!res.ok || !data.url) throw new HttpError(502, `Stripe: ${data?.error?.message || res.status}`);
    return { ref: data.id, kind: "redirect", url: data.url };
  },
  async confirm({ creds, ref, amount, order }) {
    const { res, data } = await stripe.call(creds, "GET", `/v1/checkout/sessions/${encodeURIComponent(ref)}`);
    if (!res.ok) return { paid: false, message: "We couldn't confirm the payment with Stripe." };
    const paid = data.payment_status === "paid" && data.client_reference_id === order.id && data.amount_total === paise(amount);
    return { paid, reference: data.payment_intent || data.id, message: paid ? null : "The payment wasn't completed." };
  },
};

// ── PayPal ───────────────────────────────────────────────────────────
const paypal = {
  key: "paypal",
  name: "PayPal",
  blurb: "PayPal balance and cards, for international shoppers.",
  currencies: ["USD", "EUR", "GBP", "AUD", "CAD", "SGD", "JPY"],
  docs: "https://developer.paypal.com/dashboard/applications",
  fields: [
    { key: "clientId", label: "Client ID" },
    { key: "clientSecret", label: "Secret", secret: true },
  ],
  base: (test) => env.PAYPAL_API_URL || (test ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com"),
  async token(c, test) {
    const res = await fetch(`${paypal.base(test)}/v1/oauth2/token`, {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    const data = await json(res);
    if (!res.ok || !data.access_token) throw new HttpError(400, "PayPal rejected these credentials — check them, and that test mode (sandbox) matches.");
    return data.access_token;
  },
  async check(c, test) {
    await paypal.token(c, test);
  },
  async start({ creds, test, order, amount, store, urls }) {
    const token = await paypal.token(creds, test);
    const res = await fetch(`${paypal.base(test)}/v2/checkout/orders`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{ reference_id: order.id, description: `${store.name} order #${order.orderNumber}`, amount: { currency_code: store.currency || "USD", value: fixed2(amount) } }],
        payment_source: { paypal: { experience_context: { return_url: urls.return, cancel_url: urls.cancel, user_action: "PAY_NOW", brand_name: store.name.slice(0, 120) } } },
      }),
    });
    const data = await json(res);
    const link = (data.links || []).find((l) => l.rel === "payer-action" || l.rel === "approve");
    if (!res.ok || !link) throw new HttpError(502, `PayPal: ${data?.message || data?.details?.[0]?.description || res.status}`);
    return { ref: data.id, kind: "redirect", url: link.href };
  },
  async confirm({ creds, test, ref, amount }, params) {
    if (params.token && String(params.token) !== String(ref)) return { paid: false, message: "Payment verification failed" };
    const token = await paypal.token(creds, test);
    const res = await fetch(`${paypal.base(test)}/v2/checkout/orders/${encodeURIComponent(ref)}/capture`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    });
    let data = await json(res);
    if (res.status === 422 && data?.details?.[0]?.issue === "ORDER_ALREADY_CAPTURED") {
      data = await json(await fetch(`${paypal.base(test)}/v2/checkout/orders/${encodeURIComponent(ref)}`, { headers: { authorization: `Bearer ${token}` } }));
    }
    const capture = data?.purchase_units?.[0]?.payments?.captures?.[0];
    const paid = data?.status === "COMPLETED" && capture && Math.abs(Number(capture.amount?.value) - Number(amount)) < 0.01;
    return { paid: Boolean(paid), reference: capture?.id || ref, message: paid ? null : "The payment wasn't completed." };
  },
};

const PROVIDERS = { razorpay, cashfree, payu, stripe, paypal };
const PROVIDER_KEYS = Object.keys(PROVIDERS);

module.exports = { PROVIDERS, PROVIDER_KEYS };

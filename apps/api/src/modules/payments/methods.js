const crypto = require("crypto");
const { env } = require("../../config/env");

/**
 * Which ways to pay each connected gateway actually offers this seller —
 * UPI, cards, net banking, wallets, EMI, pay later — so checkout can show
 * them as separate choices ("UPI", "Card", "Net banking"), and send the
 * shopper to the gateway already on the one they picked.
 *
 * Each gateway is asked with the seller's own keys (their docs):
 *   Razorpay  GET /v1/methods                       — enabled methods
 *   PayU      postservice get_checkout_details        — paymentOptions
 *   Cashfree  POST /pg/eligibility/payment_methods    — eligible methods
 *   Stripe    cards · PayPal  PayPal (fixed)
 * The answer is kept on the store (settings.gatewayMethods) — refreshed when
 * the seller saves the gateway and at most once a day after — and a typical
 * default is used whenever a gateway can't be asked.
 */
const MODES = ["upi", "card", "netbanking", "wallet", "emi", "paylater", "paypal"];
const DEFAULTS = {
  razorpay: ["upi", "card", "netbanking", "wallet"],
  cashfree: ["upi", "card", "netbanking", "wallet"],
  payu: ["upi", "card", "netbanking"],
  stripe: ["card"],
  paypal: ["paypal"],
};
const STALE_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 6000;

const present = (v) => (v && typeof v === "object" ? Object.keys(v).length > 0 : Boolean(v));
const unique = (list) => MODES.filter((m) => list.includes(m));

async function fetchJson(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

const DISCOVER = {
  async razorpay(creds) {
    const base = env.RAZORPAY_API_URL || "https://api.razorpay.com/v1";
    const data = await fetchJson(`${base}/methods?key_id=${encodeURIComponent(creds.keyId)}`, {
      headers: { authorization: `Basic ${Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString("base64")}` },
    });
    const out = [];
    if (present(data.upi)) out.push("upi");
    if (present(data.card)) out.push("card");
    if (present(data.netbanking)) out.push("netbanking");
    if (present(data.wallet)) out.push("wallet");
    if (present(data.emi) || present(data.cardless_emi)) out.push("emi");
    if (present(data.paylater)) out.push("paylater");
    return out;
  },

  async payu(creds, test) {
    const base = env.PAYU_API_URL || (test ? "https://test.payu.in" : "https://info.payu.in");
    const command = "get_checkout_details";
    const var1 = JSON.stringify({ requestId: crypto.randomUUID(), transactionDetails: { amount: 1000 }, useCase: { checkDownStatus: false } });
    const hash = crypto.createHash("sha512").update(`${creds.merchantKey}|${command}|${var1}|${creds.salt}`).digest("hex");
    const data = await fetchJson(`${base}/merchant/postservice.php?form=2`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ key: creds.merchantKey, command, var1, hash }).toString(),
    });
    const o = data?.details?.paymentOptions || data?.result?.paymentOptions || {};
    const out = [];
    if (present(o.upi)) out.push("upi");
    if (present(o.cc) || present(o.dc)) out.push("card");
    if (present(o.nb)) out.push("netbanking");
    if (present(o.cash)) out.push("wallet");
    if (present(o.emi)) out.push("emi");
    if (present(o.bnpl) || present(o.lazypay)) out.push("paylater");
    return out;
  },

  async cashfree(creds, test) {
    const base = env.CASHFREE_API_URL || (test ? "https://sandbox.cashfree.com/pg" : "https://api.cashfree.com/pg");
    const data = await fetchJson(`${base}/eligibility/payment_methods`, {
      method: "POST",
      headers: { "x-client-id": creds.appId, "x-client-secret": creds.secretKey, "x-api-version": "2023-08-01", "content-type": "application/json" },
      body: JSON.stringify({ queries: { amount: 1000 } }),
    });
    const map = {
      upi: "upi",
      credit_card: "card",
      debit_card: "card",
      prepaid_card: "card",
      netbanking: "netbanking",
      wallet: "wallet",
      paylater: "paylater",
      credit_card_emi: "emi",
      debit_card_emi: "emi",
      cardless_emi: "emi",
    };
    return (Array.isArray(data) ? data : [])
      .filter((row) => row.eligibility && map[row.entity_value])
      .map((row) => map[row.entity_value]);
  },

  async stripe() {
    return ["card"];
  },
  async paypal() {
    return ["paypal"];
  },
};

/** Asks one gateway; its typical methods if it can't be asked. */
async function discover(key, creds, test, log) {
  try {
    const found = unique(await DISCOVER[key](creds, test));
    return found.length ? found : DEFAULTS[key] || [];
  } catch (err) {
    log?.info({ err: err.message, gateway: key }, "payments: couldn't ask the gateway for its methods — using its defaults");
    return DEFAULTS[key] || [];
  }
}

module.exports = { MODES, DEFAULTS, STALE_MS, discover };

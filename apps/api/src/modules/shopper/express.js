const phoneAuth = require("./phone");

/**
 * Express checkout (the One-Click Checkout app's popup): the shopper types
 * their mobile number, confirms it with a code, and gets back the delivery
 * addresses used with that number in this store — so a returning buyer
 * just picks one and pays. The code is what makes showing them safe: only
 * the phone's owner sees what was delivered to it.
 *
 * Codes share Phone Login's store (limits, expiry, attempts) but not its
 * app: One-Click only needs an SMS or WhatsApp provider.
 */
const APP_KEY = "one-click-checkout";
const MAX_ADDRESSES = 5;

async function expressConfig(prisma, store) {
  const install = await prisma.storeApp.findFirst({ where: { storeId: store.id, app: { key: APP_KEY } }, select: { id: true } });
  const channels = install ? phoneAuth.liveChannels() : [];
  return { enabled: channels.length > 0, channels };
}

/** Sends the code — or says to carry on without one (no provider, or a
 * number from outside the allowed countries): the order still goes through,
 * there's just nothing saved to show. */
async function requestCode(prisma, store, { phone }, log) {
  const cfg = await expressConfig(prisma, store);
  if (!cfg.enabled) return { otp: false };
  try {
    phoneAuth.parsePhone(phone);
  } catch {
    return { otp: false };
  }
  return { otp: true, ...(await phoneAuth.requestCode(prisma, store, { phone }, log, { cfg })) };
}

async function verify(prisma, store, { phone: rawPhone, code }) {
  const phone = phoneAuth.parsePhone(rawPhone);
  await phoneAuth.checkCode(prisma, store, phone, code);
  return { phone: phoneAuth.display(phone), ...(await savedDetails(prisma, store, phone)) };
}

const key = (a) => [a.address1, a.zip].map((v) => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "")).join("|");

/** The number's name, email and distinct recent delivery addresses: the
 * account that verified it (Phone Login), then its orders, newest first. */
async function savedDetails(prisma, store, phone) {
  const last10 = phone.slice(-10);
  const [customer, orders] = await Promise.all([
    phoneAuth.verifiedCustomer(prisma, store, phone),
    prisma.$queryRaw`
      SELECT "email", "shippingName", "shippingAddress1", "shippingAddress2", "shippingCity", "shippingProvince", "shippingZip", "shippingCountry"
      FROM orders
      WHERE "storeId" = ${store.id}
        AND "shippingAddress1" IS NOT NULL
        AND right(regexp_replace(coalesce("phone", ''), '\\D', '', 'g'), 10) = ${last10}
      ORDER BY "createdAt" DESC
      LIMIT 25
    `,
  ]);

  const addresses = [];
  const seen = new Set();
  const add = (a) => {
    if (!a.address1 || !a.zip || seen.has(key(a)) || addresses.length >= MAX_ADDRESSES) return;
    seen.add(key(a));
    addresses.push(a);
  };
  if (customer?.address1) {
    add({ name: customer.name, address1: customer.address1, address2: customer.address2, city: customer.city, province: customer.province, zip: customer.zip, country: customer.country || "IN" });
  }
  for (const o of orders) {
    add({ name: o.shippingName, address1: o.shippingAddress1, address2: o.shippingAddress2, city: o.shippingCity, province: o.shippingProvince, zip: o.shippingZip, country: o.shippingCountry || "IN" });
  }
  return {
    name: customer?.name || orders[0]?.shippingName || "",
    email: customer?.email || orders[0]?.email || "",
    addresses,
  };
}

module.exports = { expressConfig, requestCode, verify, APP_KEY };

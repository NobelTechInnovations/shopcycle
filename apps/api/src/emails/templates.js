const { formatCurrency } = require("@shopcycle/utils");

/**
 * Every email the platform sends, as { subject, html }. Email clients
 * ignore <style> blocks and modern CSS, so the markup is table-based with
 * inline styles — plain on purpose, and readable in Gmail, Outlook and
 * Apple Mail alike. Anything that came from a user (names, product titles,
 * addresses) goes through esc() before it's placed in the HTML.
 */

const INK = "#111114";
const MUTED = "#6B6B76";
const LINE = "#E6E6EA";
const BG = "#F4F4F6";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const money = (amount, currency = "INR") => formatCurrency(Number(amount || 0), currency);

function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px"><tr><td style="background:${INK};border-radius:8px">
  <a href="${esc(href)}" style="display:inline-block;padding:12px 22px;font:600 14px ${FONT};color:#ffffff;text-decoration:none">${esc(label)}</a>
</td></tr></table>`;
}

function p(text, style = "") {
  return `<p style="margin:0 0 14px;font:400 15px/1.6 ${FONT};color:${INK};${style}">${text}</p>`;
}

function small(text) {
  return `<p style="margin:16px 0 0;font:400 13px/1.55 ${FONT};color:${MUTED}">${text}</p>`;
}

/**
 * The shell every email shares. `brand` is the store's name for shopper
 * emails and "Oyklane" for seller emails. The preheader is the grey
 * preview line inbox lists show after the subject.
 */
function layout({ brand, preheader = "", body, footer }) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(brand)}</title></head>
<body style="margin:0;padding:0;background:${BG}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG}"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    <tr><td style="padding:0 4px 16px;font:700 18px ${FONT};color:${INK};letter-spacing:-0.01em">${esc(brand)}</td></tr>
    <tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:14px;padding:32px 28px">${body}</td></tr>
    <tr><td style="padding:18px 4px 0;font:400 12px/1.6 ${FONT};color:${MUTED}">${footer}</td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

function heading(text) {
  return `<h1 style="margin:0 0 16px;font:600 22px/1.3 ${FONT};color:${INK};letter-spacing:-0.02em">${text}</h1>`;
}

function storeFooter(store) {
  const contact = store.supportEmail
    ? `Questions? Reply to this email or write to <a href="mailto:${esc(store.supportEmail)}" style="color:${MUTED}">${esc(store.supportEmail)}</a>.<br>`
    : "Questions? Just reply to this email.<br>";
  return `${contact}${esc(store.name)} · Powered by Oyklane`;
}

const PLATFORM_FOOTER = "Oyklane — commerce for Indian brands.<br>You're receiving this because of activity on your Oyklane account.";

// ── Order building blocks ─────────────────────────────────────────

function itemRows(items, currency) {
  return items
    .map(
      (item) => `<tr>
  <td style="padding:10px 0;border-bottom:1px solid ${LINE};font:400 14px/1.45 ${FONT};color:${INK}">${esc(item.title)}<span style="color:${MUTED}"> × ${Number(item.quantity)}</span></td>
  <td align="right" style="padding:10px 0;border-bottom:1px solid ${LINE};font:500 14px ${FONT};color:${INK};white-space:nowrap">${money(item.total ?? item.price * item.quantity, currency)}</td>
</tr>`
    )
    .join("");
}

function summaryRow(label, value, bold = false) {
  const weight = bold ? 600 : 400;
  return `<tr><td style="padding:4px 0;font:${weight} 14px ${FONT};color:${bold ? INK : MUTED}">${label}</td><td align="right" style="padding:4px 0;font:${weight} 14px ${FONT};color:${INK};white-space:nowrap">${value}</td></tr>`;
}

function orderSummary(order) {
  const currency = order.currency || "INR";
  const rows = [
    summaryRow("Subtotal", money(order.subtotal, currency)),
    Number(order.discount) > 0
      ? summaryRow(`Discount${order.discountCode ? ` (${esc(order.discountCode)})` : ""}`, `−${money(order.discount, currency)}`)
      : "",
    summaryRow("Shipping", Number(order.shipping) > 0 ? money(order.shipping, currency) : "Free"),
    Number(order.tax) > 0 ? summaryRow("Tax", money(order.tax, currency)) : "",
    summaryRow("Total", money(order.total, currency), true),
  ].join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px">${itemRows(order.items || [], currency)}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">${rows}</table>`;
}

function shippingAddress(order) {
  if (!order.shippingAddress1) return "";
  const lines = [
    order.shippingName,
    [order.shippingAddress1, order.shippingAddress2].filter(Boolean).join(", "),
    [order.shippingCity, order.shippingProvince, order.shippingZip].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .map(esc)
    .join("<br>");
  return `<p style="margin:22px 0 4px;font:600 13px ${FONT};color:${INK}">Shipping to</p><p style="margin:0;font:400 14px/1.55 ${FONT};color:${MUTED}">${lines}</p>`;
}

// ── Seller (Oyklane) emails ───────────────────────────────────────

function verifyEmail({ name, url }) {
  return {
    subject: "Confirm your email for Oyklane",
    html: layout({
      brand: "Oyklane",
      preheader: "One click to confirm this is your email address.",
      body: [
        heading("Confirm your email"),
        p(`Hi ${esc(name)}, thanks for starting your store on Oyklane. Confirm this is your email address so you can always recover your account.`),
        button(url, "Confirm email"),
        small("This link works for 3 days. If you didn't create an Oyklane account, you can ignore this email."),
      ].join(""),
      footer: PLATFORM_FOOTER,
    }),
  };
}

function passwordReset({ name, url }) {
  return {
    subject: "Reset your Oyklane password",
    html: layout({
      brand: "Oyklane",
      preheader: "Use this link to choose a new password. It expires in 30 minutes.",
      body: [
        heading("Reset your password"),
        p(`Hi ${esc(name)}, we received a request to reset the password for your Oyklane account.`),
        button(url, "Choose a new password"),
        small("This link expires in 30 minutes and works once. If you didn't ask for this, you can ignore this email — your password stays the same."),
      ].join(""),
      footer: PLATFORM_FOOTER,
    }),
  };
}

function passwordChanged({ name, when, ip }) {
  return {
    subject: "Your Oyklane password was changed",
    html: layout({
      brand: "Oyklane",
      preheader: "If this wasn't you, reset your password now.",
      body: [
        heading("Your password was changed"),
        p(`Hi ${esc(name)}, the password for your Oyklane account was changed on ${esc(when)}${ip ? ` from IP address ${esc(ip)}` : ""}. You've been signed out on every device.`),
        p("If this wasn't you, reset your password right away and check your store's team members.", `color:${MUTED}`),
      ].join(""),
      footer: PLATFORM_FOOTER,
    }),
  };
}

function newOrderAlert({ store, order, adminUrl }) {
  const currency = order.currency || "INR";
  return {
    subject: `New order #${order.orderNumber} · ${money(order.total, currency)}`,
    html: layout({
      brand: store.name,
      preheader: `${order.shippingName || order.email || "A customer"} placed an order for ${money(order.total, currency)}.`,
      body: [
        heading(`New order #${order.orderNumber}`),
        p(
          `${esc(order.shippingName || order.email || "A customer")} placed an order for <strong>${money(order.total, currency)}</strong> · ${
            order.paymentMethod === "cod" ? "Cash on delivery" : "Paid online"
          }.`
        ),
        orderSummary(order),
        shippingAddress(order),
        button(adminUrl, "View order"),
      ].join(""),
      footer: "You get these because new-order alerts are on in Settings ▸ Notifications.",
    }),
  };
}

// ── Shopper emails (sent on the store's behalf) ───────────────────

function orderConfirmation({ store, order, statusUrl }) {
  const currency = order.currency || "INR";
  const paymentLine =
    order.paymentMethod === "cod"
      ? `Please keep <strong>${money(order.total, currency)}</strong> ready to pay on delivery.`
      : order.paymentStatus === "paid"
        ? `We've received your payment of <strong>${money(order.total, currency)}</strong>.`
        : "Your payment is being confirmed.";
  return {
    subject: `Order #${order.orderNumber} confirmed`,
    html: layout({
      brand: store.name,
      preheader: `Thanks for your order! We'll let you know when it ships.`,
      body: [
        heading(`Thanks for your order, ${esc((order.shippingName || "").split(" ")[0] || "there")}!`),
        p(`Your order <strong>#${order.orderNumber}</strong> is confirmed. ${paymentLine} We'll email you again when it ships.`),
        button(statusUrl, "View your order"),
        orderSummary(order),
        shippingAddress(order),
      ].join(""),
      footer: storeFooter(store),
    }),
  };
}

function shippingUpdate({ store, order, fulfillment, statusUrl }) {
  const tracking = fulfillment.trackingNumber
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 4px;background:${BG};border-radius:10px;width:100%"><tr><td style="padding:14px 16px;font:400 14px/1.6 ${FONT};color:${INK}">
  ${fulfillment.courier ? `<span style="color:${MUTED}">Courier</span> ${esc(fulfillment.courier)}<br>` : ""}
  <span style="color:${MUTED}">Tracking number</span> <strong>${esc(fulfillment.trackingNumber)}</strong>
</td></tr></table>`
    : "";
  const shippedItems = (fulfillment.lineItems || []).length ? fulfillment.lineItems : order.items;
  return {
    subject: `Your order #${order.orderNumber} is on its way`,
    html: layout({
      brand: store.name,
      preheader: fulfillment.trackingNumber ? `Tracking number ${fulfillment.trackingNumber}` : "Your order has shipped.",
      body: [
        heading("Your order is on its way"),
        p(`Good news — ${shippedItems.length === (order.items || []).length ? "your order" : "part of your order"} <strong>#${order.orderNumber}</strong> has shipped.`),
        tracking,
        button(fulfillment.trackingUrl || statusUrl, fulfillment.trackingUrl ? "Track your package" : "View your order"),
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${itemRows(shippedItems, order.currency)}</table>`,
        shippingAddress(order),
      ].join(""),
      footer: storeFooter(store),
    }),
  };
}

function orderDelivered({ store, order, statusUrl }) {
  return {
    subject: `Your order #${order.orderNumber} was delivered`,
    html: layout({
      brand: store.name,
      preheader: "We hope you love it.",
      body: [
        heading("Delivered"),
        p(`Your order <strong>#${order.orderNumber}</strong> has been delivered. We hope you love it!`),
        p("If something isn't right, you can request a return from your order page.", `color:${MUTED}`),
        button(statusUrl, "View your order"),
      ].join(""),
      footer: storeFooter(store),
    }),
  };
}

function orderCancelled({ store, order, statusUrl, reason }) {
  const currency = order.currency || "INR";
  const refundLine =
    order.paymentMethod !== "cod" && ["paid", "partially_refunded", "refunded"].includes(order.paymentStatus)
      ? "Any payment you made will be refunded to your original payment method within 5–7 business days."
      : "You won't be charged.";
  return {
    subject: `Order #${order.orderNumber} has been cancelled`,
    html: layout({
      brand: store.name,
      preheader: `Your order for ${money(order.total, currency)} was cancelled.`,
      body: [
        heading("Your order was cancelled"),
        p(`Order <strong>#${order.orderNumber}</strong> has been cancelled${reason ? ` (${esc(reason)})` : ""}. ${refundLine}`),
        button(statusUrl, "View order"),
      ].join(""),
      footer: storeFooter(store),
    }),
  };
}

function refundIssued({ store, order, refund, statusUrl }) {
  const currency = order.currency || "INR";
  const how =
    refund.method === "razorpay"
      ? "It's on its way back to your original payment method and usually shows up within 5–7 business days."
      : `${esc(store.name)} will pay this back to you directly.`;
  return {
    subject: `Refund of ${money(refund.amount, currency)} for order #${order.orderNumber}`,
    html: layout({
      brand: store.name,
      preheader: `A refund of ${money(refund.amount, currency)} has been issued.`,
      body: [
        heading("Your refund has been issued"),
        p(`We've refunded <strong>${money(refund.amount, currency)}</strong> for order <strong>#${order.orderNumber}</strong>${refund.reason ? ` (${esc(refund.reason)})` : ""}. ${how}`),
        button(statusUrl, "View order"),
      ].join(""),
      footer: storeFooter(store),
    }),
  };
}

const RETURN_COPY = {
  requested: ["We've received your return request", "We'll review it and get back to you shortly."],
  approved: ["Your return is approved", "Please pack the items securely. We'll arrange pickup or share where to send them."],
  declined: ["About your return request", "We weren't able to accept this return."],
  received: ["We've received your return", "We've got the items back. If a refund is due, you'll get a separate email when it's issued."],
};

function returnUpdate({ store, order, returnRequest, statusUrl }) {
  const [title, line] = RETURN_COPY[returnRequest.status] || RETURN_COPY.requested;
  return {
    subject: `${title} · order #${order.orderNumber}`,
    html: layout({
      brand: store.name,
      preheader: line,
      body: [
        heading(title),
        p(`${line}${returnRequest.merchantNote ? `<br><br><span style="color:${MUTED}">Note from ${esc(store.name)}:</span> ${esc(returnRequest.merchantNote)}` : ""}`),
        button(statusUrl, "View order"),
      ].join(""),
      footer: storeFooter(store),
    }),
  };
}

function signInCode({ store, code }) {
  const digits = String(code)
    .split("")
    .map((d) => `<td style="padding:0 3px"><div style="width:40px;height:52px;line-height:52px;border:1px solid ${LINE};border-radius:10px;text-align:center;font:600 24px ${FONT};color:${INK}">${esc(d)}</div></td>`)
    .join("");
  return {
    subject: `${code} is your ${store.name} sign-in code`,
    html: layout({
      brand: store.name,
      preheader: "It expires in 10 minutes.",
      body: [
        heading("Your sign-in code"),
        p(`Enter this code to sign in to your ${esc(store.name)} account:`),
        `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 18px"><tr>${digits}</tr></table>`,
        small("It expires in 10 minutes. If you didn't try to sign in, you can ignore this email — nobody can get in without the code."),
      ].join(""),
      footer: storeFooter(store),
    }),
  };
}

function abandonedCheckout({ store, cart, recoverUrl, customerName }) {
  const currency = store.currency || "INR";
  return {
    subject: `You left something in your cart at ${store.name}`,
    html: layout({
      brand: store.name,
      preheader: "Your cart is saved — pick up where you left off.",
      body: [
        heading(`${customerName ? `${esc(customerName.split(" ")[0])}, you` : "You"} left something behind`),
        p("Your cart is saved. Complete your order whenever you're ready — items can sell out."),
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 4px">${itemRows(
          cart.items.map((i) => ({ title: i.title, quantity: i.quantity, total: i.lineTotal })),
          currency
        )}</table>`,
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px">${summaryRow("Subtotal", money(cart.subtotal, currency), true)}</table>`,
        button(recoverUrl, "Complete your order"),
      ].join(""),
      footer: `${storeFooter(store)}<br>You got this because you started checking out at ${esc(store.name)}.`,
    }),
  };
}

module.exports = {
  esc,
  layout,
  verifyEmail,
  passwordReset,
  passwordChanged,
  newOrderAlert,
  orderConfirmation,
  shippingUpdate,
  orderDelivered,
  orderCancelled,
  refundIssued,
  returnUpdate,
  signInCode,
  abandonedCheckout,
};

const { formatCurrency } = require("@shopcycle/utils");
const { iconUrl } = require("./assets");

/**
 * Every email the platform sends, as { subject, html }. Email clients
 * ignore <style> blocks and modern CSS, so the markup is table-based with
 * inline styles — readable in Gmail, Outlook and Apple Mail alike.
 * Anything that came from a user (names, product titles, addresses) goes
 * through esc() before it's placed in the HTML.
 *
 * Shopper emails wear the store's email design (Apps ▸ Flow ▸ Email
 * design, saved in store.settings.emailDesign): its logo, colour and
 * layout. Seller emails wear Oyklane's.
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

// ── Design ────────────────────────────────────────────────────────

const STYLES = ["classic", "banner", "minimal"];

/** Dark text on light colours, white on dark ones. */
function onColor(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? INK : "#ffffff";
}

function makeDesign({ accent, logoUrl, logoWidth, style } = {}) {
  const colour = /^#[0-9a-f]{6}$/i.test(String(accent || "")) ? String(accent) : INK;
  return {
    accent: colour,
    onAccent: onColor(colour),
    logoUrl: /^https:\/\/[^\s"'<>]+$/i.test(String(logoUrl || "")) ? String(logoUrl) : null,
    logoWidth: Math.max(60, Math.min(240, Math.round(Number(logoWidth) || 120))),
    style: STYLES.includes(style) ? style : "classic",
  };
}

const PLATFORM_DESIGN = makeDesign({ accent: "#5B3FE0", style: "classic" });
const PLAIN = makeDesign();

/** A store's email design, from its settings (with safe defaults). */
function designFor(store) {
  const saved = store?.settings && typeof store.settings === "object" ? store.settings.emailDesign : null;
  return makeDesign(saved || {});
}

function button(href, label, d = PLAIN) {
  const center = d.style !== "classic";
  return `<table role="presentation" cellpadding="0" cellspacing="0" ${center ? 'align="center" ' : ""}style="margin:24px ${center ? "auto" : "0"} 8px"><tr><td bgcolor="${d.accent}" style="background:${d.accent};border-radius:10px">
  <a href="${esc(href)}" style="display:inline-block;padding:13px 26px;font:600 14px ${FONT};color:${d.onAccent};text-decoration:none">${esc(label)}</a>
</td></tr></table>`;
}

function p(text, style = "") {
  return `<p style="margin:0 0 14px;font:400 15px/1.6 ${FONT};color:${INK};${style}">${text}</p>`;
}

function small(text) {
  return `<p style="margin:16px 0 0;font:400 13px/1.55 ${FONT};color:${MUTED}">${text}</p>`;
}

/** A white icon on a circle in the design's colour. */
function iconBadge(icon, d, center) {
  const src = iconUrl(icon, { dark: d.onAccent === INK });
  if (!src) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" ${center ? 'align="center" ' : ""}style="margin:0 ${center ? "auto" : "0"} 18px"><tr><td width="56" height="56" align="center" valign="middle" bgcolor="${d.accent}" style="width:56px;height:56px;border-radius:28px;background:${d.accent};text-align:center;vertical-align:middle"><img src="${src}" width="28" height="28" alt="" style="display:inline-block;width:28px;height:28px;border:0;vertical-align:middle"></td></tr></table>`;
}

/** Confirmed — Shipped — Delivered, with the steps done so far coloured in. */
function progress(step, d = PLAIN) {
  const labels = ["Confirmed", "Shipped", "Delivered"];
  const cells = labels
    .map((label, i) => {
      const done = i < step;
      return `<td width="33%" style="padding:0 ${i < 2 ? "6px" : "0"} 0 0;vertical-align:top">
  <div style="height:5px;border-radius:3px;background:${done ? d.accent : LINE};font-size:0;line-height:0">&nbsp;</div>
  <p style="margin:8px 0 0;font:${i === step - 1 ? 600 : 400} 12px ${FONT};color:${done ? INK : MUTED}">${label}</p>
</td>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 22px"><tr>${cells}</tr></table>`;
}

/**
 * The shell every email shares. `brand` is the store's name for shopper
 * emails and "Oyklane" for seller emails. The preheader is the grey
 * preview line inbox lists show after the subject. `icon`: a badge at the
 * top (see emails/assets.js); `banner`: an image across the top.
 */
function layout({ brand, preheader = "", body, footer, design, icon, banner }) {
  const d = design || PLAIN;
  const center = d.style !== "classic";
  const logo = (onAccent) =>
    d.logoUrl
      ? `<img src="${esc(d.logoUrl)}" alt="${esc(brand)}" width="${d.logoWidth}" style="display:${center ? "inline-block" : "block"};width:${d.logoWidth}px;max-width:100%;height:auto;border:0">`
      : `<span style="font:700 ${d.style === "banner" ? 22 : 18}px ${FONT};letter-spacing:-0.01em;color:${onAccent ? d.onAccent : INK}">${esc(brand)}</span>`;
  const bannerRow = banner
    ? `<tr><td style="padding:0;font-size:0;line-height:0"><img src="${esc(banner)}" alt="" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:${d.style === "banner" ? "0" : "14px 14px 0 0"}"></td></tr>`
    : "";
  const bandRow =
    d.style === "banner"
      ? `<tr><td align="center" bgcolor="${d.accent}" style="background:${d.accent};padding:26px 28px;border-radius:14px 14px 0 0">${logo(true)}</td></tr>`
      : "";
  const above = d.style === "banner" ? "" : `<tr><td ${center ? 'align="center" ' : ""}style="padding:0 4px 18px">${logo(false)}</td></tr>`;
  const card =
    d.style === "minimal"
      ? `<tr><td style="background:#ffffff;border-top:3px solid ${d.accent};padding:34px 28px${center ? ";text-align:center" : ""}">${iconBadge(icon, d, center)}${body}</td></tr>`
      : `<tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:14px;overflow:hidden;padding:0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${d.style === "banner" ? `${bandRow}${bannerRow}` : bannerRow}
      <tr><td style="padding:32px 28px${center ? ";text-align:center" : ""}">${iconBadge(icon, d, center)}${body}</td></tr>
    </table>
  </td></tr>`;
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(brand)}</title></head>
<body style="margin:0;padding:0;background:${BG}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG}"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    ${above}
    ${card}
    <tr><td ${center ? 'align="center" ' : ""}style="padding:18px 4px 0;font:400 12px/1.6 ${FONT};color:${MUTED}">${footer}</td></tr>
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
  const thumbs = items.some((i) => i.image);
  return items
    .map(
      (item) => `<tr>
  ${
    thumbs
      ? `<td width="56" style="padding:10px 12px 10px 0;border-bottom:1px solid ${LINE};vertical-align:middle">${
          item.image ? `<img src="${esc(item.image)}" alt="" width="48" height="48" style="display:block;width:48px;height:48px;border-radius:8px;object-fit:cover;border:1px solid ${LINE}">` : `<div style="width:48px;height:48px;border-radius:8px;background:${BG}"></div>`
        }</td>`
      : ""
  }
  <td style="padding:10px 0;border-bottom:1px solid ${LINE};font:400 14px/1.45 ${FONT};color:${INK};text-align:left">${esc(item.title)}<span style="color:${MUTED}"> × ${Number(item.quantity)}</span>${
    item.detail || item.properties?.detail ? `<br><span style="font:400 12.5px/1.5 ${FONT};color:${MUTED}">${esc(item.detail || item.properties.detail)}</span>` : ""
  }</td>
  <td align="right" style="padding:10px 0;border-bottom:1px solid ${LINE};font:500 14px ${FONT};color:${INK};white-space:nowrap">${money(item.total ?? item.price * item.quantity, currency)}</td>
</tr>`
    )
    .join("");
}

function summaryRow(label, value, bold = false) {
  const weight = bold ? 600 : 400;
  return `<tr><td style="padding:4px 0;text-align:left;font:${weight} 14px ${FONT};color:${bold ? INK : MUTED}">${label}</td><td align="right" style="padding:4px 0;font:${weight} 14px ${FONT};color:${INK};white-space:nowrap">${value}</td></tr>`;
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
    Number(order.giftCardAmount) > 0 ? summaryRow("Paid with gift card", `−${money(order.giftCardAmount, currency)}`) : "",
    Number(order.giftCardAmount) > 0 && Number(order.total) - Number(order.giftCardAmount) > 0
      ? summaryRow(order.paymentMethod === "cod" ? "To pay on delivery" : "Paid online", money(Number(order.total) - Number(order.giftCardAmount), currency), true)
      : "",
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
  const d = PLATFORM_DESIGN;
  return {
    subject: "Confirm your email for Oyklane",
    html: layout({
      design: d,
      icon: "mail",
      brand: "Oyklane",
      preheader: "One click to confirm this is your email address.",
      body: [
        heading("Confirm your email"),
        p(`Hi ${esc(name)}, thanks for starting your store on Oyklane. Confirm this is your email address so you can always recover your account.`),
        button(url, "Confirm email", d),
        small("This link works for 3 days. If you didn't create an Oyklane account, you can ignore this email."),
      ].join(""),
      footer: PLATFORM_FOOTER,
    }),
  };
}

function passwordReset({ name, url }) {
  const d = PLATFORM_DESIGN;
  return {
    subject: "Reset your Oyklane password",
    html: layout({
      design: d,
      icon: "key",
      brand: "Oyklane",
      preheader: "Use this link to choose a new password. It expires in 30 minutes.",
      body: [
        heading("Reset your password"),
        p(`Hi ${esc(name)}, we received a request to reset the password for your Oyklane account.`),
        button(url, "Choose a new password", d),
        small("This link expires in 30 minutes and works once. If you didn't ask for this, you can ignore this email — your password stays the same."),
      ].join(""),
      footer: PLATFORM_FOOTER,
    }),
  };
}

function passwordChanged({ name, when, ip }) {
  const d = PLATFORM_DESIGN;
  return {
    subject: "Your Oyklane password was changed",
    html: layout({
      design: d,
      icon: "shield",
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
  const d = PLATFORM_DESIGN;
  const currency = order.currency || "INR";
  return {
    subject: `New order #${order.orderNumber} · ${money(order.total, currency)}`,
    html: layout({
      design: d,
      icon: "bag",
      brand: store.name,
      preheader: `${order.shippingName || order.email || "A customer"} placed an order for ${money(order.total, currency)}.`,
      body: [
        heading(`New order #${order.orderNumber}`),
        p(
          `${esc(order.shippingName || order.email || "A customer")} placed an order for <strong>${money(order.total, currency)}</strong> · ${
            order.paymentMethod === "cod" ? "Cash on delivery" : order.paymentMethod === "upi_qr" && order.paymentStatus !== "paid" ? "Paid by UPI — check it arrived" : "Paid online"
          }.`
        ),
        orderSummary(order),
        shippingAddress(order),
        button(adminUrl, "View order", d),
      ].join(""),
      footer: "You get these because new-order alerts are on in Settings ▸ Notifications.",
    }),
  };
}

// ── Rentals app ───────────────────────────────────────────────────

const HANDOVER_TEXT = { delivery: "Delivered to the customer", store_pickup: "Customer picks it up from the store" };
const RETURN_TEXT = { collect: "Collected from the customer", drop_off: "Customer drops it back at the store" };

function rentalDetails(b, currency = "INR") {
  const rows = [
    summaryRow("Item", `${esc(b.title)}${b.quantity > 1 ? ` × ${b.quantity}` : ""}`),
    summaryRow("Dates", esc(b.range)),
    summaryRow("Handover", HANDOVER_TEXT[b.handover] || esc(b.handover)),
    summaryRow("Return", RETURN_TEXT[b.returnMethod] || esc(b.returnMethod)),
    summaryRow("Rent", money(b.rentalTotal, currency)),
    Number(b.deposit) > 0 ? summaryRow("Refundable deposit", money(b.deposit, currency)) : "",
  ].join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;border-top:1px solid ${LINE};padding-top:8px">${rows}</table>`;
}

/** To the seller: a shopper asked to rent something (request mode). */
function rentalRequestAlert({ store, booking, adminUrl }) {
  const d = PLATFORM_DESIGN;
  return {
    subject: `Rental request · ${booking.title} · ${booking.range}`,
    html: layout({
      design: d,
      icon: "bell",
      brand: store.name,
      preheader: `${booking.customerName} wants to rent ${booking.title} (${booking.range}).`,
      body: [
        heading("New rental request"),
        p(`<strong>${esc(booking.customerName)}</strong> (${esc(booking.phone || "")}${booking.email ? ` · ${esc(booking.email)}` : ""}) wants to rent:`),
        rentalDetails(booking, store.currency),
        booking.address ? p(`<span style="color:${MUTED}">Address:</span> ${esc(booking.address)}`) : "",
        booking.note ? p(`<span style="color:${MUTED}">Note:</span> ${esc(booking.note)}`) : "",
        p("Call them to confirm, then mark it confirmed — the dates are held for them from then on."),
        button(adminUrl, "Open the request", d),
      ].join(""),
      footer: "Sent by the Rentals app in your Oyklane store.",
    }),
  };
}

/** To the shopper: their request reached the store / the store confirmed it. */
function rentalRequestUpdate({ store, booking, confirmed = false }) {
  const d = designFor(store);
  return {
    subject: confirmed ? `Your rental is confirmed · ${booking.title}` : `We got your rental request · ${booking.title}`,
    html: layout({
      design: d,
      icon: confirmed ? "check" : "clock",
      brand: store.name,
      preheader: confirmed ? `${booking.range} is booked for you.` : `${store.name} will call you to confirm ${booking.range}.`,
      body: [
        heading(confirmed ? "Your rental is confirmed" : "Request received"),
        p(
          confirmed
            ? `Hi ${esc(booking.customerName || "there")}, ${esc(store.name)} has booked these dates for you.`
            : `Hi ${esc(booking.customerName || "there")}, thanks — ${esc(store.name)} will call you shortly to confirm your booking.`
        ),
        rentalDetails(booking, store.currency),
      ].join(""),
      footer: storeFooter(store),
    }),
  };
}

// ── Shopper emails (sent on the store's behalf) ───────────────────

function orderConfirmation({ store, order, statusUrl }) {
  const d = designFor(store);
  const currency = order.currency || "INR";
  const paymentLine =
    order.paymentMethod === "cod"
      ? `Please keep <strong>${money(order.total, currency)}</strong> ready to pay on delivery.`
      : order.paymentStatus === "paid"
        ? `We've received your payment of <strong>${money(order.total, currency)}</strong>.`
        : order.paymentMethod === "upi_qr"
          ? `We've got your UPI payment of <strong>${money(order.total, currency)}</strong> and the store is confirming it.`
          : "Your payment is being confirmed.";
  return {
    subject: `Order #${order.orderNumber} confirmed`,
    html: layout({
      design: d,
      icon: "check",
      brand: store.name,
      preheader: `Thanks for your order! We'll let you know when it ships.`,
      body: [
        heading(`Thanks for your order, ${esc((order.shippingName || "").split(" ")[0] || "there")}!`),
        progress(1, d),
        p(`Your order <strong>#${order.orderNumber}</strong> is confirmed. ${paymentLine} We'll email you again when it ships.`),
        button(statusUrl, "View your order", d),
        orderSummary(order),
        shippingAddress(order),
      ].join(""),
      footer: storeFooter(store),
    }),
  };
}

function shippingUpdate({ store, order, fulfillment, statusUrl }) {
  const d = designFor(store);
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
      design: d,
      icon: "truck",
      brand: store.name,
      preheader: fulfillment.trackingNumber ? `Tracking number ${fulfillment.trackingNumber}` : "Your order has shipped.",
      body: [
        heading("Your order is on its way"),
        progress(2, d),
        p(`Good news — ${shippedItems.length === (order.items || []).length ? "your order" : "part of your order"} <strong>#${order.orderNumber}</strong> has shipped.`),
        tracking,
        button(fulfillment.trackingUrl || statusUrl, fulfillment.trackingUrl ? "Track your package" : "View your order", d),
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${itemRows(shippedItems, order.currency)}</table>`,
        shippingAddress(order),
      ].join(""),
      footer: storeFooter(store),
    }),
  };
}

function orderDelivered({ store, order, statusUrl }) {
  const d = designFor(store);
  return {
    subject: `Your order #${order.orderNumber} was delivered`,
    html: layout({
      design: d,
      icon: "delivered",
      brand: store.name,
      preheader: "We hope you love it.",
      body: [
        heading("Delivered"),
        progress(3, d),
        p(`Your order <strong>#${order.orderNumber}</strong> has been delivered. We hope you love it!`),
        p("If something isn't right, you can request a return from your order page.", `color:${MUTED}`),
        button(statusUrl, "View your order", d),
      ].join(""),
      footer: storeFooter(store),
    }),
  };
}

function orderCancelled({ store, order, statusUrl, reason }) {
  const d = designFor(store);
  const currency = order.currency || "INR";
  const refundLine =
    order.paymentMethod !== "cod" && ["paid", "partially_refunded", "refunded"].includes(order.paymentStatus)
      ? "Any payment you made will be refunded to your original payment method within 5–7 business days."
      : "You won't be charged.";
  return {
    subject: `Order #${order.orderNumber} has been cancelled`,
    html: layout({
      design: d,
      icon: "cancelled",
      brand: store.name,
      preheader: `Your order for ${money(order.total, currency)} was cancelled.`,
      body: [
        heading("Your order was cancelled"),
        p(`Order <strong>#${order.orderNumber}</strong> has been cancelled${reason ? ` (${esc(reason)})` : ""}. ${refundLine}`),
        button(statusUrl, "View order", d),
      ].join(""),
      footer: storeFooter(store),
    }),
  };
}

function refundIssued({ store, order, refund, statusUrl }) {
  const d = designFor(store);
  const currency = order.currency || "INR";
  const toCard = Number(refund.toGiftCard || 0);
  const rest = Number(refund.amount) - toCard;
  const card = `your gift card${refund.giftCardLast4 ? ` ending ${esc(refund.giftCardLast4)}` : ""}`;
  const restHow =
    refund.method === "razorpay"
      ? "on its way back to your original payment method and usually shows up within 5–7 business days"
      : `being paid back to you directly by ${esc(store.name)}`;
  const how =
    toCard > 0 && rest > 0
      ? `${money(toCard, currency)} is back on ${card}, ready to spend, and ${money(rest, currency)} is ${restHow}.`
      : toCard > 0
        ? `It's back on ${card}, ready to spend.`
        : refund.method === "razorpay"
          ? "It's on its way back to your original payment method and usually shows up within 5–7 business days."
          : `${esc(store.name)} will pay this back to you directly.`;
  return {
    subject: `Refund of ${money(refund.amount, currency)} for order #${order.orderNumber}`,
    html: layout({
      design: d,
      icon: "refund",
      brand: store.name,
      preheader: `A refund of ${money(refund.amount, currency)} has been issued.`,
      body: [
        heading("Your refund has been issued"),
        p(`We've refunded <strong>${money(refund.amount, currency)}</strong> for order <strong>#${order.orderNumber}</strong>${refund.reason ? ` (${esc(refund.reason)})` : ""}. ${how}`),
        button(statusUrl, "View order", d),
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
  const d = designFor(store);
  const [title, line] = RETURN_COPY[returnRequest.status] || RETURN_COPY.requested;
  return {
    subject: `${title} · order #${order.orderNumber}`,
    html: layout({
      design: d,
      icon: "return",
      brand: store.name,
      preheader: line,
      body: [
        heading(title),
        p(`${line}${returnRequest.merchantNote ? `<br><br><span style="color:${MUTED}">Note from ${esc(store.name)}:</span> ${esc(returnRequest.merchantNote)}` : ""}`),
        button(statusUrl, "View order", d),
      ].join(""),
      footer: storeFooter(store),
    }),
  };
}

function signInCode({ store, code }) {
  const d = designFor(store);
  const digits = String(code)
    .split("")
    .map((d) => `<td style="padding:0 3px"><div style="width:40px;height:52px;line-height:52px;border:1px solid ${LINE};border-radius:10px;text-align:center;font:600 24px ${FONT};color:${INK}">${esc(d)}</div></td>`)
    .join("");
  return {
    subject: `${code} is your ${store.name} sign-in code`,
    html: layout({
      design: d,
      icon: "key",
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
  const d = designFor(store);
  const currency = store.currency || "INR";
  return {
    subject: `You left something in your cart at ${store.name}`,
    html: layout({
      design: d,
      icon: "cart",
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
        button(recoverUrl, "Complete your order", d),
      ].join(""),
      footer: `${storeFooter(store)}<br>You got this because you started checking out at ${esc(store.name)}.`,
    }),
  };
}

function giftCardIssued({ store, code, amount, recipientName, message, expiresAt, shopUrl }) {
  const d = designFor(store);
  const currency = store.currency || "INR";
  const expiry = expiresAt
    ? `Use it by ${new Date(expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })}.`
    : "It doesn't expire.";
  return {
    subject: `You've received a ${money(amount, currency)} gift card from ${store.name}`,
    html: layout({
      design: d,
      icon: "gift",
      brand: store.name,
      preheader: `A ${money(amount, currency)} gift card to spend at ${store.name}.`,
      body: [
        heading(`${recipientName ? `${esc(recipientName.split(" ")[0])}, here's` : "Here's"} a gift for you`),
        p(`You've received a <strong>${money(amount, currency)}</strong> gift card to spend at ${esc(store.name)}.`),
        message ? `<p style="margin:0 0 18px;padding:14px 16px;border-left:3px solid ${d.accent};background:${BG};font:italic 400 15px/1.6 ${FONT};color:${INK};text-align:left">${esc(message)}</p>` : "",
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 4px"><tr><td bgcolor="${d.accent}" style="background:${d.accent};border-radius:14px;padding:22px;text-align:center">
  <p style="margin:0 0 6px;font:600 11px ${FONT};letter-spacing:.14em;text-transform:uppercase;color:${d.onAccent};opacity:.75">Gift card code · ${money(amount, currency)}</p>
  <p style="margin:0;font:600 22px ${FONT};letter-spacing:.12em;color:${d.onAccent}">${esc(code)}</p>
</td></tr></table>`,
        small(`Enter the code in your cart at checkout. ${expiry} Keep this email safe — anyone with the code can spend it.`),
        button(shopUrl, "Start shopping", d),
      ].join(""),
      footer: storeFooter(store),
    }),
  };
}

/** A billing notice to a seller (billing/notifications.js): heading, a
 * few lines, an optional amount table and a button to the billing page. */
function billingNotice({ storeName, title, lines = [], rows = [], cta, ctaUrl }) {
  const d = PLATFORM_DESIGN;
  const table = rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 10px;border-top:1px solid ${LINE}">${rows
        .map(([k, v, bold]) => summaryRow(esc(k), esc(v), bold))
        .join("")}</table>`
    : "";
  return {
    subject: `${title} — ${storeName}`,
    html: layout({
      design: d,
      icon: "bell",
      brand: "Oyklane",
      preheader: lines[0] || title,
      body: `${heading(esc(title))}${lines.map((l) => p(esc(l))).join("")}${table}${cta && ctaUrl ? button(ctaUrl, cta, d) : ""}`,
      footer: `You're receiving this because you run ${esc(storeName)} on Oyklane. Billing questions? Reply to this email.`,
    }),
  };
}

/**
 * An email a seller wrote in the Flow app. `text` is their words with
 * {{placeholders}}: it's escaped first, then each placeholder becomes its
 * (escaped) value — so nothing a shopper typed, like their name, can add
 * markup. Blank lines start a new paragraph.
 */
function fillText(text, vars, { discountCode, accent = MUTED } = {}) {
  return esc(text).replace(/\{\{\s*([a-z_.]+)\s*\}\}/g, (all, key) => {
    if (key === "discount_code") {
      return discountCode
        ? `<strong style="display:inline-block;padding:3px 10px;border:1.5px dashed ${accent};border-radius:6px;font:700 14px ${FONT};letter-spacing:0.06em">${esc(discountCode)}</strong>`
        : "";
    }
    return key in vars ? esc(vars[key]) : "";
  });
}

function flowEmail({ store, vars, subject, heading: title, text, discountCode, buttonLabel, buttonUrl, order, cartItems, cartTotal, currency, icon, banner }) {
  const d = designFor(store);
  const paragraphs = String(text || "")
    .split(/\n\s*\n/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => p(fillText(para, vars, { discountCode, accent: d.accent }).replace(/\n/g, "<br>")))
    .join("");
  const summary = order
    ? orderSummary(order)
    : cartItems?.length
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px">${itemRows(cartItems, currency)}</table>${
          cartTotal != null ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">${summaryRow("Total", money(cartTotal, currency), true)}</table>` : ""
        }`
      : "";
  const plainSubject = String(subject || "").replace(/\{\{\s*([a-z_.]+)\s*\}\}/g, (all, key) => (key === "discount_code" ? discountCode || "" : vars[key] ?? ""));
  return {
    subject: plainSubject.replace(/\s+/g, " ").trim(),
    html: layout({
      brand: store.name,
      preheader: String(text || "").replace(/\{\{[^}]*\}\}/g, "").split("\n").find((l) => l.trim().length > 20)?.trim().slice(0, 120) || "",
      design: d,
      icon: icon || null,
      banner: /^https:\/\//i.test(String(banner || "")) ? banner : null,
      body: [title ? heading(fillText(title, vars, { discountCode, accent: d.accent })) : "", paragraphs, buttonLabel && buttonUrl ? button(buttonUrl, buttonLabel, d) : "", summary].join(""),
      footer: storeFooter(store),
    }),
  };
}

/** A note to the store owner from one of their flows. */
function flowOwnerNote({ store, vars, subject, text, adminUrl }) {
  const d = PLATFORM_DESIGN;
  const plainSubject = String(subject || "").replace(/\{\{\s*([a-z_.]+)\s*\}\}/g, (all, key) => vars[key] ?? "");
  const body = String(text || "")
    .split(/\n\s*\n/)
    .filter((x) => x.trim())
    .map((para) => p(fillText(para.trim(), vars).replace(/\n/g, "<br>")))
    .join("");
  return {
    subject: plainSubject.trim(),
    html: layout({
      design: d,
      icon: "bell",
      brand: "Oyklane",
      preheader: plainSubject,
      body: `${heading(esc(plainSubject))}${body}${adminUrl ? button(adminUrl, "Open in your admin", d) : ""}`,
      footer: `Sent by a flow in ${esc(store.name)}'s Flow app. Turn it off in Apps ▸ Flow.`,
    }),
  };
}

/** Seller support: a ticket was opened, answered, or replied to. `message`
 * is plain text (a seller's or the team's words) shown as a quoted block. */
function supportTicketEmail({ title, intro, message, author, cta, ctaUrl, footer, extra = "" }) {
  const d = PLATFORM_DESIGN;
  const quoted = message
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 10px"><tr><td style="border-left:3px solid ${LINE};padding:4px 0 4px 14px">
  ${author ? `<p style="margin:0 0 6px;font:600 13px ${FONT};color:${MUTED}">${esc(author)}</p>` : ""}
  ${String(message)
    .split(/\n\s*\n/)
    .filter((x) => x.trim())
    .map((para) => p(esc(para.trim()).replace(/\n/g, "<br>"), "margin-bottom:10px"))
    .join("")}
</td></tr></table>`
    : "";
  return {
    subject: title,
    html: layout({
      design: d,
      icon: "mail",
      brand: "Oyklane Support",
      preheader: intro || "",
      body: `${heading(esc(title))}${intro ? p(esc(intro)) : ""}${quoted}${extra}${cta && ctaUrl ? button(ctaUrl, cta, d) : ""}`,
      footer: footer || "Oyklane Support — reply from your dashboard's Help page, or just reply to this email.",
    }),
  };
}

/** Plain text (a shopper's or a seller's words) as paragraphs. */
function textBlock(text, style = "") {
  return String(text || "")
    .split(/\n\s*\n/)
    .filter((x) => x.trim())
    .map((para) => p(esc(para.trim()).replace(/\n/g, "<br>"), style))
    .join("");
}

const quoteBlock = (text, label = "") =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 14px"><tr><td style="border-left:3px solid ${LINE};padding:4px 0 4px 14px">${label ? `<p style="margin:0 0 6px;font:600 13px ${FONT};color:${MUTED}">${label}</p>` : ""}${textBlock(text, "margin-bottom:10px")}</td></tr></table>`;

/** To the seller: a shopper wrote from the Contact page. Replying to this
 * email reaches the shopper (reply-to is their address). */
function contactMessageAlert({ store, message, adminUrl }) {
  const d = PLATFORM_DESIGN;
  const who = [esc(message.email), message.phone ? esc(message.phone) : ""].filter(Boolean).join(" · ");
  return {
    subject: `New message from ${message.name} · ${store.name}`,
    html: layout({
      design: d,
      icon: "mail",
      brand: store.name,
      preheader: String(message.message).slice(0, 140),
      body: [
        heading("New customer query"),
        p(`<strong>${esc(message.name)}</strong><br><span style="color:${MUTED}">${who}</span>`),
        quoteBlock(message.message),
        p("Answer from Customers ▸ Queries in your admin — or simply reply to this email."),
        button(adminUrl, "Open the message", d),
      ].join(""),
      footer: "Sent from the Contact page of your Oyklane store.",
    }),
  };
}

/** To the shopper: the store's answer to their message. */
function contactReply({ store, message, reply }) {
  const d = designFor(store);
  const when = new Date(message.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return {
    subject: `Re: your message to ${store.name}`,
    html: layout({
      design: d,
      icon: "mail",
      brand: store.name,
      preheader: reply.slice(0, 140),
      body: [p(`Hi ${esc(message.name || "there")},`), textBlock(reply), quoteBlock(message.message, `Your message · ${esc(when)}`)].join(""),
      footer: `Reply to this email to write back to ${esc(store.name)}.`,
    }),
  };
}

/** To the seller: a shopper reports paying an order by UPI QR. */
function upiPaymentAlert({ store, payment, adminUrl }) {
  const d = PLATFORM_DESIGN;
  const amount = money(payment.amount, payment.currency || "INR");
  return {
    subject: `Check UPI payment ${amount} · order #${payment.orderNumber}`,
    html: layout({
      design: d,
      icon: "bell",
      brand: store.name,
      preheader: `${payment.buyerName || "A customer"} says they paid ${amount} to ${payment.payeeVpa}.`,
      body: [
        heading("A UPI payment to check"),
        p(`<strong>${esc(payment.buyerName || payment.buyerEmail || "A customer")}</strong> says they paid <strong>${amount}</strong> for order #${payment.orderNumber} to <strong>${esc(payment.payeeVpa)}</strong>.`),
        p(`UPI reference (UTR): <strong style="font-family:monospace;letter-spacing:.04em">${esc(payment.utr || "")}</strong>`),
        p("Open your UPI or bank app, find this reference and amount, then press <strong>Received</strong> — the order becomes paid. If it never arrived, press <strong>Not received</strong> to cancel the order."),
        button(adminUrl, "Check the payment", d),
      ].join(""),
      footer: "Sent by the UPI QR app in your Oyklane store.",
    }),
  };
}

module.exports = {
  rentalRequestAlert,
  upiPaymentAlert,
  contactMessageAlert,
  contactReply,
  rentalRequestUpdate,
  designFor,
  makeDesign,
  STYLES,
  supportTicketEmail,
  flowEmail,
  flowOwnerNote,
  billingNotice,
  giftCardIssued,
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

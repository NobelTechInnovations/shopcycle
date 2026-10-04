const { env } = require("../../config/env");
const { sendEmail } = require("../../lib/mailer");
const templates = require("../../emails/templates");
const { storeInboxes } = require("../orders/notify");
const { serialize } = require("./service");

const adminUrl = (booking) => `${env.ADMIN_ORIGIN.replace(/\/$/, "")}/admin/apps/rentals?booking=${booking.id}`;

/** A shopper sent a booking request: tell the seller, and the shopper. */
async function requestMade(prisma, store, booking, log) {
  const b = serialize(booking);
  const alert = templates.rentalRequestAlert({ store, booking: b, adminUrl: adminUrl(b) });
  for (const inbox of await storeInboxes(prisma, store)) {
    await sendEmail(prisma, { to: inbox, ...alert, template: "rental_request_alert", storeId: store.id, refType: "rental", refId: b.id, log });
  }
  if (b.email) {
    const mail = templates.rentalRequestUpdate({ store, booking: b });
    await sendEmail(prisma, { to: b.email, ...mail, template: "rental_request_received", storeId: store.id, fromName: store.name, replyTo: store.supportEmail || undefined, refType: "rental", refId: b.id, log });
  }
}

/** The seller confirmed a request: tell the shopper (when they gave an email). */
async function requestConfirmed(prisma, store, booking, log) {
  if (!booking.email || booking.source !== "request") return;
  const b = booking.range ? booking : serialize(booking);
  const mail = templates.rentalRequestUpdate({ store, booking: b, confirmed: true });
  await sendEmail(prisma, { to: b.email, ...mail, template: "rental_confirmed", storeId: store.id, fromName: store.name, replyTo: store.supportEmail || undefined, refType: "rental", refId: b.id, log });
}

module.exports = { requestMade, requestConfirmed };

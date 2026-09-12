/** Digits only, no leading "+" — the shape both the WhatsApp Cloud API
 * (see whatsapp/service.js) and cross-store customer matching (see
 * platform-customers/service.js) need a phone number in. Doesn't attempt
 * to validate or add a missing country code — a customer typing just
 * their 10-digit number is a real, common case this can't fix on its own,
 * so it's normalized as-is rather than guessed at. */
function normalizePhone(phone) {
  return (phone || "").replace(/[^\d]/g, "");
}

module.exports = { normalizePhone };

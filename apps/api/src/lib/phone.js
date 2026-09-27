/** Digits only, no leading "+" — the shape both the WhatsApp Cloud API
 * (see whatsapp/service.js) and cross-store customer matching (see
 * platform-customers/service.js) need a phone number in. Doesn't attempt
 * to validate or add a missing country code — a customer typing just
 * their 10-digit number is a real, common case this can't fix on its own,
 * so it's normalized as-is rather than guessed at. */
function normalizePhone(phone) {
  return (phone || "").replace(/[^\d]/g, "");
}

/** A phone number for sending a code to: E.164 digits without "+", or
 * null. A bare 10-digit number (or one with a leading 0) is taken as
 * Indian; anything else must already carry its country code. */
function toE164(phone, defaultCountry = "91") {
  const raw = String(phone || "").trim();
  let d = raw.replace(/[^\d]/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  else if (!raw.startsWith("+")) {
    if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
    if (d.length === 10) d = `${defaultCountry}${d}`;
  }
  return /^[1-9]\d{7,14}$/.test(d) ? d : null;
}

module.exports = { normalizePhone, toE164 };

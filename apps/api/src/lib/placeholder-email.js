/**
 * Shoppers who sign in with only their phone (Phone Login) have no email
 * yet, but every customer needs one (unique per store). They get a stand-in
 * on the reserved ".invalid" domain — it can never receive mail — that's
 * hidden wherever an email is shown, never mailed, and replaced by the
 * first real email they type at checkout.
 */
const DOMAIN = "phone.oyklane.invalid";

const placeholderEmail = (phoneDigits) => `p${String(phoneDigits).replace(/\D/g, "")}@${DOMAIN}`;
const isPlaceholderEmail = (email) => String(email || "").toLowerCase().endsWith(`@${DOMAIN}`);
/** The email to show or send to — "" for a stand-in. */
const realEmail = (email) => (isPlaceholderEmail(email) ? "" : email || "");

module.exports = { placeholderEmail, isPlaceholderEmail, realEmail };

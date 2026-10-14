/** A shopper who signed up with only their phone (Phone Login) has a
 * stand-in email that's never shown (apps/api/src/lib/placeholder-email.js). */
export const isPhoneOnlyEmail = (email) => String(email || "").toLowerCase().endsWith("@phone.oyklane.invalid");

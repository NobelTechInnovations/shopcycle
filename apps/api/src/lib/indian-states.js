/**
 * Indian states and union territories with their GST state codes (the
 * first two digits of a GSTIN) and common abbreviations. Checkout's state
 * field is free text, so "MH", "Maharashtra" and "maharashtra" all need to
 * resolve to the same place of supply on a GST invoice.
 */
const STATES = [
  ["01", "Jammu and Kashmir", ["JK", "J&K"]],
  ["02", "Himachal Pradesh", ["HP"]],
  ["03", "Punjab", ["PB"]],
  ["04", "Chandigarh", ["CH"]],
  ["05", "Uttarakhand", ["UK", "UT", "Uttaranchal"]],
  ["06", "Haryana", ["HR"]],
  ["07", "Delhi", ["DL", "New Delhi", "NCT of Delhi"]],
  ["08", "Rajasthan", ["RJ"]],
  ["09", "Uttar Pradesh", ["UP"]],
  ["10", "Bihar", ["BR"]],
  ["11", "Sikkim", ["SK"]],
  ["12", "Arunachal Pradesh", ["AR"]],
  ["13", "Nagaland", ["NL"]],
  ["14", "Manipur", ["MN"]],
  ["15", "Mizoram", ["MZ"]],
  ["16", "Tripura", ["TR"]],
  ["17", "Meghalaya", ["ML"]],
  ["18", "Assam", ["AS"]],
  ["19", "West Bengal", ["WB"]],
  ["20", "Jharkhand", ["JH"]],
  ["21", "Odisha", ["OD", "OR", "Orissa"]],
  ["22", "Chhattisgarh", ["CG", "CT"]],
  ["23", "Madhya Pradesh", ["MP"]],
  ["24", "Gujarat", ["GJ"]],
  ["26", "Dadra and Nagar Haveli and Daman and Diu", ["DN", "DD", "DH", "Daman and Diu", "Dadra and Nagar Haveli"]],
  ["27", "Maharashtra", ["MH"]],
  ["29", "Karnataka", ["KA"]],
  ["30", "Goa", ["GA"]],
  ["31", "Lakshadweep", ["LD"]],
  ["32", "Kerala", ["KL"]],
  ["33", "Tamil Nadu", ["TN"]],
  ["34", "Puducherry", ["PY", "Pondicherry"]],
  ["35", "Andaman and Nicobar Islands", ["AN"]],
  ["36", "Telangana", ["TG", "TS"]],
  ["37", "Andhra Pradesh", ["AP"]],
  ["38", "Ladakh", ["LA"]],
];

const key = (s) => String(s || "").trim().toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();

const LOOKUP = new Map();
for (const [code, name, aliases] of STATES) {
  const entry = { code, name };
  LOOKUP.set(key(name), entry);
  LOOKUP.set(code, entry);
  for (const a of aliases) LOOKUP.set(key(a), entry);
}

/** { code, name } for anything that names an Indian state, else null. */
function resolveState(input) {
  if (!input) return null;
  return LOOKUP.get(key(input)) || null;
}

/** The state a GSTIN is registered in (its first two digits). */
function stateFromGstin(gstin) {
  return /^\d{2}/.test(String(gstin || "")) ? LOOKUP.get(String(gstin).slice(0, 2)) || null : null;
}

module.exports = { resolveState, stateFromGstin, INDIAN_STATES: STATES.map(([code, name]) => ({ code, name })) };

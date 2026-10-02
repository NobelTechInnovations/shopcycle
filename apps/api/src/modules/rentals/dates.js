/**
 * Rental days are calendar days in India, kept as "YYYY-MM-DD" strings
 * (stored in @db.Date columns). Never a time of day: "12 Oct" is the same
 * day for the seller, the shopper and the server.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function isDay(value) {
  if (!ISO.test(String(value || ""))) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Today in India. */
function today(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const toDate = (day) => new Date(`${day}T00:00:00.000Z`);
const fromDate = (date) => new Date(date).toISOString().slice(0, 10);

function addDays(day, n) {
  return fromDate(toDate(day).getTime() + n * DAY_MS);
}

/** Days from `a` to `b`, both included: 12 → 14 Oct is 3. */
function span(a, b) {
  return Math.round((toDate(b) - toDate(a)) / DAY_MS) + 1;
}

/** Every day from a to b, both included. */
function eachDay(a, b) {
  const out = [];
  for (let d = a; d <= b && out.length < 800; d = addDays(d, 1)) out.push(d);
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Sat, 12 Oct". */
function label(day, { weekday = true } = {}) {
  const d = toDate(day);
  const text = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return weekday ? `${WEEKDAYS[d.getUTCDay()]}, ${text}` : text;
}

/** "12 Oct → 14 Oct (3 days)". */
function rangeLabel(start, end) {
  const n = span(start, end);
  return `${label(start, { weekday: false })} → ${label(end, { weekday: false })} (${n} day${n === 1 ? "" : "s"})`;
}

module.exports = { DAY_MS, isDay, today, toDate, fromDate, addDays, span, eachDay, label, rangeLabel };

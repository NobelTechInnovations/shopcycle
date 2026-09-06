// Modern browsers expose the IANA timezone database directly — no need to
// hand-maintain a list. Falls back to a short common list on older engines.
const FALLBACK = [
  "UTC",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
];

export function getTimezoneOptions() {
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : FALLBACK;
  return zones.map((tz) => ({ value: tz, label: tz.replace(/_/g, " ") }));
}

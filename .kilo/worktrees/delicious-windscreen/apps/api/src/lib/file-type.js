/**
 * Identifies an image from its leading bytes ("magic numbers") instead of
 * trusting the browser-supplied Content-Type or the uploader's filename —
 * both are attacker-controlled. The returned `ext` is what the file is
 * stored under, so a file can never be saved with an extension (".html",
 * ".svg", ".js") that would make the static server hand it to a browser as
 * something executable.
 *
 * SVG is deliberately absent: it's XML that can carry <script>, and it's
 * served from the API's own origin — the one holding the session cookie.
 */
const SIGNATURES = [
  { mime: "image/jpeg", ext: ".jpg", test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: "image/png",
    ext: ".png",
    test: (b) =>
      b.length > 8 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    mime: "image/gif",
    ext: ".gif",
    test: (b) => b.length > 6 && b.toString("ascii", 0, 6).match(/^GIF8[79]a$/) !== null,
  },
  {
    mime: "image/webp",
    ext: ".webp",
    test: (b) => b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP",
  },
];

/** Returns { mime, ext } for a supported image, or null for anything else. */
function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  const match = SIGNATURES.find((s) => s.test(buffer));
  return match ? { mime: match.mime, ext: match.ext } : null;
}

module.exports = { detectImageType };

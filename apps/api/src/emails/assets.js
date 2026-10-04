const fs = require("fs");
const path = require("path");
const { env } = require("../config/env");

/**
 * Pictures inside emails. Email apps don't show SVG, so the icons are
 * white PNGs (Lucide icons, ISC licence, 96px for sharp screens) placed on
 * a circle in the store's colour — the colour is the table cell's, so one
 * file serves every store. Served from the API, cached for a year.
 */
const DIR = path.join(__dirname, "..", "..", "assets", "email-icons");
// "truck.png" (white) and "truck-dark.png" (for light-coloured circles).
const ICONS = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".png"))
  .map((f) => f.slice(0, -4));
const files = new Map(ICONS.map((name) => [name, fs.readFileSync(path.join(DIR, `${name}.png`))]));

/** The icons a seller can pick for a Flow email, in the picker's order. */
const ICON_CHOICES = ["sparkles", "gift", "heart", "star", "percent", "bag", "cart", "truck", "delivered", "party", "bell", "clock", "mail", "shield"].filter((n) => files.has(n));

/** The icon's address; `dark` for a light-coloured circle. */
function iconUrl(name, { dark = false } = {}) {
  const file = dark && files.has(`${name}-dark`) ? `${name}-dark` : name;
  return files.has(file) ? `${env.API_PUBLIC_URL.replace(/\/$/, "")}/api/email-assets/icons/${file}.png` : null;
}

async function emailAssetRoutes(fastify) {
  fastify.get("/icons/:file", async (request, reply) => {
    const name = String(request.params.file || "").replace(/\.png$/, "");
    const png = files.get(name);
    if (!png) return reply.code(404).send({ error: "Not found" });
    reply.header("content-type", "image/png");
    reply.header("cache-control", "public, max-age=31536000, immutable");
    return reply.send(png);
  });
}

module.exports = { ICONS, ICON_CHOICES, iconUrl, emailAssetRoutes };

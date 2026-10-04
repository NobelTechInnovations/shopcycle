const path = require("path");

// apps/api/src/config -> repo root is 4 levels up
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const THEMES_ROOT = path.join(REPO_ROOT, "themes");
const UPLOADS_ROOT = path.join(REPO_ROOT, "apps", "api", "uploads");

// A fresh server (a new deploy) has no uploads folder yet — git ignores it.
require("fs").mkdirSync(UPLOADS_ROOT, { recursive: true });

module.exports = { REPO_ROOT, THEMES_ROOT, UPLOADS_ROOT };

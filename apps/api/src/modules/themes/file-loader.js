const fs = require("fs/promises");
const path = require("path");

const EXT_TO_TYPE = {
  ".liquid": "liquid",
  ".json": "json",
  ".css": "css",
  ".js": "js",
  ".txt": "text",
};

/** Recursively reads a master theme package directory into a flat list of
 * { path, fileType, content } — `path` uses forward slashes regardless of
 * OS so it matches the "sections/hero.liquid" style paths used everywhere
 * else (schema blocks, template JSON, the future code editor's file tree). */
async function loadThemePackage(themeDir) {
  const files = [];

  async function walk(dir, prefix) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(abs, rel);
      } else {
        const ext = path.extname(entry.name);
        const fileType = EXT_TO_TYPE[ext] || "text";
        const content = await fs.readFile(abs, "utf8");
        files.push({ path: rel, fileType, content });
      }
    }
  }

  await walk(themeDir, "");
  return files;
}

module.exports = { loadThemePackage };

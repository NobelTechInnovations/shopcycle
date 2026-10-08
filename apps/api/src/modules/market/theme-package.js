const { unzipSync, strFromU8 } = require("fflate");
const { HttpError } = require("@shopcycle/utils");
const { validateThemeFileContent } = require("@shopcycle/theme-engine");

/**
 * A developer's theme upload: a .zip of the theme folder (layout/,
 * templates/, sections/, snippets/, assets/, config/, locales/). Only text
 * files of the kinds a theme is made of are accepted; every Liquid and
 * JSON file must parse. Images go in as listing screenshots, or are
 * linked by URL from the theme.
 */

const DIRS = new Set(["layout", "templates", "sections", "snippets", "assets", "config", "locales"]);
const TYPES = { liquid: "liquid", json: "json", css: "css", js: "js", svg: "text", txt: "text" };
const REQUIRED = ["layout/theme.liquid", "templates/index.json", "config/settings_schema.json", "config/settings_data.json"];
const MAX_FILES = 600;
const MAX_FILE = 512 * 1024;
const MAX_TOTAL = 6 * 1024 * 1024;

function readZip(buffer) {
  let entries;
  try {
    // Sizes are checked before anything is inflated (zip bombs).
    let total = 0;
    entries = unzipSync(new Uint8Array(buffer), {
      filter: (f) => {
        if (f.name.endsWith("/")) return false;
        if (f.originalSize > MAX_FILE) throw new HttpError(400, `${f.name} is too big (max 512 KB a file).`);
        total += f.originalSize;
        if (total > MAX_TOTAL) throw new HttpError(400, "The theme is too big (max 6 MB unzipped).");
        return true;
      },
    });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, "That isn't a zip file we can open. Zip the theme folder and upload the .zip.");
  }
  const names = Object.keys(entries).filter((n) => !/(^|\/)(__MACOSX|\.DS_Store|\.git)(\/|$)/.test(n));
  if (names.length > MAX_FILES) throw new HttpError(400, `Too many files (max ${MAX_FILES}).`);
  // A zip of the folder itself has one wrapper directory — drop it.
  const firstParts = new Set(names.map((n) => n.split("/")[0]));
  const wrapper = firstParts.size === 1 && !DIRS.has([...firstParts][0]) ? `${[...firstParts][0]}/` : "";
  return names.map((n) => ({ path: n.slice(wrapper.length), bytes: entries[n] }));
}

/** Zip → [{ path, fileType, content }], or a 400 listing what's wrong. */
function parseThemeZip(buffer) {
  const problems = [];
  const files = [];
  for (const { path, bytes } of readZip(buffer)) {
    if (!path || path.includes("..") || path.startsWith("/") || path.includes("\\")) {
      problems.push(`${path || "(empty name)"}: not allowed`);
      continue;
    }
    const [dir] = path.split("/");
    const ext = path.split(".").pop().toLowerCase();
    if (!DIRS.has(dir)) {
      problems.push(`${path}: themes only have layout/, templates/, sections/, snippets/, assets/, config/ and locales/`);
      continue;
    }
    if (!TYPES[ext]) {
      problems.push(`${path}: .${ext} files aren't accepted (Liquid, JSON, CSS, JS, SVG, TXT only — add images as screenshots or by URL)`);
      continue;
    }
    const content = strFromU8(bytes);
    if (content.includes("\u0000")) {
      problems.push(`${path}: not a text file`);
      continue;
    }
    if (ext === "liquid" || ext === "json") {
      const check = validateThemeFileContent(path, content);
      if (!check.valid) problems.push(`${path}: ${check.error}`);
    }
    files.push({ path, fileType: TYPES[ext], content });
  }
  for (const need of REQUIRED) if (!files.some((f) => f.path === need)) problems.push(`${need} is missing`);
  if (problems.length) {
    const err = new HttpError(400, `The theme has ${problems.length} problem${problems.length === 1 ? "" : "s"}: ${problems.slice(0, 8).join("; ")}${problems.length > 8 ? "; …" : ""}`);
    err.details = problems;
    throw err;
  }
  return { files, size: files.reduce((n, f) => n + Buffer.byteLength(f.content), 0) };
}

/** The theme's starting settings (config/settings_data.json). */
function settingsDataOf(files) {
  try {
    return JSON.parse(files.find((f) => f.path === "config/settings_data.json")?.content || "{}");
  } catch {
    return {};
  }
}

module.exports = { parseThemeZip, settingsDataOf, REQUIRED };

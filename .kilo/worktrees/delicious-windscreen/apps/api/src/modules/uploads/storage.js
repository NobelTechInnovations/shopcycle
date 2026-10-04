const crypto = require("crypto");
const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");

/**
 * Where uploaded images live. "database" keeps the bytes in the File row
 * (service.js). ImageKit and Cloudinary are CDNs: the browser uploads to
 * them directly with a short-lived signature from `sign()`, then the API
 * checks the result with the provider (`verify()`) before recording it —
 * the file itself never passes through the API.
 */
const MAX_SIZE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const FORMAT_MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

function storageProvider() {
  const imagekit = Boolean(env.IMAGEKIT_PRIVATE_KEY && env.IMAGEKIT_PUBLIC_KEY && env.IMAGEKIT_URL_ENDPOINT);
  const cloudinary = Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
  const wanted = env.MEDIA_STORAGE || (imagekit ? "imagekit" : cloudinary ? "cloudinary" : "database");
  if (wanted === "imagekit" && imagekit) return "imagekit";
  if (wanted === "cloudinary" && cloudinary) return "cloudinary";
  return "database";
}

async function call(url, { method = "GET", headers = {}, body } = {}) {
  const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}
  return { ok: res.ok, status: res.status, data, text };
}

function checkImage({ mime, size }) {
  if (!ALLOWED_MIME.includes(mime)) return "Unsupported file. Upload a JPEG, PNG, WebP, or GIF image.";
  if (!(size > 0) || size > MAX_SIZE_BYTES) return "File is too large (max 8MB).";
  return null;
}

const imagekit = {
  folder: (storeId) => `${env.IMAGEKIT_FOLDER.replace(/\/+$/, "")}/${storeId}`,
  auth: () => `Basic ${Buffer.from(`${env.IMAGEKIT_PRIVATE_KEY}:`).toString("base64")}`,

  sign(storeId) {
    const token = crypto.randomUUID();
    const expire = Math.floor(Date.now() / 1000) + 30 * 60;
    const signature = crypto.createHmac("sha1", env.IMAGEKIT_PRIVATE_KEY).update(`${token}${expire}`).digest("hex");
    return {
      uploadUrl: env.IMAGEKIT_UPLOAD_URL,
      fileField: "file",
      fields: { publicKey: env.IMAGEKIT_PUBLIC_KEY, token, expire: String(expire), signature, folder: imagekit.folder(storeId), useUniqueFileName: "true" },
    };
  },

  /** { url, mime, size, width, height } of an upload in this store's folder. */
  async verify(storeId, fileId) {
    const r = await call(`${env.IMAGEKIT_API_URL}/files/${encodeURIComponent(fileId)}/details`, { headers: { authorization: imagekit.auth() } });
    if (!r.ok || !r.data?.fileId) throw new HttpError(404, "We couldn't find that upload. Please try again.");
    const f = r.data;
    if (!String(f.filePath || "").startsWith(`${imagekit.folder(storeId)}/`)) throw new HttpError(404, "We couldn't find that upload. Please try again.");
    return { providerFileId: f.fileId, name: f.name, url: f.url, mime: f.mime || (f.fileType === "image" ? FORMAT_MIME[String(f.name).split(".").pop().toLowerCase()] : null), size: f.size, width: f.width || null, height: f.height || null };
  },

  async remove(fileId) {
    await call(`${env.IMAGEKIT_API_URL}/files/${encodeURIComponent(fileId)}`, { method: "DELETE", headers: { authorization: imagekit.auth() } });
  },

  async uploadBuffer(storeId, { buffer, filename, mime }) {
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: mime }), filename);
    form.append("fileName", filename);
    form.append("folder", imagekit.folder(storeId));
    form.append("useUniqueFileName", "true");
    const r = await call(env.IMAGEKIT_UPLOAD_URL, { method: "POST", headers: { authorization: imagekit.auth() }, body: form });
    if (!r.ok || !r.data?.fileId) throw new HttpError(502, "The image couldn't be uploaded. Please try again.");
    return { providerFileId: r.data.fileId, url: r.data.url, width: r.data.width || null, height: r.data.height || null };
  },
};

function cloudinarySign(params) {
  const base = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return crypto.createHash("sha1").update(`${base}${env.CLOUDINARY_API_SECRET}`).digest("hex");
}

const cloudinary = {
  folder: (storeId) => `${env.CLOUDINARY_FOLDER.replace(/^\/+|\/+$/g, "")}/${storeId}`,
  base: () => `${env.CLOUDINARY_API_URL}/${env.CLOUDINARY_CLOUD_NAME}`,
  auth: () => `Basic ${Buffer.from(`${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`).toString("base64")}`,

  sign(storeId) {
    const params = { folder: cloudinary.folder(storeId), timestamp: Math.floor(Date.now() / 1000) };
    return {
      uploadUrl: `${cloudinary.base()}/image/upload`,
      fileField: "file",
      fields: { api_key: env.CLOUDINARY_API_KEY, timestamp: String(params.timestamp), folder: params.folder, signature: cloudinarySign(params) },
    };
  },

  async verify(storeId, publicId) {
    const id = String(publicId);
    if (!id.startsWith(`${cloudinary.folder(storeId)}/`) || id.includes("..")) throw new HttpError(404, "We couldn't find that upload. Please try again.");
    const r = await call(`${cloudinary.base()}/resources/image/upload/${id.split("/").map(encodeURIComponent).join("/")}`, { headers: { authorization: cloudinary.auth() } });
    if (!r.ok || !r.data?.public_id) throw new HttpError(404, "We couldn't find that upload. Please try again.");
    const f = r.data;
    return { providerFileId: f.public_id, name: `${f.public_id.split("/").pop()}.${f.format}`, url: f.secure_url, mime: FORMAT_MIME[String(f.format).toLowerCase()] || null, size: f.bytes, width: f.width || null, height: f.height || null };
  },

  async remove(publicId) {
    const params = { public_id: publicId, timestamp: Math.floor(Date.now() / 1000) };
    const body = new URLSearchParams({ ...params, timestamp: String(params.timestamp), api_key: env.CLOUDINARY_API_KEY, signature: cloudinarySign(params) });
    await call(`${cloudinary.base()}/image/destroy`, { method: "POST", body });
  },

  async uploadBuffer(storeId, { buffer, mime }) {
    const params = { folder: cloudinary.folder(storeId), timestamp: Math.floor(Date.now() / 1000) };
    const body = new URLSearchParams({
      file: `data:${mime};base64,${buffer.toString("base64")}`,
      folder: params.folder,
      timestamp: String(params.timestamp),
      api_key: env.CLOUDINARY_API_KEY,
      signature: cloudinarySign(params),
    });
    const r = await call(`${cloudinary.base()}/image/upload`, { method: "POST", body });
    if (!r.ok || !r.data?.public_id) throw new HttpError(502, "The image couldn't be uploaded. Please try again.");
    return { providerFileId: r.data.public_id, url: r.data.secure_url, width: r.data.width || null, height: r.data.height || null };
  },
};

const PROVIDERS = { imagekit, cloudinary };

module.exports = { storageProvider, PROVIDERS, checkImage, MAX_SIZE_BYTES };

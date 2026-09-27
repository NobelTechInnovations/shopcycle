const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { HttpError } = require("@shopcycle/utils");
const { UPLOADS_ROOT } = require("../../config/paths");
const { env } = require("../../config/env");
const { detectImageType } = require("../../lib/file-type");
const { storageProvider, PROVIDERS, checkImage, MAX_SIZE_BYTES } = require("./storage");

const FILE_SELECT = { omit: { data: true } };

/** Uploads are kept in two places: the File row (the record — it survives
 * redeploys) and apps/api/uploads/<storeId>/ (a disk cache the API serves
 * from first; see serve.js). A move to S3/R2 later would slot in behind
 * the same saveUpload() signature.
 *
 * `mimetype` (browser-reported) and `filename` (uploader-chosen) are both
 * ignored for anything security-relevant: the real type comes from the
 * file's own bytes, and the stored extension comes from that detected type,
 * never from the original name — see lib/file-type.js for why. */
async function saveUpload(prisma, storeId, { filename, buffer }) {
  if (buffer.length > MAX_SIZE_BYTES) {
    throw new HttpError(400, "File is too large (max 8MB).");
  }
  const detected = detectImageType(buffer);
  if (!detected) {
    throw new HttpError(400, "Unsupported file. Upload a JPEG, PNG, WebP, or GIF image.");
  }

  const storage = storageProvider();
  if (storage !== "database") {
    const safeName = `${crypto.randomUUID()}${detected.ext}`;
    const up = await PROVIDERS[storage].uploadBuffer(storeId, { buffer, filename: safeName, mime: detected.mime });
    return prisma.file.create({
      data: { storeId, name: String(filename || "image").slice(0, 200), url: up.url, mimeType: detected.mime, size: buffer.length, width: up.width, height: up.height, storage, providerFileId: up.providerFileId },
      ...FILE_SELECT,
    });
  }

  const safeName = `${crypto.randomUUID()}${detected.ext}`;
  const storeDir = path.join(UPLOADS_ROOT, storeId);
  await fs.mkdir(storeDir, { recursive: true });
  await fs.writeFile(path.join(storeDir, safeName), buffer);

  const url = `${env.API_PUBLIC_URL}/uploads/${storeId}/${safeName}`;

  return prisma.file.create({
    data: {
      storeId,
      // Display name only (rendered escaped by React) — capped so a huge
      // filename can't bloat the row.
      name: String(filename || "image").slice(0, 200),
      url,
      mimeType: detected.mime,
      size: buffer.length,
      data: buffer,
    },
    omit: { data: true },
  });
}

function listFiles(prisma, storeId, { page, pageSize }) {
  return Promise.all([
    prisma.file.findMany({
      where: { storeId },
      omit: { data: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.file.count({ where: { storeId } }),
  ]);
}

/** Direct upload, step 1: what the browser needs to send the file to the CDN. */
function uploadConfig() {
  const storage = storageProvider();
  return { storage, direct: storage !== "database", maxBytes: MAX_SIZE_BYTES };
}

function signUpload(storeId) {
  const storage = storageProvider();
  if (storage === "database") throw new HttpError(400, "Direct uploads aren't enabled — upload the file to /api/files/upload.");
  return { storage, ...PROVIDERS[storage].sign(storeId) };
}

/** Direct upload, step 2: the provider says the file is there and is an
 * acceptable image in this store's folder — only then is it recorded. */
async function completeUpload(prisma, storeId, { providerFileId, name }) {
  const storage = storageProvider();
  if (storage === "database") throw new HttpError(400, "Direct uploads aren't enabled.");
  const existing = await prisma.file.findFirst({ where: { storeId, storage, providerFileId: String(providerFileId) }, ...FILE_SELECT });
  if (existing) return existing;

  const provider = PROVIDERS[storage];
  const f = await provider.verify(storeId, String(providerFileId));
  const problem = checkImage(f);
  if (problem) {
    await provider.remove(f.providerFileId).catch(() => {});
    throw new HttpError(400, problem);
  }
  return prisma.file.create({
    data: { storeId, name: String(name || f.name || "image").slice(0, 200), url: f.url, mimeType: f.mime, size: f.size, width: f.width, height: f.height, storage, providerFileId: f.providerFileId },
    ...FILE_SELECT,
  });
}

async function deleteFile(prisma, storeId, id) {
  const file = await prisma.file.findFirst({ where: { id, storeId }, omit: { data: true } });
  if (!file) throw new HttpError(404, "File not found");
  await prisma.file.delete({ where: { id } });
  if (file.storage && PROVIDERS[file.storage] && file.providerFileId) {
    await PROVIDERS[file.storage].remove(file.providerFileId).catch(() => {});
    return;
  }
  try {
    const safeName = path.basename(new URL(file.url).pathname);
    await fs.unlink(path.join(UPLOADS_ROOT, storeId, safeName));
  } catch {
    // Best-effort disk cleanup — the DB row is the source of truth either way.
  }
}

module.exports = { saveUpload, listFiles, deleteFile, uploadConfig, signUpload, completeUpload };

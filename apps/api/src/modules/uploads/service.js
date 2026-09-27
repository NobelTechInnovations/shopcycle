const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { HttpError } = require("@shopcycle/utils");
const { UPLOADS_ROOT } = require("../../config/paths");
const { env } = require("../../config/env");
const { detectImageType } = require("../../lib/file-type");

const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8MB

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

async function deleteFile(prisma, storeId, id) {
  const file = await prisma.file.findFirst({ where: { id, storeId }, omit: { data: true } });
  if (!file) throw new HttpError(404, "File not found");
  await prisma.file.delete({ where: { id } });
  try {
    const safeName = path.basename(new URL(file.url).pathname);
    await fs.unlink(path.join(UPLOADS_ROOT, storeId, safeName));
  } catch {
    // Best-effort disk cleanup — the DB row is the source of truth either way.
  }
}

module.exports = { saveUpload, listFiles, deleteFile };

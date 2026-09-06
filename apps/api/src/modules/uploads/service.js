const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { HttpError } = require("@shopcycle/utils");
const { UPLOADS_ROOT } = require("../../config/paths");
const { env } = require("../../config/env");

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]);
const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8MB

/** Local-disk storage under apps/api/uploads/<storeId>/ — a real, working
 * upload (not a URL-paste placeholder), scoped per store. A production
 * deployment would swap this for S3/R2 behind the same saveUpload()
 * signature; nothing above this layer needs to know which one is used. */
async function saveUpload(prisma, storeId, { filename, mimetype, buffer }) {
  if (!ALLOWED_MIME.has(mimetype)) {
    throw new HttpError(400, `Unsupported file type: ${mimetype}. Allowed: JPEG, PNG, WebP, GIF, SVG.`);
  }
  if (buffer.length > MAX_SIZE_BYTES) {
    throw new HttpError(400, "File is too large (max 8MB).");
  }

  const ext = path.extname(filename) || "";
  const safeName = `${crypto.randomUUID()}${ext}`;
  const storeDir = path.join(UPLOADS_ROOT, storeId);
  await fs.mkdir(storeDir, { recursive: true });
  await fs.writeFile(path.join(storeDir, safeName), buffer);

  const url = `${env.API_PUBLIC_URL}/uploads/${storeId}/${safeName}`;

  return prisma.file.create({
    data: { storeId, name: filename, url, mimeType: mimetype, size: buffer.length },
  });
}

function listFiles(prisma, storeId, { page, pageSize }) {
  return Promise.all([
    prisma.file.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.file.count({ where: { storeId } }),
  ]);
}

async function deleteFile(prisma, storeId, id) {
  const file = await prisma.file.findFirst({ where: { id, storeId } });
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

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { UPLOADS_ROOT } = require("../../config/paths");

/**
 * GET /uploads/:storeId/:file — an uploaded image.
 *
 * The disk under apps/api/uploads is a cache, not the record: a host like
 * Railway gives every deploy a fresh, empty disk. When the file isn't on
 * disk it's read from its File row (the bytes are saved there on upload)
 * and written back to disk for next time. Names are random UUIDs that are
 * never reused, so responses are cached for a year.
 */
const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;
const SAFE_FILE = /^[A-Za-z0-9-]{1,80}\.(jpg|jpeg|png|webp|gif)$/i;
const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

function cacheHeaders(reply, type) {
  reply.header("content-type", type);
  reply.header("cache-control", "public, max-age=31536000, immutable");
}

async function uploadsServe(fastify) {
  fastify.get("/uploads/:storeId/:file", async (request, reply) => {
    const { storeId, file } = request.params;
    if (!SAFE_SEGMENT.test(storeId) || !SAFE_FILE.test(file)) return reply.code(404).send({ error: "Not found" });
    const onDisk = path.join(UPLOADS_ROOT, storeId, file);
    const ext = file.split(".").pop().toLowerCase();

    try {
      const stat = await fsp.stat(onDisk);
      if (stat.isFile()) {
        cacheHeaders(reply, MIME[ext]);
        reply.header("content-length", stat.size);
        return reply.send(fs.createReadStream(onDisk));
      }
    } catch {
      // not cached on this server — fall through to the database
    }

    const row = await fastify.prisma.file.findFirst({
      where: { storeId, url: { endsWith: `/uploads/${storeId}/${file}` } },
      select: { data: true, mimeType: true },
    });
    if (!row?.data) return reply.code(404).send({ error: "Not found" });
    const buffer = Buffer.from(row.data);
    // Best effort: keep a disk copy so the next request skips the database.
    fsp
      .mkdir(path.dirname(onDisk), { recursive: true })
      .then(() => fsp.writeFile(onDisk, buffer))
      .catch(() => {});
    cacheHeaders(reply, row.mimeType || MIME[ext]);
    return reply.send(buffer);
  });
}

/**
 * Files uploaded before the bytes were kept in the database exist only on
 * this server's disk. Copy any that are still here into their rows, so the
 * next deploy doesn't lose them. Runs once at start-up, in small batches.
 */
async function backfillFromDisk(prisma, log) {
  let saved = 0;
  for (;;) {
    const rows = await prisma.file.findMany({ where: { data: null }, select: { id: true, storeId: true, url: true }, take: 50, skip: 0, orderBy: { createdAt: "asc" } });
    if (!rows.length) break;
    let progressed = false;
    for (const r of rows) {
      const name = path.basename(String(r.url).split("?")[0]);
      try {
        const buffer = await fsp.readFile(path.join(UPLOADS_ROOT, r.storeId, name));
        await prisma.file.update({ where: { id: r.id }, data: { data: buffer } });
        saved += 1;
        progressed = true;
      } catch {
        // Not on this server's disk — nothing to rescue.
      }
    }
    // Rows whose files are gone stay null; stop instead of looping on them.
    if (!progressed || rows.length < 50) break;
  }
  if (saved) log.info(`uploads: saved ${saved} file(s) from disk into the database`);
}

module.exports = { uploadsServe, backfillFromDisk };

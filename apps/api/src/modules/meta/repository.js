const { encryptSecret, decryptSecret } = require("../../lib/crypto");

/**
 * The only read/write path for MetaConnection — the Meta Ads and WhatsApp
 * modules both go through here — so this is where the access token is
 * encrypted on the way in and decrypted on the way out. Every caller keeps
 * seeing a plain `accessToken`; only the database row holds ciphertext.
 * That token can run a store's ad account and message its customers, so a
 * database leak alone must not hand it over.
 */
function decrypt(connection) {
  if (!connection) return connection;
  return { ...connection, accessToken: decryptSecret(connection.accessToken) };
}

function encryptData(data) {
  return "accessToken" in data ? { ...data, accessToken: encryptSecret(data.accessToken) } : data;
}

async function findByStore(prisma, storeId) {
  return decrypt(await prisma.metaConnection.findUnique({ where: { storeId } }));
}

async function upsert(prisma, storeId, data) {
  const stored = encryptData(data);
  return decrypt(
    await prisma.metaConnection.upsert({
      where: { storeId },
      update: stored,
      create: { storeId, ...stored },
    })
  );
}

/** Changes an existing connection (the ad account / Page / WhatsApp picks).
 * Not an upsert: a new connection always needs its access token. */
async function update(prisma, storeId, data) {
  return decrypt(await prisma.metaConnection.update({ where: { storeId }, data: encryptData(data) }));
}

function remove(prisma, storeId) {
  return prisma.metaConnection.delete({ where: { storeId } }).catch(() => null);
}

module.exports = { findByStore, upsert, update, remove };

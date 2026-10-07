const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

/**
 * Queries go through node-postgres (Prisma's pg driver adapter). Prisma's
 * own engine, behind Supabase's transaction pooler (`?pgbouncer=true`),
 * wraps every single query in BEGIN · DEALLOCATE ALL · query · COMMIT —
 * four round trips to a database in another region instead of one, which
 * made a store's home page take ~5 s. DB_DRIVER=engine switches back.
 */
function adapter(url) {
  if (!url || process.env.DB_DRIVER === "engine") return null;
  const u = new URL(url);
  const max = Number(u.searchParams.get("connection_limit")) || 10;
  const timeout = Number(u.searchParams.get("pool_timeout")) || 20;
  const sslmode = u.searchParams.get("sslmode");
  // Prisma-only settings node-postgres doesn't know.
  for (const k of ["pgbouncer", "connection_limit", "pool_timeout", "statement_cache_size", "sslmode", "schema"]) u.searchParams.delete(k);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  return new PrismaPg({
    connectionString: u.toString(),
    max,
    connectionTimeoutMillis: timeout * 1000,
    idleTimeoutMillis: 60_000,
    // Supabase signs with its own CA: DATABASE_SSL_CA (the PEM from
    // Supabase ▸ Database ▸ SSL) verifies it. Without it the connection is
    // encrypted but unverified — what Prisma's engine did (sslmode=prefer).
    ssl: local || sslmode === "disable" ? false : process.env.DATABASE_SSL_CA ? { ca: process.env.DATABASE_SSL_CA.replace(/\\n/g, "\n") } : { rejectUnauthorized: false },
  });
}

// Reuse a single PrismaClient across hot-reloads / module reloads so we
// don't exhaust Postgres/Supabase connections in dev.
const globalForPrisma = globalThis;

const driver = adapter(process.env.DATABASE_URL);
const prisma =
  globalForPrisma.__shopcyclePrisma ||
  new PrismaClient({
    ...(driver && { adapter: driver }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    // Interactive transactions (placing an order, saving a product with
    // many variants) are several round trips; Prisma's 5 s default is too
    // tight against a database in another region.
    transactionOptions: { timeout: 20000, maxWait: 10000 },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__shopcyclePrisma = prisma;
}

module.exports = { prisma };

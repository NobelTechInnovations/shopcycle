const { PrismaClient } = require("@prisma/client");

// Reuse a single PrismaClient across hot-reloads / module reloads so we
// don't exhaust Postgres/Supabase connections in dev.
const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.__shopcyclePrisma ||
  new PrismaClient({
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

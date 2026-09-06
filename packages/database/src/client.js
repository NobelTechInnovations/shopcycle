const { PrismaClient } = require("@prisma/client");

// Reuse a single PrismaClient across hot-reloads / module reloads so we
// don't exhaust MySQL connections in dev.
const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.__shopcyclePrisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__shopcyclePrisma = prisma;
}

module.exports = { prisma };

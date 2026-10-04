/** @type {import('next').NextConfig} */
const nextConfig = {
  // Internal workspace packages ship raw JSX/ESM source (no build step of
  // their own) — Next needs to compile them together with app code.
  transpilePackages: ["@shopcycle/ui"],
  // See apps/admin/next.config.js — shared-hosting process quotas are far
  // below this host's real core count, so the default one-worker-per-core
  // build kills itself with `spawn ... EAGAIN`.
  experimental: { cpus: 2 },
};

module.exports = nextConfig;

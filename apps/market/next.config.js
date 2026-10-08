/** @type {import('next').NextConfig} */
const nextConfig = {
  // See apps/admin/next.config.js — shared-hosting process quotas are far
  // below this host's real core count.
  experimental: { cpus: 2 },
  images: { unoptimized: true },
};

module.exports = nextConfig;

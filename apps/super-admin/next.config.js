/** @type {import('next').NextConfig} */
const nextConfig = {
  // Internal workspace packages ship raw JSX/ESM source (no build step of
  // their own) — Next needs to compile them together with app code.
  transpilePackages: ["@shopcycle/ui"],
};

module.exports = nextConfig;

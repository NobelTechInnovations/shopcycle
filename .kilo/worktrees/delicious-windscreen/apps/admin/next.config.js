/** @type {import('next').NextConfig} */
const nextConfig = {
  // Internal workspace packages ship raw JSX/ESM source (no build step of
  // their own) — Next needs to compile them together with app code.
  transpilePackages: ["@shopcycle/ui"],
  // Next's build defaults to one worker process per detected CPU core —
  // fine on a dedicated box, but on shared hosting (Hostinger et al.) the
  // account's actual process quota is far smaller than the host machine's
  // real core count, so that default spawns more child processes than the
  // account is allowed and the build dies with `spawn ... EAGAIN`. Capped
  // low here since it costs nothing on a real dev machine either.
  experimental: { cpus: 2 },
};

module.exports = nextConfig;

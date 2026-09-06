# ShopCycle

A Shopify-style multi-tenant commerce platform: dense admin, theme-driven storefront, JSON-templated section engine.

## Stack

- **Admin**: Next.js 16 (App Router, JS), Tailwind CSS, Ant Design (themed), Lucide icons
- **API**: Node.js 24 LTS (target for prod; local dev runs on whatever LTS/current you have installed), Fastify, Zod, Prisma, JWT (cookie session)
- **Data**: MySQL 8, Redis 7
- **Storefront/theme engine**: LiquidJS + JSON templates (Phase 2+)
- **Monorepo**: pnpm workspaces + Turborepo

## Layout

```
apps/
  admin/        Next.js admin dashboard
  api/          Fastify REST API
  storefront/   Customer-facing storefront (Phase 2+)
packages/
  ui/           Shared design system: Tailwind preset, AntD theme, components
  database/     Prisma schema + client
  validation/   Shared Zod schemas
  utils/        Shared helpers
themes/
  classic/      Master theme package (copied per-store on install)
  modern/       Master theme package (copied per-store on install)
docker/         Local MySQL + Redis + Adminer
```

## Getting started

```bash
cp .env.example .env
cp .env.example apps/admin/.env.local  # Next.js only reads .env from its own app dir
pnpm install
pnpm docker:up
pnpm db:migrate
pnpm dev
```

If you ever change `API_PORT` in the root `.env`, update `NEXT_PUBLIC_API_URL` in `apps/admin/.env.local` to match and restart the admin dev server — Next.js inlines `NEXT_PUBLIC_*` vars at start, so it won't pick up a change via hot reload.

- Admin: http://localhost:3000
- API: http://localhost:4000
- Adminer (DB browser): http://localhost:8080 (server: `mysql`, user: `shopcycle`, pass: `shopcycle`, db: `shopcycle`)

## Phase status

- [x] Phase 0 — repo, tooling, docker, schema scaffold
- [~] Phase 1 — admin shell, auth, dashboard, products, themes (install/activate) wired to real data. Collections/Orders/Customers screens follow the same module pattern next.
- [ ] Phase 2 — Liquid theme renderer + live storefront
- [ ] Phase 3 — Visual theme editor
- [ ] Phase 4 — Code editor (Monaco)
- [ ] Phase 5 — Commerce expansion
- [ ] Phase 6 — Multi-tenant SaaS

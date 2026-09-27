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

## Deploying the API (Hostinger Node.js hosting)

The API needs the whole repository (it uses the workspace packages and the
`themes/` folder), so deploy the repo root, not just `apps/api`.

| Setting | Value |
| --- | --- |
| Node.js version | 22 |
| Package manager | pnpm (version comes from `packageManager` in `package.json`: pnpm 10) |
| Install command | `pnpm install --frozen-lockfile` |
| Build command | none for the API |
| Entry file | `apps/api/server.js` (maps the host's `PORT` to `API_PORT`) |
| Environment | everything in `.env.example` marked for the API — at least `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `DATA_ENCRYPTION_KEY`, `API_PUBLIC_URL`, `NODE_ENV=production` |

- pnpm is pinned to 10 on purpose. The corepack bundled with Node 22 looks for
  `bin/pnpm.cjs`, which pnpm 11+ no longer ships, so a host resolving "latest"
  pnpm fails with `Cannot find module …/corepack/v1/pnpm/12.x/bin/pnpm.cjs`.
- The Prisma client is generated during install (`packages/database`
  postinstall), so no separate `prisma generate` step is needed. It doesn't
  need database access.

### Railway

`railway.json` at the repo root does it: leave the service's root directory
as `/` (the API needs the workspace), and Railway installs the workspace,
generates the Prisma client, starts `node apps/api/server.js` and checks
`/health`. It never builds the Next.js apps, and only redeploys when the API,
the shared packages or the themes change.

Sessions are cookies, so the API and the admin/storefront must share one
registrable domain (e.g. `api.oyklane.com` + `admin.oyklane.com` with
`COOKIE_DOMAIN=.oyklane.com`). `*.up.railway.app` and `*.vercel.app` are
separate sites to the browser, so sign-in won't stick across them.

### Addresses and domains

| Address | Serves | Hosted on |
| --- | --- | --- |
| `oyklane.com` | marketing site (apps/www) | Vercel |
| `store.oyklane.com` | seller admin (apps/admin) — never a storefront | Vercel |
| `api.oyklane.com` | API (apps/api) | Railway (custom domain) |
| `{handle}.oyklane.com` | each store's public site (apps/storefront) | Vercel, wildcard `*.oyklane.com` |
| `shop.example.com` | a store's own domain, connected in Settings ▸ Domains | Vercel (same storefront project) |

The storefront finds the store from the hostname alone. Theme files,
platform scripts and uploaded images are served through the store's own
address, so no hosting URL (`*.railway.app`, `*.vercel.app`) ever appears on
a store page. A connected domain is marked live only after it answers over
HTTPS; from then on `{handle}.oyklane.com` forwards to it (the seller can
turn that off).

Environment for this:

- API (Railway): `STOREFRONT_ROOT_DOMAIN=oyklane.com`, `API_PUBLIC_URL=https://api.oyklane.com`,
  `COOKIE_DOMAIN=.oyklane.com`, and — to add custom domains and their SSL to
  Vercel automatically — `VERCEL_TOKEN`, `VERCEL_STOREFRONT_PROJECT_ID`,
  `VERCEL_TEAM_ID` (team projects only).
- Storefront (Vercel): `STOREFRONT_ROOT_DOMAIN=oyklane.com`, `API_INTERNAL_URL=https://api.oyklane.com`
  (https — an http address gets redirected, and a redirected POST arrives as
  a GET, so add-to-cart and checkout would fail; the storefront now upgrades
  a public http address itself);
  domains `*.oyklane.com` (wildcard SSL needs `oyklane.com` on Vercel's nameservers).
- Admin (Vercel): `NEXT_PUBLIC_API_URL=https://api.oyklane.com`, `NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN=oyklane.com`.

### Uploaded images

Uploads are saved in the database (`files.data`) as well as on the API's
disk. The disk is only a cache: Railway starts every deploy with an empty
disk, and `/uploads/<store>/<file>` falls back to the database and re-caches
it. On start-up the API copies any file still on its disk but missing from
the database (uploads made before this existed). Nothing to configure. For
large volumes, swap `modules/uploads` to S3/R2 behind the same functions.

## Selling features

- **Payments** (Settings ▸ Payments): each seller connects their own
  Razorpay, Cashfree, PayU, Stripe or PayPal account, in test or live mode,
  and turns cash on delivery on or off. Keys are stored encrypted
  (`DATA_ENCRYPTION_KEY`) and never shown again in full. An unpaid online
  order is cancelled and restocked after 2 hours.
- **API & webhooks** (Settings ▸ API & webhooks): API keys (`oyk_…`, shown
  once) with scopes — read/write products and inventory, read/write orders,
  read customers — for `https://api.oyklane.com/api/v1/…`
  (`Authorization: Bearer <key>`). Webhooks POST signed JSON
  (`X-Oyklane-Signature: sha256=HMAC(secret, "<timestamp>.<body>")`) for
  order, product and customer events, retried for about 9 hours.
- **Custom data** (Settings ▸ Custom data): sellers add fields to products
  and collections — text, paragraph, number, yes/no, date, link, colour,
  image, list. They appear on the product form, in the product page's
  Details (unless hidden), in the API, and in themes as
  `{{ product.metafields.custom.fabric }}`.
- **Themes**: Classic, Modern, Atelier (clothing — split hero, category
  circles, shop-the-look) and Lumière (jewellery — serif, emerald and gold,
  craft story, gift guide). Product, cart, checkout and account pages are
  the platform's own on every theme; variants titled like `M / Black` get
  separate Size and Colour pickers. Every store's footer carries
  "Powered by Oyklane.com".
- **Product page layout** (theme editor ▸ Product page): the seller
  reorders, hides and resizes the product page's blocks (title, price,
  pickers, buy buttons, badges, description, details, extra tabs…) and adds
  theme sections around it. Saved as the theme's `templates/product.json`;
  the design stays the platform's. Cart and checkout stay fixed.
- **Quick add**: product cards open a size/colour picker in the cart drawer.
- **Checkout fields** (Settings ▸ Checkout): mobile, landmark, company,
  GSTIN and an order note — hidden, optional or required; India-only
  shipping hides the country menu. Enforced by the API, shown on the order
  and the GST invoice.
- **Product Reviews app** (Apps): stars on cards and product pages, a
  review form (anyone or verified buyers only), moderation, replies and CSV
  import matched by product slug.
- **Facebook Pixel / Google Analytics**: added by the platform to every
  page, checkout included, with ViewContent/view_item, AddToCart,
  InitiateCheckout, Purchase and Search events. "Continue with Facebook"
  lists the seller's pixels when `META_APP_ID`/`META_APP_SECRET` are set.
- **New-order alerts**: the admin plays a coin sound and shows the order
  when a COD or paid order comes in (one tab rings; mute in the top bar).

## Phase status

- [x] Phase 0 — repo, tooling, docker, schema scaffold
- [~] Phase 1 — admin shell, auth, dashboard, products, themes (install/activate) wired to real data. Collections/Orders/Customers screens follow the same module pattern next.
- [ ] Phase 2 — Liquid theme renderer + live storefront
- [ ] Phase 3 — Visual theme editor
- [ ] Phase 4 — Code editor (Monaco)
- [ ] Phase 5 — Commerce expansion
- [ ] Phase 6 — Multi-tenant SaaS

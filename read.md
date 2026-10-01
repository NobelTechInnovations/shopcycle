# Handoff notes — Oyklane (read this first)

Notes kept in the project so they survive switching Claude accounts. Last updated 27 Sep 2026.

---

## 1. The project

Oyklane is a Shopify-like SaaS in a pnpm monorepo.

| App | Local | Live |
|---|---|---|
| API (Fastify, `apps/api`) | localhost:4100 | api.oyklane.com (Railway) |
| Seller admin (`apps/admin`, Next 16) | localhost:3000 | store.oyklane.com |
| Storefront (`apps/storefront`) | localhost:3002 | `{handle}.oyklane.com` (Vercel) |
| Super admin (`apps/super-admin`) | localhost:3003 | — |
| Marketing site (`apps/www`) | localhost:3004 | oyklane.com |

- **Packages:** database (Prisma on Supabase), theme-engine, theme-schema, ui, utils, validation.
- **Themes:** classic, modern, atelier, lumiere, plus `_platform` (system pages, cart drawer, checkout).
- **Run everything:** `pnpm run dev`.

## 2. Rules the owner set (always follow)

- **Super admin is platform-only.** A store owner must never be able to log in there.
- **Sessions stay separate** between seller admin, super admin and storefront.
- **Login details** for admin, super admin and stores go in `.env` as comments, so the owner can copy them.
- **Don't touch the domain setup.** It works.
- **Never add demo data to Sonchiri.** Sonchiri (handle `sonchiri`, sonchirisweets.com) is the owner's real sweets store. Loomwear (handle `loomwear`) is the demo clothing store.
- **Don't commit unless the owner asks.**
- **Rotate the Vercel token.** It was exposed once in a screenshot; never use or repeat it.

## 3. ⚠️ Shared database

- **Production DB is Supabase project `oyklane-in` (Mumbai, ap-south-1)** since 27 Sep 2026. All 79 tables were copied from the old Tokyo project `Oyklane` (ap-northeast-1) with pg_dump/psql and every table's row count verified. Tokyo is now a **stale backup** — don't point anything at it.
- Railway (`api.oyklane.com`, project "powerful-light") and local `.env` both point at Mumbai.
- Lesson: switching `DATABASE_URL` to a new, empty database took every store offline for hours. Copy the data first, verify, then switch.
- **Reset on 27 Sep 2026 (owner's request): every store, store account, order, customer and log was deleted** to start real testing. Kept: the super admin (`admin@shopcycle.platform`), plans/features, app catalog, billing settings, platform audit log. Backup of everything before the reset: `../shopcycle-db-backups/mumbai-before-reset-2026-09-27.dump` (restore with `pg_restore`). The Sonchiri/Loomwear rules below refer to stores that no longer exist until they're recreated.

Local `.env` points at the **production** Supabase database, so every local write is a live write.

- Keep schema pushes additive: `pnpm --filter @shopcycle/database push`.
- Only clean up rows you created yourself.
- Don't run `apps/api/test/e2e-security.sh` while the owner is signed in locally.
- **Connection limit:** Supabase's session pooler (`:5432`) allows only **15 connections in total**, and production holds most of them.
  - Tests use the transaction pooler instead (`:6543` with `pgbouncer=true`); `e2e-billing.js` already does this.
  - Recommended for production: set `DATABASE_URL` to `:6543?pgbouncer=true&connection_limit=...` and keep `DIRECT_URL` on `:5432`.

---

## 4. Billing engine rebuild — committed ("payment module", 27 Sep) and LIVE in production

### ⚠️ Urgent

- **Production already runs the new billing code** (the push to main deployed it; the billing job runs there).
- The billing **bootstrap already ran on the shared database**:
  - Plans are now **Starter ₹199 / Growth ₹599 / Pro ₹1,299**. The old "Premium" plan was renamed "Pro".
  - Every store has a trial:
    - Loomwear, Sonchiri and Second Store: trial ends **30 Sep 2026**.
    - Demo Store and Sonchiri Sweets: trial ends 26 Oct.
- **Protect Sonchiri** (real store): its dashboard locks at trial end (30 Sep) unless autopay is on. Either extend its trial in Super admin ▸ Billing ▸ Subscriptions, or set up autopay first.
- Demo Store still has an old test Razorpay subscription (`sub_TgaIqCE2AWsZFg`). Leave it alone.

### What the spec asked for (the owner's requirements)

**Plans**

| Plan | Monthly price | Checkout fee | Staff accounts |
|---|---|---|---|
| Starter | ₹199 | 2% | 2 |
| Growth | ₹599 | 1.5% | 10 |
| Pro | ₹1,299 | 0.5% | 30 |

- No product limit on any plan.
- More staff than the plan allows → the seller files a limit request.
- Yearly price = monthly × 12 × 80%.

**Pricing rules**
- 3-day free trial, then a one-time ₹99 first month, then the regular price.
- **Billing is per store.** A second store from the same email gets its own trial and ₹99 month.
- GST of 18% is added on top and shown separately: CGST+SGST in the same state, IGST otherwise.

**Payment failures**
- Payment fails → 7 days of grace with full access.
- Grace over → the dashboard locks; the storefront stays live.
- 3 unpaid cycles → store suspended: storefront offline and checkout closed.

**Cancellation** → the plan runs to the end of the period, then expires with 7 days of grace, then the same lock and suspension rules apply.

**One-Click Checkout app** → adds +0.3% to the fee. Each order records whether it was used.

**Razorpay mandates** → UPI AutoPay, card or e-mandate. Only Razorpay ids are stored, never card or bank details. The frontend's word is never trusted — payments are always verified with Razorpay.

**Super admin controls**
- Views: MRR, statuses, GST, payments, mandates, refunds.
- Actions: suspend/restore, grant access, extend trial, change plan, promo price, reminders, retry, refund, grants, limit requests, settings. Every action is audited.

### Done

**Schema** (`packages/database/prisma/schema.prisma`, already pushed)
- Plan fields: `key`, `isActive`, `tagline`, `sortOrder`.
- New models: `PlatformSetting`, `Feature`, `PlanFeature`, `Subscription`, `SubscriptionItem`, `BillingCycle`, `Mandate` (has a `livemode` field), `PaymentMethod`, `BillingPayment`, `BillingRefund`, `BillingFailure`, `SubscriptionEvent`, `CommissionTransaction`, `CommissionSummary`, `TaxTransaction`, `PaymentWebhookEvent`, `BillingNotification`, `EntitlementGrant`, `LimitRequest`.
- New Order fee fields: `feePlanId`, `feeCommissionRate`, `feeOneClickRate`, `oneClickCheckout`.

**Engine** (`apps/api/src/modules/billing/`)

| File | What it does |
|---|---|
| `settings.js` | Platform billing rules (stored in `PlatformSetting` "billing") |
| `money.js`, `pricing.js` | GST split, yearly price, proration |
| `catalog.js` | Features and the 3 plans |
| `entitlements.js` | Feature and limit checks, staff usage |
| `state.js` | The 9 statuses and allowed transitions; every change is logged |
| `access.js` | Dashboard / storefront / checkout access |
| `cycles.js` | Charges with idempotency keys (intro, regular, proration, fees, reactivation) |
| `charges.js` | Charge on mandate, settle or fail, invoices, refunds |
| `mandates.js` | Autopay setup, activation, replacement, cancellation; the ₹1 check is refunded |
| `engine.js` | Scheduled job: trial end, renewals, retries, grace, lock, suspension, reminders, reconciliation |
| `commission.js` | Per-order fees, reversals, monthly summaries |
| `invoices.js` | GST invoices and tax records |
| `plan-change.js` | Free switches in the trial/intro month; upgrades now with proration; downgrades at period end |
| `subscriptions.js` | Per-store trial, cancel, resume |
| `webhooks.js` | Each event stored once, failed ones replayed |
| `notifications.js` | Dashboard notices and emails |
| `admin.js` | Super admin actions |
| `bootstrap.js` | Runs at API start; only fills in what's missing |
| `service.js`, `routes.js` | Seller API at `/api/billing` |
| `providers/` | Razorpay and a sandbox behind one interface |

**Connected to the rest of the app**
- `plugins/jwt-auth.js`: central dashboard lock (402 `billing_locked`; `/api/billing` and GET `/api/store` stay open) and `request.getEntitlements()`.
- Storefront: 503 "temporarily unavailable" and checkout closed when a store is suspended.
- `lib/store-provisioning.js`: every new store gets a trial.
- Plan-gated features:
  - Team staff limit.
  - GST invoices, CSV export and Meta/WhatsApp apps: Growth and Pro.
  - API keys and the public API: Pro only (breaking change for existing keys on other plans).
  - Theme code editor: Growth and Pro. JSON saves from the visual editor are allowed on every plan.
- Checkout saves the fee terms on each order.
- `/api/auth/me` returns `access` and `entitlements`.
- Super admin API at `/api/super-admin/billing/*`, audited.
- Old `/api/store/billing|subscribe|plan` routes were removed.
- `jobs.js`: the billing job runs only in production unless `BILLING_JOBS=true`.
- `server.js`: runs the bootstrap at start.

**UI**
- **Seller admin:**
  - `/billing` "Complete Your Subscription" page (`app/billing/CompleteSubscription.jsx`).
  - Settings ▸ Plan & billing (`app/admin/settings/BillingSettings.jsx`).
  - `lib/billing.js` opens Razorpay Checkout.
  - Invoice view shows GST separately; admin layout redirects locked stores; "Premium" wording replaced.
- **Super admin:**
  - Billing section: overview, subscriptions, subscription detail with all actions, limit requests, settings.
  - New Plans page with plan editor and feature matrix.
  - "Billing" added to the nav.
- **Storefront:** One-Click Checkout popup in `themes/_platform/assets/cart-drawer.js` and `.css`. The config comes from `oneClickConfig` in `modules/storefront/service.js`.

**Tests**
- `apps/api/test/razorpay-mock.js`: customers, tokens, recurring payments, refunds, plus test helpers.
- `apps/api/test/e2e-billing.js`: the full lifecycle, using the test clock (`POST /api/billing/_test/clock`, enabled with `BILLING_TEST_CLOCK=true`; never in production).
- Last runs (27 Sep): billing 136/136, orders 117/117, growth 181/181 (before the provider work — re-run in progress), billing-modes 16/16 and providers 64/64 (after it).
- Every suite forces `EMAIL_PROVIDER/SMS_PROVIDER/WHATSAPP_PROVIDER=log` and `MEDIA_STORAGE=database`, so tests never send real mail/SMS or upload to a CDN (earlier runs did send a few emails to `@test.oyklane.dev` through ZeptoMail).

### Done on 27 Sep (NOT committed yet)

- Billing follow-ups: `failCycle` retry fix; tests rewritten/fixed; AdminShell billing banner (`components/BillingBanner.jsx`, `/api/billing/status` now also returns `autopay`); register/notice copy; marketing site pricing (3 plans, prices **exclude** GST); dead code deleted; README billing section.
- **Providers & sign-in** (see README ▸ Providers and sign-in):
  - Email: SMTP (ZeptoMail over SMTP already in `.env`), plus ZeptoMail/Brevo HTTP APIs via `EMAIL_PROVIDER`.
  - Images: ImageKit (or Cloudinary) — direct browser upload, API only signs and verifies. Old DB images untouched.
  - SMS/WhatsApp codes: Twilio, MSG91, WhatsApp Cloud API. **Zoho CPaaS WhatsApp not done** — its send API isn't publicly documented; paste a sample request from the Zoho CPaaS console to add it (one file: `lib/messaging.js`).
  - Shopper phone sign-in = paid **Phone Login** app (₹299/month, editable in Super admin ▸ Apps).
  - "Continue with Google" for sellers (admin login/register) and shoppers (storefront).
- **Paid apps billing** (`billing/app-charges.js`): charged per billing period installed (trial counts as one), on the next bill; removing stops future charges only.
- Schema pushed (additive): `files.storage/providerFileId`, `users.googleSub`, `customers.phoneVerifiedAt`, `apps.priceMonthly`, `billing_cycles.appsAmount`, new tables `shopper_phone_otps`, `app_charges`, `message_logs`.
- ⚠️ The **Phone Login app row already exists in the shared DB** (local API bootstrap), so production's Apps page lists it before this code is deployed. Installing it there does nothing until deploy.

### Fixed later on 27 Sep (NOT committed yet)

- **Email is queued, never blocking**: `sendEmail` writes an EmailLog row (`queued`) and returns; an in-process worker delivers with retries (1, 5, 15 min) and the jobs tick drains leftovers. Sign-up used to hang ~2 min because Railway blocks outbound SMTP (ZeptoMail SMTP timed out).
- The dashboard's "Confirm your email" banner shows the real status (sending / sent / couldn't send) via `GET /api/auth/email/status`.
- ~~Plan choice at sign-up~~ — superseded: the plan is now chosen inside the dashboard on `/welcome` (see below).
- Railway `SUPER_ADMIN_ORIGIN` was `http://localhost:3003` (super admin sign-in failed with "Failed to fetch"); set to `https://superadmin.oyklane.com`. The API now warns at start-up if any origin is localhost in production.

### Done 27–28 Sep, second round (NOT committed yet)

- **Plan choice moved into the dashboard**: sign-up (and "Create new store") no longer asks for a plan; the store starts its trial on the default plan with `settings.setup.choosePlan = true`, and the admin layout sends it to `/welcome` — step 1 choose plan (`POST /api/billing/setup/plan`), step 2 autopay (e-mandate first) or **Skip for now**. `plan` is optional again in the validation schemas.
- **Analytics** rebuilt (`components/charts.jsx`): stat tiles with deltas vs the previous period and sparklines, area charts with hover, table view, top products/pages/sources/locations. API `GET /api/analytics/overview` returns `totals`, `previous`, `series` (every day, store timezone). Reports page uses the same components.
- **Home dashboard**: Shopify-style performance card (Sessions / Sales / Orders / Conversion with a chart and range), "to do" chips (orders to fulfil, awaiting payment, out of / low stock → filtered lists).
- **Products/collections**: after saving, a "Saved" panel with View on store / Duplicate / Add another; Duplicate via `/admin/products/new?from=<id>`. Custom data fields now save and fill in (FieldInput passed value/onChange through).
- **One-Click Checkout popup** (`themes/_platform/assets/cart-drawer.js/.css`): mobile → OTP → saved addresses (from the number's past orders / verified account) → payment options → pay. API `POST /api/storefront/:handle/checkout/express/{code,verify}` (shopper/express.js); needs an SMS/WhatsApp provider in production, otherwise it skips the code. A cancelled/failed online payment (gateway cancel, Razorpay window closed, Back button) returns to the page the popup was opened on with the popup reopened at payment — never the full checkout page.
- **Duplicate orders fixed**: an online order that wasn't paid is replaced (cancelled, restocked, hidden from "All orders", kept under "Cancelled") when the shopper checks out again from the same cart. The cart is now kept until payment is confirmed for Razorpay too.
- **Phone Login app → phone-only sign-in**: with the app on, the storefront sign-in/register pages show phone only, and account links open a phone → code popup (`assets/login-popup.js/.css`, route `/account/phone`). The account page hides "Set a password".
- **Filters** on collection and search pages (`snippets/sys-filters.liquid`): availability, price, category, brand, size, colour, with counts, chips and clear-all.
- **Policies**: Settings ▸ Policies creates Refund / Shipping / Privacy / Terms pages from templates; published ones are linked in every theme's footer (through `powered_by`).
- **New-order alerts**: the chime now also plays for orders placed since the last visit (≤30 min), only a tab that can play sound claims it, and the bell pulses when the browser still needs a click to allow sound. The new-order **email** goes to the owner's login email as well as the store's support email.
- **Marketing site**: pricing is live from `GET /api/auth/plans` (monthly/yearly switch), new One-Click Checkout section, GST wording fixed.
- Speed: `railway.json` moves the API to Singapore (`asia-southeast1-eqsg3a`, next deploy); Vercel functions set to `bom1` (next deploy); `app/admin/loading.jsx` shows a skeleton instantly on navigation.

### Done 28 Sep, third round (NOT committed yet)

- **Test store** (the only one to use for trying things; its login is in `.env` comments): `ui-test-1790529796`. Has One-Click Checkout, Phone Login and PayU (test mode) connected, sample products for filters.
- **Checkout sign-in fixed**: the popup no longer remembers details in the browser (that made it look signed in when it wasn't). Confirming the mobile code signs the shopper in — at once if the number has an account, or with the order (a short-lived "number confirmed" ticket in an HttpOnly cookie links the number to the new customer). Signing out clears the session, the cart and any checkout in progress. A phone-verified shopper's account lists orders placed with that number.
- **Ways to pay per gateway** (`payments/methods.js`): each gateway is asked what it offers (Razorpay `GET /v1/methods`, PayU `get_checkout_details`, Cashfree `/pg/eligibility/payment_methods`; Stripe = card, PayPal = PayPal), kept in `store.settings.gatewayMethods`, refreshed on save and daily; typical defaults when a gateway can't be asked. Checkout (popup and page) shows UPI / card / net banking / wallets / EMI / pay later / COD separately, and the gateway opens on the chosen one (Razorpay `config.display` block, PayU `enforce_paymethod`, Cashfree `order_meta.payment_methods`). ⚠️ PayU's old public test key is refused by its lookup API ("Invalid Hash"), so on the test store PayU shows its defaults; a real merchant key gets the real list.
- **Checkout page redesigned** (`sections/sys-checkout.liquid`): numbered cards (Contact, Delivery address, Payment), icons in fields, PIN code fills in the state, per-method payment options, "Pay ₹X with UPI" button that stays in reach on phones, policies linked in the agreement line.
- **Marketing site plans**: refreshed every minute, and at once when Super admin saves a plan if `WWW_REVALIDATE_URL` (e.g. `https://oyklane.com/api/revalidate`) and `REVALIDATE_SECRET` (same value on the API and the www project) are set.
- Local dev tip: `.env` now has Zoho WhatsApp keys, so a local API would send **real** WhatsApp codes. Run it with `EMAIL_PROVIDER=log SMS_PROVIDER=log WHATSAPP_PROVIDER=log` when testing with made-up numbers (the e2e tests already force this).

### Done 29 Sep (NOT committed yet)

- **Why codes weren't sent in production**: Railway has `WHATSAPP_PROVIDER=zoho`, `ZOHO_CPAAS_TOKEN`, `ZOHO_WHATSAPP_FROM` but not `ZOHO_WHATSAPP_TEMPLATE_KEY`, so WhatsApp counted as "not set up" → Phone Login off (email sign-in showed) and the One-Click popup skipped the code. The API now warns about this at start-up. Also: Phone Login set to SMS with only WhatsApp working now falls back to WhatsApp instead of switching off.
- **Unpaid online orders are not orders**: an online checkout whose payment didn't finish is left out of Orders (every tab), Home, analytics, exports, customer totals and the shopper's account (`orders/placed.js`); its cart shows under Abandoned checkouts ("Online payment not completed") and gets the reminder. Paying later turns it into an order and removes the abandoned checkout.
- **PayU cancel → back to where they were**: PayU returns with a cross-site POST, which carries no cookies, so the return route couldn't tell where the shopper started and fell back to the checkout page. It now checks the payment and bounces to a same-site GET that does have the cookies → back to the page with the popup reopened.
- **One-Click everywhere**: the popup script loads on every page but checkout whenever the app is on (also the cart page, and themes set to the full cart page); any "Checkout" link opens the popup.
- **Saved addresses across Oyklane stores**: a shopper new to a store who confirms their number sees the addresses they used on other Oyklane stores (marked as such). The privacy policy template says so — stores that already created their policy should add that paragraph.
- **Payment brand marks** (Google Pay, PhonePe, Paytm, Visa, Mastercard, Amex, Amazon Pay, PayPal from Simple Icons, CC0; UPI and RuPay as text marks) in the popup and on the checkout page.
- **Super admin ▸ Messaging** (`lib/whatsapp-templates.js`, `super-admin/messaging.js`): the WhatsApp templates every store shares live in `platform_settings` (key `whatsapp_templates`), not in Railway. Only the **verification code** is wired: Zoho template key, the name of its code placeholder, on/off, "Send test code", and the last ten WhatsApp messages. Railway keeps just the account (`ZOHO_CPAAS_TOKEN`) and the number (`ZOHO_WHATSAPP_FROM`); `ZOHO_WHATSAPP_TEMPLATE_KEY` is only a fallback while the field is empty. Changes reach every API instance within a minute. ⚠️ Local dev shares the production database: saving there changes production.
- **Order / shipped / delivered WhatsApp messages are not built yet.** The owner decided they're a paid feature of the **Phone Login app (₹299)**, not free — add them as new types in `whatsapp-templates.js` TYPES and send them only for stores with that app installed.

### Done 29–30 Sep, fourth round (backend + admin committed in `42e7ccd`; the www finish is NOT committed yet)

- **New tables** (pushed to the shared DB, additive only — checked with `prisma migrate diff` first): `flows`, `flow_runs`, `support_articles`, `support_chats`, `support_tickets`, `support_messages`.
- **Flow app** (`modules/flows`, admin `Apps ▸ Flow`): email automations like Shopify Flow. Trigger (order placed / shipped / delivered / cancelled / refunded, customer signed up, checkout abandoned) → steps: Wait, Condition (stop if false), Email the customer, Email me. 8 recipes, live preview, "Send a test", run history. Runs once per flow + order/customer/checkout (unique index). Hooks into `webhooks.emit` (new `onEvent` listener); new events `order.delivered` and `checkout.abandoned`. Unpaid online orders never start flows. Waits are resumed by the jobs tick **in production only** (`FLOW_JOBS`, like `BILLING_JOBS`) so a local API never picks up production's runs. Free app (`flow`, seeded by bootstrap).
- **Seller Help & support** (`modules/support`, admin Help button / `?` key, `/admin/support`): an assistant answers first — Claude via `ANTHROPIC_API_KEY` (model `SUPPORT_AI_MODEL`, default `claude-opus-5-5`, or set in Super admin), grounded in the help articles + the store's plan, apps, gateways and domain. Without a key it answers with the best article. "I still need help" → ticket with the conversation attached; emails to the seller and the support inbox; the team replies in **Super admin ▸ Support** and the reply is emailed + shown in the seller's Help page. 26 starter articles seeded into `support_articles` (edit them in Super admin ▸ Support ▸ Help articles). Test: `node apps/api/test/e2e-flows-support.js` (68 checks, mock Claude).
- **Installed apps pinned in the sidebar** (Shopify-style) with a ⋯ menu: Open app, App settings, Uninstall. New app store page and an app details page (`/admin/apps/details/[key]`) with settings, pricing and uninstall.
- **Marketing site redesign** (aasaan-style dark layout, Oyklane violet→teal): new home (product tour carousel, feature rows, bento, integrations, themes, live pricing, FAQ), plus `/integrations`, `/apps` (live from the new public `GET /api/public/apps`) and `/pricing` (plan comparison). ⚠️ The half-finished version (new CSS, old page) went live with `42e7ccd` — the finished pages are in the working tree and need committing + deploying. The Loomwear demo store no longer exists, so "see a live store" links only show when `NEXT_PUBLIC_DEMO_STORE_URL` is set.

### Done 30 Sep, fifth round (NOT committed yet)

- **AI runs on NVIDIA Nemotron 3 Ultra** (`lib/ai.js`): NVIDIA's OpenAI-compatible API (`NVIDIA_API_URL`, default `https://integrate.api.nvidia.com/v1/chat/completions`), model `nvidia/nemotron-3-ultra-550b-a55b`, thinking turned off and any `<think>`/reasoning text hidden. The key goes in `NVIDIA_API_KEY`; a key starting `nvapi-` is also picked up from `ANTHROPIC_API_KEY` (that's where it is on Railway today — rename it when convenient). `AI_PROVIDER=nvidia|anthropic` forces one. Super admin ▸ Support shows which provider is live; model names with a `/` are NVIDIA models.
- **Free plan for a store** (Super admin ▸ Billing ▸ a store ▸ "Free plan"): no monthly fee until a date (≤ 5 years), with a note; **order commission is still charged** every cycle. Optional "keep the store open" also covers any grace/lock. "End free plan" goes back to normal pricing from the next cycle. New columns `subscriptions.free_plan_until`, `free_plan_note` (pushed, additive). The seller sees a banner in Settings ▸ Billing.
- **Commission verified**: `e2e-billing.js` now places two ₹25,000 COD orders on Starter and checks the renewal = plan price + 2% commission (₹1,000) + GST, and the commission is marked paid; and the free-plan cycle = ₹0 + commission only. 150/150 pass.
- **Email fallback on phone sign-in**: when a phone code can't be sent, the error offers "Sign in with your email instead" (popup and the account login page); the email code flow works in the popup too.
- **WhatsApp 429 "Resource Limit Exhausted"**: the sending number `ZOHO_WHATSAPP_FROM` is Meta's **test number** (+1 555…), which only reaches allow-listed numbers and has tiny limits, and/or Zoho CPaaS WhatsApp credits ran out. Fix: top up credits in Zoho, add the real business number in Zoho ▸ WhatsApp, set `ZOHO_WHATSAPP_FROM` to it. Super admin ▸ Messaging now explains each error and warns about the test number.
- **Store URLs in Super admin ▸ Companies** (subdomain, or the custom domain once live), clickable.
- **Marketing site**: light / dark toggle (remembers the choice, follows the device by default); real brand logos (Simple Icons, CC0; wordmarks for Cashfree, PayU, UPI, RuPay, Shiprocket, Delhivery, Blue Dart) on home, Integrations, Apps and in the checkout mock; menu icon alignment and phone padding fixed. Admin app store and sidebar show the Google Analytics / Meta / WhatsApp marks too.

### Done 1 Oct, sixth round (NOT committed yet)

- **DB (pushed, additive)**: `menu_items.depth`, new table `app_connections`, indexes `orders(phone)` and `orders(email)`.
- **Product page** (`ProductForm.jsx`, `modules/products/ai.js`): reordered (name & description → photos → price & stock → SEO), plain "Price & stock" for products without sizes/colours, a "Ready to sell?" checklist, tags (were never editable before). **Write / Improve with AI** rewrites the description in place (rewrite, shorter, more detail, bullets, for Google) with Undo. **Suggest** (and on leaving the name box) proposes a category (or a new one, one click to create) and tags — AI when a key is set, word matching otherwise. 60 AI calls per store per hour.
- **Menus with dropdowns**: Content ▸ Navigation is a drag-and-drop tree (drag right = under the link above, left = out; arrow buttons too), 3 levels. Themes print `link.links`; the dropdown CSS is shared (platform `MENU_CSS`). Stores keep their own copy of theme files, so an untouched old `snippets/menu-links.liquid` is swapped for the new one at render (`PRISTINE_UPGRADES` in storefront/service.js — all 7 store copies were untouched).
- **Customer behaviour across stores** (`customers/insights.js`): on every order and customer page — orders, cancellations, items returned, shipments that came back, across all Oyklane stores by phone (any format) and email, with a verdict (reliable / some returns / high risk). Other stores are only counted, never named. The privacy policy template says so (stores that already made their policy should add the paragraph).
- **Live view**: signed-in shoppers now show name, phone, email (Call / WhatsApp buttons) and the page by product name. New **Visitor history** tab (signed-in shoppers or everyone, 90 days) with each visit's pages, products looked at, reached checkout / ordered; also on each customer's page.
- **Email design** (Apps ▸ Flow ▸ Email design, saved in `store.settings.emailDesign`): logo, colour, layout (Classic / Banner / Minimal) for every shopper email. All emails got icons (white or dark PNGs from Lucide, served at `/api/email-assets/icons/*.png`), an order progress tracker and product photos. Flow emails can add an icon and a banner image.
- **Instagram Feed and Google Reviews apps** (`modules/social`, sections `themes/_platform/sections/app-*.liquid`): connect in their app page, then add the section anywhere in Customize (new "Apps" group; hint shown only in the editor). Instagram: one-click with `INSTAGRAM_APP_ID/SECRET` (Meta app, product "Instagram API with Instagram login", redirect `<ADMIN_ORIGIN>/admin/apps/instagram`), or paste a token; refreshed every 3 h, token renewed. Google: `GOOGLE_PLACES_API_KEY` (Places API New); find the business by name; rating + up to 5 reviews, daily; minimum stars setting. ⚠️ Both apps are added to the catalog **only in production** (or locally with `SEED_PREVIEW_APPS=1`) because local dev shares the database.
- Test: `node apps/api/test/e2e-seller-tools.js` (73 checks, mock AI/Instagram/Google).

### Left to do

0. **Production email**: Railway blocks SMTP (outbound SMTP needs Railway Pro). Set `EMAIL_PROVIDER=zeptomail` and `ZEPTOMAIL_TOKEN=<ZeptoMail ▸ Mail Agents ▸ SMTP/API ▸ API ▸ Send Mail Token>` on Railway. The SMTP username/password in `.env` are not that token.
1. **Commit and deploy** this work (owner decides) — first the www pages (the live site shows the half-finished redesign until then). For the Help assistant set `NVIDIA_API_KEY` on Railway (an `nvapi-` key in `ANTHROPIC_API_KEY` also works) (and optionally `SUPPORT_INBOX`, or the inbox in Super admin ▸ Support ▸ Assistant). Then in Super admin ▸ Messaging enter the approved Zoho **OTP template key** (and its placeholder name), Save, and "Send test code" to your own number — until then production WhatsApp codes stay off.
2. **Keys for the new providers** (see `.env.example`): `IMAGEKIT_*`, `GOOGLE_CLIENT_ID/SECRET` (+ both redirect URIs), `TWILIO_*` / `MSG91_*` / `META_WHATSAPP_*`, optionally `EMAIL_PROVIDER=zeptomail` + `ZEPTOMAIL_TOKEN`. Storefront (Vercel) needs `API_PUBLIC_URL` (or its `API_INTERNAL_URL` must be the public https API).
2a. **Instagram / Google reviews keys** on Railway: `GOOGLE_PLACES_API_KEY` (Google Cloud ▸ enable "Places API (New)" ▸ API key, restrict it to that API) and, for one-click Instagram, `INSTAGRAM_APP_ID` + `INSTAGRAM_APP_SECRET` (Meta app needs App Review for `instagram_business_basic` before other people's accounts can connect; until then sellers can paste a token). The AI key powers product writing too.
2b. **ImageKit isn't live yet**: the code is in, but Railway has no `IMAGEKIT_PUBLIC_KEY` / `IMAGEKIT_PRIVATE_KEY` / `IMAGEKIT_URL_ENDPOINT`, so uploads still go to the database until those are set.
3. India SMS needs **DLT registration** (MSG91 or Twilio) before real OTPs deliver.
4. Try the One-Click popup and the phone/Google sign-in screens in a browser on a test store — **not Sonchiri**.
5. **Deploy (billing):**
   - Set `RAZORPAY_WEBHOOK_SECRET`.
   - In Razorpay, register `https://api.oyklane.com/api/webhooks/razorpay` for these events: `payment.captured`, `payment.failed`, `token.confirmed`, `token.rejected`, `token.cancelled`, `token.paused`, `refund.processed`, `refund.failed`.
   - Ask Razorpay support to enable recurring payments (UPI AutoPay, card recurring, e-mandate).
   - Check `PLATFORM_STATE`, `PLATFORM_GSTIN` and the other `PLATFORM_*` values (used on invoices).
   - Consider moving production `DATABASE_URL` to the transaction pooler (see section 3).
   - After deploying, check the trials of real stores (Sonchiri).

### Useful commands

```bash
pnpm run dev                                    # all apps
pnpm --filter @shopcycle/database push          # additive schema changes (shared DB!)
node apps/api/test/e2e-billing.js               # billing lifecycle test (cleans up after itself)
KEEP_TEST_STORE=1 node apps/api/test/e2e-billing.js   # keep the test stores to inspect
node apps/api/test/e2e-providers.js             # providers, Google, phone login, paid apps (all mocked)
```

---

## 5. Earlier work (done, all tests passed at the time)

- **Payments:** 5 gateways, public API, webhooks, custom data (metafields).
- **Themes:** Atelier and Lumière.
- **Loomwear demo store:** 22 products and reviews.
- **Quick add** on product cards.
- **Add-to-cart fix on live:** `apps/storefront/lib/api-url.js` upgrades an http `API_INTERNAL_URL` to https. Set `API_INTERNAL_URL` to https on Vercel.
- **Product page:** sections can be rearranged, shown or hidden.
- **Settings ▸ Checkout:** checkout fields can be required, optional or hidden.
- **Tracking:** Pixel/GA injected with shopping events, and a Facebook-login pixel picker.
- **Product Reviews app.**
- **Coin sound** on new orders.
- **Marketing site** redesigned with theme screenshots.
- **Prisma transaction timeout** raised to 20 s.














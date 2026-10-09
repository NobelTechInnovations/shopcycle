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

### Done 1 Oct, sixth round (committed in `fe717cc` "updates", deployed 1 Oct)

- **DB (pushed, additive)**: `menu_items.depth`, new table `app_connections`, indexes `orders(phone)` and `orders(email)`.
- **Product page** (`ProductForm.jsx`, `modules/products/ai.js`): reordered (name & description → photos → price & stock → SEO), plain "Price & stock" for products without sizes/colours, a "Ready to sell?" checklist, tags (were never editable before). **Write / Improve with AI** rewrites the description in place (rewrite, shorter, more detail, bullets, for Google) with Undo. **Suggest** (and on leaving the name box) proposes a category (or a new one, one click to create) and tags — AI when a key is set, word matching otherwise. 60 AI calls per store per hour.
- **Menus with dropdowns**: Content ▸ Navigation is a drag-and-drop tree (drag right = under the link above, left = out; arrow buttons too), 3 levels. Themes print `link.links`; the dropdown CSS is shared (platform `MENU_CSS`). Stores keep their own copy of theme files, so an untouched old `snippets/menu-links.liquid` is swapped for the new one at render (`PRISTINE_UPGRADES` in storefront/service.js — all 7 store copies were untouched).
- **Customer behaviour across stores** (`customers/insights.js`): on every order and customer page — orders, cancellations, items returned, shipments that came back, across all Oyklane stores by phone (any format) and email, with a verdict (reliable / some returns / high risk). Other stores are only counted, never named. The privacy policy template says so (stores that already made their policy should add the paragraph).
- **Live view**: signed-in shoppers now show name, phone, email (Call / WhatsApp buttons) and the page by product name. New **Visitor history** tab (signed-in shoppers or everyone, 90 days) with each visit's pages, products looked at, reached checkout / ordered; also on each customer's page.
- **Email design** (Apps ▸ Flow ▸ Email design, saved in `store.settings.emailDesign`): logo, colour, layout (Classic / Banner / Minimal) for every shopper email. All emails got icons (white or dark PNGs from Lucide, served at `/api/email-assets/icons/*.png`), an order progress tracker and product photos. Flow emails can add an icon and a banner image.
- **Instagram Feed and Google Reviews apps** (`modules/social`, sections `themes/_platform/sections/app-*.liquid`): connect in their app page, then add the section anywhere in Customize (new "Apps" group; hint shown only in the editor). Instagram: one-click with `INSTAGRAM_APP_ID/SECRET` (Meta app, product "Instagram API with Instagram login", redirect `<ADMIN_ORIGIN>/admin/apps/instagram`), or paste a token; refreshed every 3 h, token renewed. Google: `GOOGLE_PLACES_API_KEY` (Places API New); find the business by name; rating + up to 5 reviews, daily; minimum stars setting. ⚠️ Both apps are added to the catalog **only in production** (or locally with `SEED_PREVIEW_APPS=1`) because local dev shares the database.
- Test: `node apps/api/test/e2e-seller-tools.js` (73 checks, mock AI/Instagram/Google).

### Done 2 Oct, seventh round (committed in `8d973f6` "updates" and deployed 2 Oct — its help articles are live)

- **DB (pushed, additive)**: `products.templateSuffix / hiddenChannels / googleCategory`, `pages.templateSuffix`, `collections.templateSuffix`, `order_items.properties`, new tables `rental_products` and `rental_bookings`.
- **"Preview error: Failed to fetch" in the theme editor**: the preview replaced itself with the error whenever one request failed (a redeploy, a network blip, a busy database — the API has `connection_limit=5`, and every preview runs ~10 queries; the logs showed pool timeouts during previews). Now: stale preview requests are cancelled, failures retry 3× (0.7 s, 2 s, 4.5 s), and if it still fails the last good preview stays with a small "Try again" bar (`theme-editor/[themeId]/draft-render.jsx`). The API runs at most 3 previews at once per process and skips ones the browser gave up on. Consider raising `connection_limit` in Railway's `DATABASE_URL` to 10 (Supabase's transaction pooler allows it).
- **Templates (Shopify's alternate templates)**: theme editor ▸ "+ Template" makes a named copy of the product, collection or page layout (`templates/product.<name>.json` in the store's theme); each product / collection / page picks one under **Layout ▸ Theme template**. Pages and collections can now be arranged too (their own content stays; theme sections go around it; page title can be hidden). Delete from the "…" next to the template. Apps can bring templates (`APP_TEMPLATES` in storefront/platform.js).
- **Rentals app** (`modules/rentals`, Apps ▸ Rentals): per product — rent per day, cheaper rates from N days, refundable deposit, pieces per size, shortest/longest rental, gap after each rental, notice. The product page (app template "Rental product", used automatically for rented products) shows the daily rent and a booking calendar (booked days greyed out per size) with delivery/pickup and return choices and a live total; the selling price isn't used (can be 0) and stock isn't touched. Two modes (Rentals ▸ Settings): **pay at checkout** (each rented piece is its own cart line priced by its dates, booked when the order is placed, freed if the order is cancelled) or **booking request** (no payment; seller and shopper get an email; seller confirms). Seller side: Today board (requests, going out, coming back, late), all bookings, a month calendar, add a booking by hand, block dates, hand over (deposit collected), returned (late fee suggested), deposit given back / kept. Rental dates show under the item in the cart, checkout, emails, order pages and the admin order. Product cards show "₹X / day". The new storefront route `/apps/rentals/request` (request mode) and the cart forwarding of rental fields need the **storefront redeployed**.
- **Instagram Feed — Continue with Facebook**: uses `META_APP_ID/SECRET` (the same Meta app as Meta Ads; `META_OAUTH_REDIRECT_URI` callback page routes the code). Reads the Instagram account linked to the seller's Facebook Page with the Page's token, which doesn't expire — the feed stays on until the seller removes it. Several linked accounts → the seller picks. Instagram-login and pasted tokens still work; all tokens are now stored encrypted. Meta needs Advanced Access (App Review) for `instagram_basic`, `pages_show_list`, `pages_read_engagement`, `business_management` before other people's accounts can connect.
- **Google Reviews — Sign in with Google**: Business Profile API (`business.manage`), every review (up to 150, newest first), rating and total; several businesses → pick one; refresh token kept encrypted, so it stays connected. Uses `GOOGLE_CLIENT_ID/SECRET` with a new redirect URI **`<ADMIN_ORIGIN>/admin/apps/google/callback`** (add it to the OAuth client). Google must approve the project for the Business Profile APIs (request form "GBP API access"; quota is 0 until then) and the `business.manage` scope needs OAuth verification. Finding the business by name (Places, 5 reviews) stays as the fallback. Section setting "Reviews to show" (3–24).
- **Sales channels** (`modules/channels`): **Google & YouTube** and **Facebook & Instagram** apps. Each store has private product feeds (`/api/public/feeds/<store>/<token>/google.xml` and `facebook.csv`: one item per variant, sale price from MRP, brand, size/colour, Google category; drafts, hidden, photo-less, price-less and rented products left out and listed for the seller). Connecting Google (Sign in with Google, Merchant API, scope `content`, same redirect URI) adds a data source to the seller's Merchant Center that fetches the feed daily, plus "Sync now", Google's last-fetch report and "Claim website". Connecting Facebook (`catalog_management`, `business_management`) picks or creates a catalogue and adds an hourly scheduled feed — Meta keeps fetching it even after the 60-day Facebook login lapses. Without the keys, the pages show the feed link and the steps to add it by hand. Verification tags (`google-site-verification`, `facebook-domain-verification`) are saved in `store.settings.verification` and printed on every store page. Per product: Sales channels switches and a Google category. Facebook Marketplace for businesses isn't open — the catalogue covers Facebook Shop, Instagram Shopping and ads.
- New catalog apps (`rentals`, `google-shopping`, `facebook-shop`) are added **only in production** (same reason as before). Theme product cards show "/ day" through another pristine upgrade (`snippets/product-card.liquid`, all 7 store copies untouched).
- Tests: `node apps/api/test/e2e-rentals-channels.js` (110 checks, mock Facebook/Google).

### Done 2 Oct, eighth round (NOT committed yet)

- **Theme editor saves only when asked**: no more autosave. Edits are a draft shown in the preview; **Save** (or ⌘S / Ctrl+S) writes them, **Discard** throws them away. Switching to another page of the editor or leaving with unsaved changes asks "Save / Discard / Keep editing"; closing the tab warns. (Also fixed: switching pages used the theme settings from when the editor opened, so a saved colour change could be lost.)
- **Preview stays where you were**: each new preview loads in a hidden second iframe and swaps in at the same scroll position (`theme-editor/[themeId]/StableFrame.jsx`) — no more jumping to the top on every change. Opening a different page starts at the top. The code editor's preview uses it too.
- **Your pages in the editor**: the page menu has a "Your pages" group (About us, Contact…); picking one opens the template it uses with that page in the preview.
- **All four themes**:
  - Header: logo width for computers and phones, store-name text size for computers and phones; long store names never push the icons off a phone screen (ellipsis, then a small script shrinks the name to fit).
  - Footer (Atelier, Lumière, Modern): the big store name at the bottom fits any name length, and a new "Large text at the bottom" setting can show a shorter word instead.
  - Featured product: photos stretched to 1500 px tall (the `height` attribute won — no theme set `height: auto`); fixed for every image on every store by a platform CSS rule. New settings: title size, show description, show the delivery ticks, one or two photos, photo shape (portrait / tall / square / landscape / as uploaded), photo fit (fill / whole photo), photo area width, photos on the right.
  - Image with story (Classic: Image with text): image shape (theme default / as uploaded / 4:5 / 2:3 / square / 4:3 / 16:9), fit, what to keep in view when trimming, image width, text position (top / middle / bottom).
  - Stores get these through pristine upgrades (`modules/themes/pristine.js`, now also applied — in memory, never written — when the editor opens a theme, so the new settings show there). Store copies a seller edited stay as they are; the platform CSS fixes (`THEME_FIXES_CSS` and the fit script in storefront/platform.js) still apply to them.
- **One Google and one Facebook sign-in per store, shared by every app** (`modules/accounts`, Settings ▸ **Connected accounts**): Oyklane's own Google client / Meta app — the seller never sees a key or token. The first sign-in asks for every app's access (Google: Business Profile + Merchant Center; Facebook: Pages, Instagram, catalogue, ads, WhatsApp — narrow with `META_LOGIN_SCOPES`), so installing another app later is only "pick your business / Merchant Center account / Instagram account / catalogue / pixel". If the seller unticked something, the app says so and "Allow access" asks again. Google: `app_connections` row "google-account" (refresh token encrypted, revoked at Google on disconnect). Facebook: the existing `meta_connections` row (Meta Ads and WhatsApp already used it). Instagram's "paste an access token" option is gone; Instagram's own login stays as a second way in.
- **One shopper sign-in across Oyklane stores ("Oyklane account")** (`modules/shopper/oyklane-id.js`, storefront `lib/shopper.js`): signing in on any store with an emailed code, Google, a phone code, or a password on an account whose email was proven gives the browser an Oyklane ID (signed, 90 days, only proven email/phone) in an HttpOnly cookie on `.oyklane.com`. On another store: an existing account there signs in on any page; a new one is made when the shopper **clicks** to their account, sign-in or checkout (a script can't trigger it — the browser's `Sec-Fetch-User` header), with a "signed in with your Oyklane account · Sign out" note. Signing out anywhere ends it in that browser. Sessions made this way can't reset a password without the old one. Stores on their own custom domain keep it to that domain (cookies can't cross domains) — a redirect through api.oyklane.com could add them later.
- Help articles: a new batch `help-articles-2026-10-02b` (Connected accounts, saving in Customize, the shoppers' Oyklane account) that also refreshes the text of three live articles (templates, selling on Google, selling on Facebook) — `REVISED` in support/articles.js.
- No store had a Google, Instagram, catalogue or Meta connection saved yet, so nothing needed migrating from the seventh round's per-app sign-ins.
- Tests: `e2e-rentals-channels.js` 139/139 (accounts and Oyklane account added), `e2e-seller-tools.js` 74/74, `e2e-orders.js` 117/117. Admin and storefront builds pass.

### Done 4 Oct — custom domains connect faster (NOT committed yet)

- Seen on laxmira.net: A and CNAME were right, but the `_vercel` TXT record Vercel asks for (the domain was on another Vercel account before) was never saved at the provider (Hostinger: none at its nameservers).
- "Check again" now asks Vercel to verify the domain (and www) straight away — before, a domain waiting on a TXT record only went live on Vercel's own schedule. It also looks the TXT up itself and shows Found / Not found yet / Wrong value with what DNS has, asks for the www TXT too when Vercel wants one, and says exactly what to type at the provider (name `_vercel` only).
- DNS checks use Cloudflare and Google's resolvers instead of the server's own, which can keep an old answer (that's why laxmira.net showed "Wrong value" after the A record was already fixed).

### Done 4 Oct, second batch (NOT committed yet)

- Disconnect buttons (Connected accounts, Google Reviews, Google & YouTube, Instagram, Facebook shop) did nothing: `useConfirmDialog` didn't return a promise. It now does (true/false) and accepts `content`.
- Facebook sign-in landed on `api.oyklane.com/admin/apps/meta/callback` (404): the API now forwards that path (and the Google/Instagram callbacks) to the admin. `META_OAUTH_REDIRECT_URI` defaults to `<ADMIN_ORIGIN>/admin/apps/meta/callback`.
- Google errors say what's really wrong: Merchant API's "GCP project … is not registered" (a one-time platform registration), APIs not enabled, blocked Places key — instead of "connection expired". **Super admin ▸ Integrations**: keys on the server, redirect URIs to register, "Test the key" for Places, and "Register Oyklane" for Merchant API (uses the Google sign-in of one of your own stores + Oyklane's Merchant Center ID).
- oyklane.com: `/privacy`, `/terms`, `/data-deletion` (Google Limited Use statement, DPDP rights, Grievance Officer), footer links, `sitemap.xml`, `robots.txt`. Set `NEXT_PUBLIC_LEGAL_ADDRESS`, `NEXT_PUBLIC_GRIEVANCE_OFFICER`, `NEXT_PUBLIC_LEGAL_EMAIL`, `NEXT_PUBLIC_LEGAL_CITY` on the www Vercel project, and have a lawyer review.
- Products list: search by title, SKU, vendor or tag; filters (category, brand, collection, stock, type, vendor, price range, rented / hidden from Google or Facebook) with removable chips; sort; columns to choose (sold in 30 days, category, brand, collections, SKU, variants, type, vendor, created, updated), remembered per browser.
- **MCP server** at `/api/mcp` (Streamable HTTP, JSON-RPC, stateless) authenticated with a store API key (Pro): 13 tools over the /api/v1 API (store, products, stock, orders, fulfilment, customers), filtered by the key's permissions. Settings ▸ API & webhooks shows the address and a config to paste. Test: `node apps/api/test/e2e-mcp.js` (26 checks).

### Done 5 Oct (committed in `8199795` "updates")

- **Google & YouTube page crashed** ("This page couldn't load"): my 4 Oct change declared its `manual` state inside the wrong component. Fixed. Ran an undefined-variable check (ESLint `no-undef`, from a scratch install) over admin, storefront, super admin, www, ui and the API: nothing else.
- **Meta Ads "Save" (ad account + Page) → 500**: the save used an upsert whose create half lacked the required access token, which Prisma rejects even when the row exists. Now an update (`meta/repository.update`).
- **"Feature unavailable" from Facebook**: Business-type Meta apps sign people in with a Facebook Login for Business configuration. New `META_LOGIN_CONFIG_ID` — when set, the login sends `config_id` instead of a permission list. A business system-user token from a configuration is kept as it is (it can't be exchanged). Super admin ▸ Integrations shows it.
- **Products list**: Size, Colour and Tag filters (sizes/colours read from variant names like the storefront — `lib/variant-options.js`), a Tags column.
- **Layouts were confusing**: the editor now says when the previewed page uses another layout ("won't show on it") with "Edit its layout" / "Use this layout for it"; "Used by N" lists and changes which pages/products/collections use a layout; "+ Template" can assign it straight away. API `POST /api/themes/templates/assign`. 6 new checks in e2e-rentals-channels (145/145).
- **Laxmira's About page**: it uses the "About us" layout, but the design was made on the Default page layout. Copied that design into "About us" (old version kept as a ThemeFileRevision). Live now. The Default page layout still has the same two sections, so the four policy pages show them too — remove them there if unwanted.

### Done 7 Oct (committed in `7ff7ef6` and `7aacbc2`, except the text editor, the Custom CSS box and the favicon field)

- **Store pages were slow (~5 s; Google's Merchant Center verification timed out on sonchirisweets.com)**: Prisma's engine behind Supabase's transaction pooler (`pgbouncer=true`) wrapped every query in BEGIN · DEALLOCATE ALL · query · COMMIT. `@shopcycle/database` now uses Prisma's pg driver adapter (`@prisma/adapter-pg` + `pg`) — one round trip per query, same results and error codes (checked). The render also runs its independent lookups side by side and records the page view while rendering. Home page locally: ~2.5 s → ~0.45 s. `DB_DRIVER=engine` switches back without a code change; `DATABASE_SSL_CA` (Supabase's CA PEM) turns on certificate checking. Every API endpoint gets the same speed-up.
- **Admin looked broken until it loaded**: AntD's styles were only added by JavaScript after load. `AntdProvider` now wraps `@ant-design/nextjs-registry`, so they're in the server HTML (admin and super admin).
- **Google & YouTube "Use this account" → "Unexpected field: fileInput.fileName"**: Merchant API doesn't take a file name for fetched feeds. Removed.
- **Contact page** (every store, `/contact`, like cart/checkout): the store's details (support email/phone from Settings, WhatsApp, address, hours, more details — all editable in the theme editor ▸ "Contact page") and a form (name, email, phone, message; spam honeypot; rate limits). Messages go to **Customers ▸ Queries** (unread count in the sidebar) and to the seller's email (reply-to the shopper). The seller replies from the admin; the reply is emailed from the store (reply-to the store's email). New table `contact_messages` (pushed). Footer links "Contact" on every store; in the sitemap.
- **Theme editor text editor**: every textarea/richtext setting has Bold, Italic, Underline, Highlight, Accent colour, Link and Clear formatting. Saved as inline HTML; the storefront cleans it (allowlist, `packages/theme-schema/src/rich-text.js`) before printing.
- **Custom HTML section** in every theme (Add section ▸ Custom HTML; scripts are stripped — they go in Custom Scripts) and **Theme settings ▸ Custom CSS** (printed last in `<head>` on every page).
- **Favicon**: Online Store ▸ Preferences ▸ Favicon → `<link rel="icon">` on every store page.
- Installing packages: `node_modules` was linked by pnpm 11 while `packageManager` says pnpm 10 — I ran pnpm 11 with `packageManager` switched temporarily (lockfile format unchanged, only additions).

### Done 7 Oct, second batch (committed)

- **Contact page in the theme editor said "Validation failed"**: the draft-render template list didn't include `contact`. Added.
- **Google & YouTube "Data source … was not found"**: Google can answer "not found" for a few seconds after the feed's data source is made; the fetch now retries, an old error clears once the data source answers, and "Sync now" re-adds a data source deleted in Merchant Center. "File upload not found" (Google hasn't read the feed yet) is no longer shown as an error. Sonchiri: website is claimed; the store has no products yet, so the feed is empty.
- **Google reviews show the rating but no review texts**: Google sends no review texts for any place with Oyklane's Places key (checked: India Gate, 287k ratings, 0 texts). Google's older Places endpoint says billing isn't enabled on the key's Google Cloud project → link a billing account to that project, then "Refresh now". Super admin ▸ Integrations ▸ "Test the key" now flags this.
- **More menus**: footers take up to 8 blocks (was 4) in all four themes, so 3+ menu columns fit with text and newsletter; untouched footers upgrade by themselves (pristine.js). Content ▸ Navigation shows where each menu really is on the live theme ("Header", "Footer · Help") and how to add one to the footer.
- **Facebook login**: only seller connections use it, so one Business app is enough — production already points at "Oyklane - Marketing" with its configuration (Facebook accepts the URL). See 2a1.

### Done 8 Oct (committed in `b355a7a` "new theme and updates")

- **UPI QR payments app** (`modules/upi`, Apps ▸ UPI QR payments): the seller's own UPI ID; checkout's "UPI QR" leads to `/checkout/upi` — a QR for the exact amount (Oyklane mark in the middle), a timer (3–15 min, default 5), "Open UPI app" on phones, "I've paid" with the 12-digit UTR (UTRs can't be reused). Plain UPI IDs give no bank signal, so the seller presses **Received** (or **Not received** → order cancelled, stock back); the shopper's QR page watches and moves to the confirmation by itself. Unreported QRs aren't orders (orders/placed.js + the raw SQL in analytics/express). New table `upi_payments` (pushed) — history and numbers (received, conversion, time to pay). Catalog row is seeded in production only. `test/e2e-upi-qr.js` 28/28; checked in a browser end to end.
- **Own email server (Pro)**: Settings ▸ Notifications ▸ Your own email server — shopper emails (order, shipping, refunds, contact replies, sign-in codes, flows…) go through the seller's SMTP; Oyklane's own emails to sellers never do. Falls back to Oyklane's sender if theirs fails (error shown). Plan feature `custom_email` (Pro). Password encrypted; never returned by `/api/store`.
- **Discounts redesigned**: kinds — amount off order, off products/collections, buy X get Y, free shipping; code or automatic; % cap, minimum amount/quantity, once per customer, total limit, dates; type picker, tabs with counts, 30-day numbers, duplicate / turn off. Schema additions on `discounts` (pushed). `test/e2e-discounts.js` 19/19; `e2e-orders` 117/117.
- **Fresh theme** (grocery, food & drinks): category circles, offer tiles, product tiles with pack size, veg / non-veg mark (tags `veg` / `non-veg`), ADD button. Not on oyklane.com's showcase yet (needs a screenshot from a demo store).
- **Google Analytics & Tag Manager** (Apps ▸ Google Analytics): through the Google sign-in — pick or create a GA4 property + web stream, Google's own Analytics sign-up when there's no account, pick or create a Tag Manager container, link Google Ads to GA4 by customer ID, purchase conversions (AW- ID + label). New scopes `analytics.edit` and `tagmanager.edit.containers` (existing Google sign-ins are asked again). Super admin shows the extra redirect URI and "Tag Manager API" to enable.
- App settings forms now merge instead of replacing (an app page's own settings survive the details form).
- Not done (needs Google / gateway partner approval first): creating Business Profiles by API (the "Create Business Profile" link stays), listing Google Ads accounts (developer token), and connecting Razorpay / Cashfree / PayU by login (each needs Oyklane approved as their partner, with OAuth client IDs).

### Done 8 Oct, second batch (NOT committed yet)

- **Menus**: any number of menus; "Show it in" when making one (footer column / header / not yet), and on a menu's page "Add as a footer column", "Use as header menu" (menus/service.placeMenu edits the live theme's footer blocks — an untouched footer's default columns become real blocks first). New link type **Store page** (Contact, Track order, Account, All products, Search, Blog, Cart). Every theme's default Help column now has "Contact us" (pristine upgrade).
- **UPI QR**: the UTR is optional ("I've paid" alone works). **Automatic confirmation**: Apps ▸ UPI QR ▸ turn on → a secret link; the seller's phone forwards bank "credited" SMS to it (SMS-forwarder app on Android, a Shortcuts automation on iPhone); the QR asking that amount is confirmed by itself (two QRs at once never ask the same amount — the second is a few paise less). Debit SMS are ignored. **Hidden at checkout while a gateway is live** (not in test mode). `e2e-upi-qr` 39/39.
- **Google Merchant**: the Google & YouTube page shows what Merchant Center holds — showing / in review / not shown, with Google's reasons. (A new store's first products take up to 3 working days in review.)
- **Invoices**: proper A4 tax invoice — logo (email logo, else the theme's), seller and buyer details with state codes, GSTIN, HSN, CGST/SGST or IGST columns, amount in words, signatory, print layout. Before the first invoice the seller gives GST details (registered or not, GSTIN, legal name, address, state); not registered → "Invoice" without the GST split. **Cancel invoice** (with reason) keeps it as printed in `cancelled_invoices` (new table, pushed) and can issue a new one with the next serial (serials never reused). The order page and the shopper's order pages show the tax split. `e2e-orders` 124/124.
- **Oyklane Store — oyklanestore.com** (new app `apps/market`, port 3005; API `modules/market`; new tables `partners`, `market_listings`, `market_versions`, `market_licenses`, `market_purchases`, `partner_earnings`, `partner_payouts`, `market_media`, and `themes.listing_id` / `themes.locked` — all pushed):
  - Browse themes and apps (Oyklane's own + developers'), filters, search, detail pages, **full theme preview** (every page — home, collection, product, search, cart, contact, sign-in — desktop/tablet/phone) rendered on the demo store (`MARKET_DEMO_STORE`, default `loomwear`; previews are hidden themes there).
  - **Developers**: own accounts (separate session — not a seller's), list themes (upload a .zip — every file checked) and apps (app link, install webhook, optional storefront script, API permissions), screenshots, versions, send for review, earnings and payouts (`MARKET_PARTNER_SHARE`, default 80%), docs page.
  - **Sellers** buy and install in their admin (`/admin/market/<theme|app>/<slug>`). Paid themes: Razorpay on Oyklane's account; licence only after the signature **and** the payment fetched from Razorpay match (order, amount, captured) — or Razorpay's signed webhook. Licence is per store; the installed copy is **locked** (code hidden and not editable — customise in the editor only). Apps: monthly via the plan's app charges; install gives the developer an API key with only the asked permissions (revoked on removal) and a signed "Open" link.
  - **Super admin ▸ Oyklane Store**: review queue (click through a theme's preview), approve / needs changes, take down, developers, record payouts.
  - Previews now stay on while you click around a store (`?themeId=` remembered; "Exit preview" bar) — admin's Themes preview too.
  - `test/e2e-market.js` 41/41.
- **Laxmira's Facebook "Feature unavailable"**: Meta side, not code — see 2a1.

### Done 9 Oct (NOT committed yet)

- **Product grid** section in all five themes (`sections/shop-grid.liquid`): a real grid on every screen — all products, a collection, best sellers, newest, on sale, or products picked by hand (new `product_list` setting); order; 2–6 per row on desktop, 1–2 on phones; rows before a "Show more" button (up to 48); "View all". The older "Product grid" sections (a row that swipes on phones) are now called "Featured products". Existing stores get the new section in the editor by themselves (themes/service.getTheme copies new master sections in).
- **Duplicate theme**: Online Store ▸ Themes ▸ Duplicate (live theme) or ⋯ ▸ Duplicate — an unpublished copy with all files, layouts and settings (up to 20 themes a store).
- **Facebook "Feature unavailable"**: the Meta app is Live and the business verified, but App Review was never submitted (18 permissions "Not submitted"), so only people with a role on the app can log in. Oyklane uses 9 permissions; `ads_management` is no longer asked for (Oyklane only reads ad accounts and pixels). Full plan, permission texts and screencast list: `docs/meta-app-review.md`.

### Left to do

0a. **Security — urgent**: production `JWT_SECRET` is the placeholder from `.env.example` (anyone can sign seller, super-admin and shopper sessions with it). Steps that keep encrypted data (2FA, payment keys, webhooks, Meta/Google tokens) readable: (1) set `DATA_ENCRYPTION_KEY` on Railway to `sha256("<current JWT_SECRET>:data-encryption")` in hex, (2) then set a new random `JWT_SECRET` (everyone signs in again), (3) later re-encrypt with a fresh key. Also rotate the Supabase database password and the Redis password (they were pasted in chat on 4 Oct) and set `TRUST_PROXY=true` on Railway (behind its proxy every visitor otherwise shares one rate-limit).
0. **Production email**: Railway blocks SMTP (outbound SMTP needs Railway Pro). Set `EMAIL_PROVIDER=zeptomail` and `ZEPTOMAIL_TOKEN=<ZeptoMail ▸ Mail Agents ▸ SMTP/API ▸ API ▸ Send Mail Token>` on Railway. The SMTP username/password in `.env` are not that token.
1a. **Oyklane Store go-live**: new Vercel project for `apps/market` with domain oyklanestore.com; env `API_INTERNAL_URL` (or `NEXT_PUBLIC_API_URL`) = https://api.oyklane.com, `NEXT_PUBLIC_ADMIN_ORIGIN` = https://store.oyklane.com, `NEXT_PUBLIC_SITE_URL` = https://oyklanestore.com. Admin and super admin: `NEXT_PUBLIC_MARKET_ORIGIN` = https://oyklanestore.com. Railway: `MARKET_ORIGIN`, optionally `MARKET_DEMO_STORE` / `MARKET_PARTNER_SHARE`. Razorpay webhook (item 5) also confirms store purchases.
1. **Commit and deploy** this work (owner decides) — first the www pages (the live site shows the half-finished redesign until then). For the Help assistant set `NVIDIA_API_KEY` on Railway (an `nvapi-` key in `ANTHROPIC_API_KEY` also works) (and optionally `SUPPORT_INBOX`, or the inbox in Super admin ▸ Support ▸ Assistant). Then in Super admin ▸ Messaging enter the approved Zoho **OTP template key** (and its placeholder name), Save, and "Send test code" to your own number — until then production WhatsApp codes stay off.
2. **Keys for the new providers** (see `.env.example`): `IMAGEKIT_*`, `GOOGLE_CLIENT_ID/SECRET` (+ both redirect URIs), `TWILIO_*` / `MSG91_*` / `META_WHATSAPP_*`, optionally `EMAIL_PROVIDER=zeptomail` + `ZEPTOMAIL_TOKEN`. Storefront (Vercel) needs `API_PUBLIC_URL` (or its `API_INTERNAL_URL` must be the public https API).
2a. **Instagram / Google reviews keys** on Railway: `GOOGLE_PLACES_API_KEY` (Google Cloud ▸ enable "Places API (New)" ▸ API key, restrict it to that API) and, for one-click Instagram, `INSTAGRAM_APP_ID` + `INSTAGRAM_APP_SECRET` (Meta app needs App Review for `instagram_business_basic` before other people's accounts can connect; until then sellers can paste a token). The AI key powers product writing too.
2a1. **One Meta app (Oyklane - Marketing, a Business app)** — env set on 7 Oct; still to do in the Meta dashboard: the Marketing app's own Facebook Login for Business ▸ Settings ▸ Valid OAuth Redirect URIs must list the store.oyklane.com callback, clear Required actions (1) / Alert Inbox, App settings ▸ Basic (privacy/terms/data-deletion URLs on oyklane.com, icon, category, business), add sellers as Testers until App Review + Business Verification give Advanced Access, reset the app secret (pasted again on 7 Oct). The "Oyklane" consumer app isn't used. Facebook Login for Business ▸ Configurations ▸ create one (User access token; tick the permissions the app's use cases offer) ▸ put its ID in `META_LOGIN_CONFIG_ID`; set `META_APP_ID`/`META_APP_SECRET` to that app; list the redirect URI (`META_OAUTH_REDIRECT_URI`, default `https://store.oyklane.com/admin/apps/meta/callback`) under Facebook Login for Business ▸ Settings. Reset both Meta apps' secrets (they were pasted in chat on 5 Oct).
2a2. **Sign-in keys for the shared Google / Facebook connection**: Google Cloud OAuth client — add redirect URI `https://store.oyklane.com/admin/apps/google/callback`, enable "My Business Account Management", "My Business Business Information", "Google My Business" (v4 reviews) and "Merchant API", apply for Business Profile API access, and submit the consent screen for verification (`business.manage` and `content` are sensitive scopes). Meta app — `META_OAUTH_REDIRECT_URI` = `https://store.oyklane.com/admin/apps/meta/callback`; request Advanced Access for `instagram_basic`, `pages_show_list`, `pages_read_engagement`, `business_management`, `catalog_management`, `ads_read`, `ads_management`, `whatsapp_business_management`, `whatsapp_business_messaging`. Until a permission is approved, set `META_LOGIN_SCOPES` to the approved ones so the login doesn't ask for more. Until approved, only accounts with a role on the Meta app / test users on the Google project can connect; the feed links work for everyone today.
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
node apps/api/test/e2e-mcp.js                   # the store's MCP server for AI agents
node apps/api/test/e2e-rentals-channels.js      # templates, rentals, shared Google/Facebook sign-in, sales channels, Oyklane account (mocked)
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














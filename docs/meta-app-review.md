# Meta App Review — Oyklane Connect (new app, 9 Oct)

**New app: Oyklane Connect — App ID 1122222970246571** (business Oyklane,
verified). Made with only Oyklane's use cases: Catalog API, Instagram,
Measure ad performance (Marketing API), WhatsApp. Set up:

- Basic: app domain oyklane.com, privacy / terms / data-deletion links,
  category Business and pages, icon.
- Facebook Login for Business ▸ Settings ▸ Valid OAuth Redirect URIs:
  `https://store.oyklane.com/admin/apps/meta/callback`.
- Configuration "Oyklane store connect" — **ID 1092321430248204**, user
  access token, permissions: ads_read, business_management,
  catalog_management, instagram_basic, pages_read_engagement,
  pages_show_list, whatsapp_business_management, whatsapp_business_messaging.
- Instagram use case also has instagram_business_basic (one-click Instagram
  login; its own Instagram app ID/secret are under Instagram API ▸ API setup
  with Instagram login → `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET`).
- `ads_management` comes with the Marketing use case (can't be removed) —
  it isn't in the configuration and isn't sent for review.

Railway, to switch Oyklane to it: `META_APP_ID=1122222970246571`,
`META_LOGIN_CONFIG_ID=1092321430248204`, `META_APP_SECRET` = Basic ▸ App
secret ▸ Show (copy it yourself). Sellers connected through the old app keep
working until their token expires, then reconnect.

Status 9 Oct (evening):
- Tech Provider: done. Website platform `https://store.oyklane.com/` added.
- Configuration now 9 permissions — **ads_management added back** (the Meta
  Ads app creates campaigns, ad sets and ads: meta-ads/service.js).
- App Review draft (submission 1122239030244965): public_profile,
  business_management, catalog_management, pages_show_list,
  pages_read_engagement, instagram_basic, ads_read, ads_management,
  whatsapp_business_management, whatsapp_business_messaging — descriptions
  written; reviewer instructions written (Facebook Login: Yes). Removed for
  now: Marketing API Access Tier (needs ~1,500 ad API calls first),
  instagram_business_basic.
- Left for the owner: videos (made with the NEW app), the "I agree" box on
  each permission, Data handling answers, a reviewer store login in the
  access-code box, then Submit. After approval: Publish.
- The 9 Oct recording used the OLD app (login URL client_id=1089178333651707),
  so it can't be used, and the new app's Testing page shows no calls yet.

---

Old app: Oyklane Store (App ID 1089178333651707)

Why sellers see "Feature unavailable": the app is Live and the business is
verified, but App Review was never submitted, so no permission has Advanced
Access. Until it does, Facebook Login works only for people with a role on the
app. (Access verification — Tech Provider, needed for WhatsApp — is in review
separately.)

## 1. Ask only for what Oyklane uses

Oyklane uses these 9 permissions (accounts/facebook.js `DEFAULT_SCOPES`):

| Permission | Where in Oyklane | Graph calls |
|---|---|---|
| public_profile | Shows the seller which Facebook account is connected | `GET /me?fields=id,name` |
| business_management | Facebook & Instagram shop: find the seller's business to pick its catalogue | `GET /me/businesses` |
| catalog_management | Facebook & Instagram shop: keep the store's products in the seller's catalogue (product feed, daily sync) | `GET /{business}/owned_product_catalogs`, `POST /{catalog}/product_feeds`, `POST /{feed}/uploads` |
| pages_show_list | Pick the Page whose Instagram account / WhatsApp number to use | `GET /me/accounts` |
| pages_read_engagement | Read the Page's linked Instagram business account and WhatsApp account | `GET /{page}?fields=instagram_business_account`, `GET /{page}/whatsapp_business_accounts` |
| instagram_basic | Instagram Feed app: show the store's latest Instagram posts on its website | `GET /{ig-user}`, `GET /{ig-user}/media` |
| ads_read | Facebook Pixel + Meta Ads apps: pick the seller's ad account and pixel (tracking on their store) | `GET /me/adaccounts`, `GET /{ad-account}/adspixels` |
| whatsapp_business_management | WhatsApp app: pick the seller's WhatsApp number and list its approved templates | `GET /{waba}/phone_numbers`, `GET /{waba}/message_templates` |
| whatsapp_business_messaging | WhatsApp app: send the seller's order updates to their own customers | `POST /{phone-number-id}/messages` |

Remove from the app (not used — reviewers reject permissions an app doesn't
show using): use cases **Create & manage app ads with Meta Ads Manager**,
**Ads MCP server**, **Meta Audience Network**, **Messenger**, **Live Video
API**, **oEmbed**, **Capture & manage ad leads**; and inside the rest:
`ads_management`, `pages_manage_metadata`, `pages_manage_ads`,
`pages_messaging`, `publish_video`, `leads_retrieval`, `ads_mcp_management`,
Marketing API Access Tier.

Facebook Login for Business ▸ Configurations ▸ the configuration in
`META_LOGIN_CONFIG_ID` must ask for exactly these (done in the new app — 1092321430248204).

## 2. Test calls (Review ▸ Testing)

Each permission needs a successful call in the last 30 days. Still missing:
**Catalog API** and **WhatsApp** — connect a test store once in Oyklane
(Apps ▸ Facebook & Instagram shop, Apps ▸ WhatsApp), or run in Graph API
Explorer: `GET me/businesses`, `GET {business-id}/owned_product_catalogs`,
`GET {waba-id}/phone_numbers`.

## 3. Text for each permission (App Review ▸ "Tell us how you'll use it")

Oyklane is a store builder for Indian businesses (https://oyklane.com). Sellers
connect their own Facebook account in their store's admin
(https://store.oyklane.com) to use Meta features in their own store. We only
access the assets the seller picks, only for their store, and they can
disconnect at any time (Apps ▸ … ▸ Disconnect), which deletes the token.

- **business_management** — After the seller connects Facebook in Apps ▸
  Facebook & Instagram shop, we list their businesses so they can choose which
  business's product catalogue their store's products go to.
- **catalog_management** — We create a product feed in the catalogue the
  seller picked and upload their store's products to it every day, so their
  products appear in their Facebook and Instagram shop. We never change other
  catalogues.
- **pages_show_list** — The seller picks the Facebook Page whose Instagram
  account (Instagram Feed) or WhatsApp number (WhatsApp) their store uses.
- **pages_read_engagement** — For the Page they picked, we read the linked
  Instagram business account and WhatsApp Business account IDs. We don't read
  or post Page content.
- **instagram_basic** — The Instagram Feed app shows the seller's latest
  posts (image, caption, link) in a section on their own store's website,
  refreshed a few times a day.
- **ads_read** — The Facebook Pixel and Meta Ads apps list the seller's ad
  accounts and pixels so they can pick the pixel that tracks visits and
  purchases on their store. We don't create or change ads.
- **whatsapp_business_management** — The WhatsApp app lists the seller's
  WhatsApp numbers and their approved message templates so they can choose
  which to use for order updates.
- **whatsapp_business_messaging** — We send the seller's order confirmations
  and shipping updates, using their approved templates, to their own
  customers who placed an order and gave their number at checkout.
- **public_profile** — We show the seller the name of the Facebook account
  they connected.

## 4. Screencasts (record on a Mac: Cmd+Shift+5 ▸ Record, English UI)

One video can cover several permissions. Show the Facebook login dialog with
the permissions, then each use. Use a test store, not a live customer store.

1. **Connect** (public_profile, business_management, pages_show_list):
   store.oyklane.com ▸ Apps ▸ Facebook & Instagram shop ▸ Connect with Facebook
   ▸ Facebook dialog (show the permission list) ▸ back in Oyklane, the
   connected account name ▸ pick the business.
2. **Catalogue** (catalog_management): pick the catalogue ▸ Sync now ▸ open
   Commerce Manager ▸ show the store's products in that catalogue.
3. **Instagram Feed** (pages_show_list, pages_read_engagement, instagram_basic):
   Apps ▸ Instagram Feed ▸ choose the Page ▸ posts appear in the admin ▸ open
   the store's website ▸ the Instagram section with the same posts.
4. **Pixel** (ads_read): Apps ▸ Facebook Pixel ▸ list of ad accounts/pixels ▸
   pick one ▸ open the store ▸ Meta Pixel Helper shows the pixel firing.
5. **WhatsApp** (whatsapp_business_management, whatsapp_business_messaging):
   Apps ▸ WhatsApp ▸ pick the number ▸ templates listed ▸ place a test order
   on the store with a test phone ▸ the WhatsApp order message arrives on
   that phone.

## 5. Reviewer access

App Review ▸ "Provide test credentials": a store login for the reviewer on a
test store (not Sonchiri), e.g. a dedicated `meta-review@…` owner account,
plus the steps above. Facebook test users can't be used with Login for
Business, so tell reviewers to use their own Facebook account with the test
business assets we add them to — or provide a test Facebook account that
has a role on our test business.

## 6. Until approved

Add each seller who must connect now under **App roles ▸ Roles ▸ Add
people ▸ Testers** (their Facebook profile); they accept at
https://developers.facebook.com/requests. Then login works for them.

## 7. WhatsApp Business Platform setup (12 Oct)

Oyklane now has a full WhatsApp workspace (inbox, templates, broadcasts, WhatsApp steps in Flows). For it to work for sellers, the "Oyklane Connect" app needs:

1. **Webhook** — App dashboard ▸ WhatsApp ▸ Configuration ▸ Webhook ▸ Edit:
   - Callback URL: `https://api.oyklane.com/api/webhooks/meta/whatsapp`
   - Verify token: any long random string; put the same value in Railway `META_WEBHOOK_VERIFY_TOKEN` *before* clicking Verify.
   - Webhook fields ▸ Subscribe: `messages`, `message_template_status_update`, `account_update`, `phone_number_quality_update`.
   - Events are signed with the app secret (`META_APP_SECRET`) and checked by Oyklane.
2. **Embedded Signup** (sellers add and verify a number inside Meta's popup — the way Tech Providers onboard numbers):
   - Facebook Login for Business ▸ Configurations ▸ Create ▸ choose the **WhatsApp Embedded Signup** template, permissions `whatsapp_business_management`, `whatsapp_business_messaging`, `business_management`.
   - Put its ID in Railway `META_WA_SIGNUP_CONFIG_ID`.
   - Facebook Login for Business ▸ Settings: turn on "Login with the JavaScript SDK" and add `store.oyklane.com` to "Allowed domains for the JavaScript SDK".
   - Until this is set, the "Add a WhatsApp number" button stays hidden and sellers add numbers in WhatsApp Manager.
3. **App Review, round two**: `whatsapp_business_management`, `whatsapp_business_messaging`, `ads_management`. Screencast: connect WhatsApp ▸ pick the number ▸ Activate ▸ create a template ▸ reply in the inbox; and for ads: create a campaign in the wizard ▸ publish (paused) ▸ turn on.

### Why a WhatsApp account shows "No number"

The picker now says why. The usual reasons:

- **The account has no phone number yet.** Add one: "Add a WhatsApp number" (Embedded Signup) or WhatsApp Manager ▸ Phone numbers ▸ Add phone number, and verify it with the SMS/call code.
- **The number is in the WhatsApp Business app on a phone.** A number can't be on the app and the API at once, except through Meta's coexistence onboarding: "Use my WhatsApp Business app number" (needs Embedded Signup). Otherwise delete it from the app first.
- **The account wasn't ticked when connecting Facebook.** Meta hides its numbers; reconnect and tick it under WhatsApp accounts.
- After choosing a number, **Activate number** registers it on the Cloud API with the seller's 6-digit two-step PIN and subscribes Oyklane to its messages.

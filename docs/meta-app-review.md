# Meta App Review — Oyklane Store (App ID 1089178333651707)

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
`META_LOGIN_CONFIG_ID` (2153796378538806) must ask for exactly the 9 above.

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

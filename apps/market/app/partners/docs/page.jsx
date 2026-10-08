import Link from "next/link";

export const metadata = { title: "Developer docs", description: "How to build themes and apps for the Oyklane Store." };

const VERIFY = `// Node: check a webhook from Oyklane
import crypto from "crypto";

function fromOyklane(rawBody, signatureHeader, secret) {
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signatureHeader)));
}`;

const INSTALLED = `POST <your install webhook>
X-Oyklane-Event: app.installed
X-Oyklane-Signature: <hex HMAC-SHA256 of the body>

{
  "event": "app.installed",
  "store": { "id": "…", "handle": "sonchiri", "name": "Sonchiri Sweets", "url": "https://…" },
  "apiBase": "https://api.oyklane.com/api/v1",
  "apiKey": "oyk_…",          // only the permissions your listing asked for
  "scopes": ["read_products", "read_orders"],
  "at": "2026-10-08T10:00:00.000Z"
}`;

const LINK = `https://yourapp.com/oyklane?store=sonchiri&ts=1791450000&signature=<hex>
// signature = HMAC-SHA256("store=sonchiri&ts=1791450000", your app secret)
// Refuse links older than 5 minutes.`;

const TREE = `my-theme/
  layout/theme.liquid            required — wraps every page
  templates/index.json           required — the home page's sections
  templates/product.json, collection.json, page.json, …
  sections/*.liquid              each with a {% schema %} for the editor
  snippets/*.liquid
  assets/*.css, *.js, *.svg
  config/settings_schema.json    required — theme settings in the editor
  config/settings_data.json      required — their starting values
  locales/*.json`;

export default function Docs() {
  return (
    <div className="wrap dash narrow" style={{ maxWidth: 860 }}>
      <div>
        <Link className="small muted" href="/partners">
          ← For developers
        </Link>
        <h1 style={{ fontSize: 34, marginTop: 8 }}>Developer docs</h1>
        <p className="muted">Everything you need to list a theme or an app.</p>
      </div>

      <div className="card card--pad stack">
        <h2>Themes</h2>
        <p className="muted">
          Oyklane themes are Liquid — the same shape as Oyklane's own (Classic, Modern, Atelier, Fresh, Lumière). Checkout, cart, account, order and contact pages are
          drawn by the platform, so your theme focuses on the storefront.
        </p>
        <pre>{TREE}</pre>
        <ul className="ticks">
          <li>Upload a .zip of the folder (up to 6 MB unzipped, 512 KB a file). Text files only: .liquid .json .css .js .svg .txt — put images in screenshots, or link them.</li>
          <li>Every Liquid and JSON file is checked when you upload. Problems are listed file by file.</li>
          <li>Your upload shows on our demo store straight away — every page, with real products — so you and our reviewers can click through it.</li>
          <li>Sellers customise it in the visual editor (sections, blocks, colours, fonts). A paid theme's code is locked in their store.</li>
          <li>Versions: upload 1.0.1, 1.1.0… and send each for review. Sellers who bought it can install the new version.</li>
        </ul>
      </div>

      <div className="card card--pad stack">
        <h2>Apps</h2>
        <p className="muted">An app is your own web app. When a store installs it, Oyklane makes an API key for that store with the permissions your listing asks for, and sends it to your install webhook.</p>
        <h3>Install webhook</h3>
        <pre>{INSTALLED}</pre>
        <p className="muted small">
          When it's removed you get <code>app.uninstalled</code> and the key stops working. Use the key with the Oyklane API: <code>Authorization: Bearer oyk_…</code>.
        </p>
        <h3>Checking it's really from Oyklane</h3>
        <pre>{VERIFY}</pre>
        <h3>Opening your app</h3>
        <p className="muted small">Sellers open your app from their Apps page. We send them to your app link with the store and a signature:</p>
        <pre>{LINK}</pre>
        <h3>Storefront script (optional)</h3>
        <p className="muted small">A script URL you give is added to every page of the stores that install your app (never checkout or payment pages). Keep it small and load it async.</p>
        <h3>Pricing</h3>
        <p className="muted small">Free, or a monthly price billed with the seller's Oyklane plan. Your share of every month that's paid goes to your earnings.</p>
      </div>

      <div className="card card--pad stack">
        <h2>Review</h2>
        <ul className="ticks">
          <li>It works on phones and desktops, and every page loads.</li>
          <li>No tracking or scripts the listing doesn't mention; nothing that asks shoppers for payment details.</li>
          <li>Honest description and screenshots.</li>
          <li>For apps: permissions only for what the app does; a support email and a privacy policy.</li>
        </ul>
        <p className="small muted">
          Questions? <a href="mailto:partners@oyklane.com">partners@oyklane.com</a>
        </p>
      </div>
    </div>
  );
}

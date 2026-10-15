import Link from "next/link";
import { APP_URL, DEMO_URL, MARKET_URL } from "./site";

export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer__grid">
          <div>
            <Link href="/" className="logo">
              <span className="logo__mark" aria-hidden="true" />
              Oyklane
            </Link>
            <p className="muted" style={{ marginTop: 14, maxWidth: "34ch", fontSize: 14.5 }}>
              Your own online store, made for selling in India — store, checkout, payments, GST, WhatsApp and ads in one place.
            </p>
          </div>
          <div>
            <h4>Features</h4>
            <ul>
              <li><Link href="/#builder">Store builder</Link></li>
              <li><Link href="/#checkout">One-Click Checkout</Link></li>
              <li><Link href="/#flow">Flow automations</Link></li>
              <li><Link href="/#help">Help assistant</Link></li>
              <li><Link href="/#themes">Themes</Link></li>
            </ul>
          </div>
          <div>
            <h4>Platform</h4>
            <ul>
              <li><Link href="/integrations">Integrations guide</Link></li>
              <li><Link href="/apps">Apps</Link></li>
              <li><a href={MARKET_URL}>Oyklane Store</a></li>
              <li><Link href="/pricing">Pricing</Link></li>
              <li><Link href="/developers">API docs</Link></li>
            </ul>
          </div>
          <div>
            <h4>Sellers</h4>
            <ul>
              <li><a href={`${APP_URL}/register`}>Start a store</a></li>
              <li><a href={`${APP_URL}/login`}>Log in</a></li>
              {DEMO_URL && (
                <li>
                  <a href={DEMO_URL} target="_blank" rel="noopener">Live demo store</a>
                </li>
              )}
              <li><a href={`${APP_URL}/login`}>Help centre</a></li>
            </ul>
          </div>
          <div>
            <h4>Company</h4>
            <ul>
              <li><Link href="/pricing#faq">FAQ</Link></li>
              <li><Link href="/pricing">Plans</Link></li>
              <li><Link href="/privacy">Privacy policy</Link></li>
              <li><Link href="/terms">Terms of service</Link></li>
              <li><Link href="/data-deletion">Data deletion</Link></li>
            </ul>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: "0 0 18px", maxWidth: "90ch" }}>
          Sellers can sign in with Google to show their Google reviews on their store, list their products in Google Merchant Center and set up Google
          Analytics — Oyklane uses that data only for those features. See how in our <Link href="/privacy#google">Privacy Policy</Link>.
        </p>
        <div className="footer__bottom">
          <span>© {new Date().getFullYear()} Oyklane. Made in India.</span>
          <span>
            Prices in INR, plus 18% GST · <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}

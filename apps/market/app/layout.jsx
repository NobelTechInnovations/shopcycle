import "./globals.css";
import Link from "next/link";
import { currentPartner } from "@/lib/api";
import { ADMIN_ORIGIN, MAIN_SITE, SITE_URL } from "@/lib/config";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Oyklane Store — themes and apps for your store", template: "%s · Oyklane Store" },
  description: "Themes and apps for Oyklane stores — free and paid, by Oyklane and independent developers. Preview every page before you install.",
  openGraph: { type: "website", siteName: "Oyklane Store" },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a10" },
  ],
};

export default async function RootLayout({ children }) {
  const partner = await currentPartner();
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Inter:wght@400;500;600;700&display=swap" />
      </head>
      <body>
        <header className="nav">
          <div className="wrap nav__in">
            <Link href="/" className="brand" aria-label="Oyklane Store home">
              <span className="brand__mark" aria-hidden="true">
                <span />
              </span>
              Oyklane <small>Store</small>
            </Link>
            <nav className="nav__links" aria-label="Browse">
              <Link href="/themes">Themes</Link>
              <Link href="/apps">Apps</Link>
              <Link href="/partners">For developers</Link>
            </nav>
            <div className="nav__right">
              <a className="link hide-sm" href={`${ADMIN_ORIGIN}/admin`}>
                Seller login
              </a>
              {partner ? (
                <Link className="btn btn--sm" href="/partners/dashboard">
                  Developer dashboard
                </Link>
              ) : (
                <Link className="btn btn--sm" href="/partners/login">
                  Developer login
                </Link>
              )}
            </div>
          </div>
          <nav className="tabs-sm" aria-label="Browse">
            <Link href="/themes">Themes</Link>
            <Link href="/apps">Apps</Link>
            <Link href="/partners">For developers</Link>
            <a href={`${ADMIN_ORIGIN}/admin`}>Seller login</a>
          </nav>
        </header>
        <main id="main">{children}</main>
        <footer className="footer">
          <div className="wrap spread">
            <p>
              © {new Date().getFullYear()} Oyklane. Themes and apps for <a href={MAIN_SITE}>Oyklane</a> stores.
            </p>
            <div className="row">
              <Link href="/themes">Themes</Link>
              <Link href="/apps">Apps</Link>
              <Link href="/partners">Build for Oyklane</Link>
              <Link href="/partners/docs">Developer docs</Link>
              <a href={`${MAIN_SITE}/terms`}>Terms</a>
              <a href={`${MAIN_SITE}/privacy`}>Privacy</a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}

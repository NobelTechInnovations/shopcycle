import "./globals.css";
import { SiteNav } from "./components/SiteNav";
import { SiteFooter } from "./components/SiteFooter";
import { Reveal } from "./components/Reveal";

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://oyklane.com"),
  title: {
    default: "Oyklane — Build the store. Grow the brand.",
    template: "%s · Oyklane",
  },
  description:
    "Oyklane is the commerce platform for Indian brands: a store you design without code, One-Click Checkout, UPI and cash on delivery, GST invoices, automated customer emails and an app store — live in an afternoon.",
  openGraph: {
    title: "Oyklane — Build the store. Grow the brand.",
    description: "Storefront, One-Click Checkout, payments, GST and growth apps for Indian brands.",
    images: ["/showcase/atelier.webp"],
    type: "website",
  },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaff" },
    { media: "(prefers-color-scheme: dark)", color: "#07070c" },
  ],
  colorScheme: "dark light",
};

// A fixed script (no user data): the visitor's saved theme, else their system's.
const THEME_SCRIPT =
  "(function(){var d=document.documentElement;d.classList.add('js');var t;try{t=localStorage.getItem('oy-theme')}catch(e){}" +
  "if(t!=='light'&&t!=='dark'){t=window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}d.dataset.theme=t})()";

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Before paint: the saved (or system) theme, and "JS is on" so
            sections can fade in on scroll without a flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&family=Inter:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <SiteNav />
        <main id="main">{children}</main>
        <SiteFooter />
        <Reveal />
      </body>
    </html>
  );
}

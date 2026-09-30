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

export const viewport = { themeColor: "#07070c", colorScheme: "dark" };

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Sections fade in on scroll; mark JS early so nothing flashes. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
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

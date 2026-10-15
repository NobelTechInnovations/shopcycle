import "./globals.css";
import { SiteNav } from "./components/SiteNav";
import { SiteFooter } from "./components/SiteFooter";
import { Reveal } from "./components/Reveal";

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://oyklane.com"),
  title: {
    default: "Oyklane — Your online store, made for selling in India",
    template: "%s · Oyklane",
  },
  description:
    "Oyklane is the commerce platform for Indian brands: a store you design without code, One-Click Checkout, UPI and cash on delivery, GST invoices, automated customer emails and an app store — live in an afternoon.",
  // Google Search Console's "HTML tag" ownership check (Google Cloud's
  // OAuth branding needs oyklane.com verified). Set the code on Vercel.
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION && { verification: { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } }),
  openGraph: {
    title: "Oyklane — Your online store, made for selling in India",
    description: "Storefront, One-Click Checkout, payments, GST and growth apps for Indian brands.",
    images: ["/showcase/atelier.webp"],
    type: "website",
  },
};

export const viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Plus Jakarta Sans for everything (docs/brand-guidelines.md). */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" />
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

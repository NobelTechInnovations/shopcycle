import "./globals.css";

export const metadata = {
  title: "Oyklane — Launch a store that sells",
  description:
    "Oyklane is the commerce platform for Indian brands: beautiful themes, cash on delivery and five payment gateways, GST invoices, reviews and a no-code editor — live in an afternoon.",
  openGraph: {
    title: "Oyklane — Launch a store that sells",
    description: "Themes, payments, COD, GST invoices, reviews and a no-code editor for Indian brands.",
    images: ["/showcase/atelier.webp"],
    type: "website",
  },
};

export const viewport = { themeColor: "#ffffff" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&family=Inter:wght@400;500;600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

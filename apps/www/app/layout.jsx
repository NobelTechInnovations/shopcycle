import "./globals.css";

export const metadata = {
  title: "Oyklane — Build your store. Sell everywhere.",
  description: "The commerce platform to launch, design, and grow your online store — no code required.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

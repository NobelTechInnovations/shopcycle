import { Inter } from "next/font/google";
import { AntdProvider } from "@shopcycle/ui";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata = {
  title: "ShopCycle Admin",
  description: "Store administration",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">
        <AntdProvider>{children}</AntdProvider>
      </body>
    </html>
  );
}

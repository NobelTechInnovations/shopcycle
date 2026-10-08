import { SITE_URL } from "@/lib/config";

export default function robots() {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/partners/dashboard", "/partners/listings", "/partners/account", "/api/"] }], sitemap: `${SITE_URL}/sitemap.xml` };
}

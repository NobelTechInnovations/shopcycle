const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://oyklane.com").replace(/\/$/, "");

/** oyklane.com's pages, for search engines. */
export default function sitemap() {
  const pages = [
    ["", 1, "weekly"],
    ["/pricing", 0.9, "weekly"],
    ["/apps", 0.8, "weekly"],
    ["/integrations", 0.8, "weekly"],
    ["/privacy", 0.3, "yearly"],
    ["/terms", 0.3, "yearly"],
    ["/data-deletion", 0.2, "yearly"],
  ];
  return pages.map(([path, priority, changeFrequency]) => ({ url: `${SITE}${path}`, lastModified: new Date(), changeFrequency, priority }));
}

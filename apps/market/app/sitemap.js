import { api } from "@/lib/api";
import { SITE_URL } from "@/lib/config";

export default async function sitemap() {
  const data = await api("/api/market/public/browse").catch(() => ({ items: [] }));
  return [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/themes`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/apps`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/partners`, changeFrequency: "monthly", priority: 0.5 },
    ...data.items.map((i) => ({ url: `${SITE_URL}/${i.kind}s/${i.slug}`, changeFrequency: "weekly", priority: 0.7 })),
  ];
}

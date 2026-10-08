import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { Detail } from "../../components/Detail";

async function load(slug) {
  try {
    return await api(`/api/market/public/theme/${encodeURIComponent(slug)}`);
  } catch (err) {
    if (err.status === 404) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const data = await load(slug);
  return { title: `${data.item.name} theme`, description: data.item.tagline || data.item.description?.slice(0, 160), openGraph: data.item.screenshots?.[0] ? { images: [data.item.screenshots[0]] } : undefined };
}

export default async function ThemePage({ params }) {
  const { slug } = await params;
  const data = await load(slug);
  return <Detail item={data.item} preview={data.preview} />;
}

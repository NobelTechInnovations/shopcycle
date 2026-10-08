import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { Detail } from "../../components/Detail";

async function load(slug) {
  try {
    return await api(`/api/market/public/app/${encodeURIComponent(slug)}`);
  } catch (err) {
    if (err.status === 404) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const data = await load(slug);
  return { title: data.item.name, description: data.item.tagline || data.item.description?.slice(0, 160) };
}

export default async function AppPage({ params }) {
  const { slug } = await params;
  const data = await load(slug);
  return <Detail item={data.item} preview={null} />;
}

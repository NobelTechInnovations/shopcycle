import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { getUrl, inr } from "@/lib/config";
import { PreviewFrame } from "../../../components/PreviewFrame";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  return { title: `Preview ${slug}`, robots: { index: false } };
}

export default async function PreviewPage({ params }) {
  const { slug } = await params;
  let data;
  try {
    data = await api(`/api/market/public/theme/${encodeURIComponent(slug)}`, { revalidate: 30 });
  } catch (err) {
    if (err.status === 404) notFound();
    throw err;
  }
  if (!data.preview) notFound();
  return (
    <PreviewFrame
      name={data.item.name}
      slug={slug}
      base={data.preview.base}
      themeId={data.preview.themeId}
      pages={data.pages}
      getHref={getUrl("theme", slug)}
      getLabel={data.item.free ? "Add to my store" : `Buy ${inr(data.item.price)}`}
    />
  );
}

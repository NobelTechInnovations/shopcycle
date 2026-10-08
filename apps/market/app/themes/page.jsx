import { Browse } from "../components/Browse";

export const metadata = { title: "Themes", description: "Themes for Oyklane stores — free and paid. Preview every page with real products before installing." };

export default function ThemesPage({ searchParams }) {
  return <Browse kind="theme" base="/themes" searchParams={searchParams} title="Themes" intro="Every theme previews with real products — open one and click through its pages." />;
}

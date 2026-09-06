import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/api";
import { EditorView } from "./EditorView";

// This route intentionally lives outside app/admin/ (and its Sidebar +
// Topbar layout) — the editor needs the full viewport width for its
// 3-pane layout, which a persistent 240px admin sidebar makes cramped on
// anything smaller than a large desktop. Real theme editors (Shopify
// included) take over the whole screen for exactly this reason. Since
// that means this route doesn't inherit app/admin/layout.jsx's auth
// guard, it re-checks auth here.
export default async function ThemeEditorPage({ params }) {
  const { themeId } = await params;

  try {
    await serverApiFetch("/api/auth/me");
  } catch {
    redirect("/login");
  }

  const { theme } = await serverApiFetch(`/api/themes/${themeId}`);
  return <EditorView theme={theme} />;
}

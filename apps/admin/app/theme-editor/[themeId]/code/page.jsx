import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/api";
import { CodeEditorView } from "./CodeEditorView";

// Fullscreen, outside app/admin/ — same reasoning as the visual editor
// (theme-editor/[themeId]/page.jsx): a file tree + Monaco + live preview
// needs the width a persistent 240px admin sidebar takes away.
export default async function ThemeCodeEditorPage({ params }) {
  const { themeId } = await params;

  try {
    await serverApiFetch("/api/auth/me");
  } catch {
    redirect("/login");
  }

  const { theme } = await serverApiFetch(`/api/themes/${themeId}`);
  // A paid Oyklane Store theme's code is the developer's (and locked).
  if (theme.locked) redirect(`/theme-editor/${themeId}`);
  return <CodeEditorView theme={theme} />;
}

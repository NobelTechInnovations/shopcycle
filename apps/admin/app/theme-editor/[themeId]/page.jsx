import Link from "next/link";
import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/api";
import { EditorView } from "./EditorView";

// This route intentionally lives outside app/admin/ (and its Sidebar +
// Topbar layout) — the editor needs the full viewport width for its
// 3-pane layout. Since that means this route doesn't inherit
// app/admin/layout.jsx's auth guard, it re-checks auth here.
export default async function ThemeEditorPage({ params }) {
  const { themeId } = await params;

  let signedIn = true;
  try {
    await serverApiFetch("/api/auth/me");
  } catch {
    signedIn = false;
  }
  if (!signedIn) redirect("/login");

  // A theme that can't be loaded gets an explanation, not a crashed page:
  // most often it belongs to another of the merchant's stores (the session
  // is on one store at a time) or was deleted.
  let theme = null;
  let platform = null;
  let problem = null;
  try {
    ({ theme, platform } = await serverApiFetch(`/api/themes/${themeId}`));
  } catch (err) {
    problem =
      err.status === 404
        ? "This theme isn't in the store you're signed in to — it may belong to another of your stores, or it was deleted."
        : `The theme couldn't be loaded (${err.message || "server error"}). Try again in a moment.`;
  }
  if (!theme) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app-bg p-6">
        <div className="max-w-md w-full bg-app-surface border border-app-border rounded-xl p-6 text-center">
          <h1 className="text-lg font-semibold text-ink m-0">Can't open the theme editor</h1>
          <p className="text-sm text-ink-muted mt-2 mb-5">{problem}</p>
          <Link href="/admin/online-store/themes" className="inline-flex items-center h-9 px-4 rounded-md bg-[#111114] text-white text-sm font-medium no-underline">
            Back to Themes
          </Link>
        </div>
      </div>
    );
  }
  return <EditorView theme={theme} platform={platform} />;
}

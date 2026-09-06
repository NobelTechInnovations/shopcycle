import { redirect } from "next/navigation";

// The code editor now lives at /theme-editor/:themeId/code — fullscreen,
// outside the admin shell (same reasoning as the visual editor). This
// redirect exists only so an old bookmark/link to this URL still works.
export default async function LegacyCodeEditorRedirect({ params }) {
  const { themeId } = await params;
  redirect(`/theme-editor/${themeId}/code`);
}

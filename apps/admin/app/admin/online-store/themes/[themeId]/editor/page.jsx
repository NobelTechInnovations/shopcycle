import { redirect } from "next/navigation";

// The editor now lives at /theme-editor/:themeId — a fullscreen route
// outside the admin shell (see that route's page.jsx for why). This
// redirect exists only so an old bookmark/link to this URL still works.
export default async function LegacyEditorRedirect({ params }) {
  const { themeId } = await params;
  redirect(`/theme-editor/${themeId}`);
}

import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/api";

/** Already signed in to a store: straight to the dashboard instead of the form. */
export default async function LoginLayout({ children }) {
  let me = null;
  try {
    me = await serverApiFetch("/api/auth/me");
  } catch {
    // Not signed in (or the session ended) — show the form.
  }
  if (me?.store) redirect("/admin");
  return children;
}

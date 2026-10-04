import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/api";

export default async function RootPage() {
  let authed = false;
  try {
    await serverApiFetch("/api/auth/me");
    authed = true;
  } catch {
    authed = false;
  }
  // redirect() throws internally — it must not run inside the try/catch
  // above, or its own control-flow "error" gets swallowed as a failure.
  redirect(authed ? "/admin" : "/login");
}

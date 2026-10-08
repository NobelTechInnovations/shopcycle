import Link from "next/link";
import { redirect } from "next/navigation";
import { currentPartner } from "@/lib/api";
import { SignUpForm } from "../forms";

export const metadata = { title: "Create a developer account" };

export default async function SignUp() {
  if (await currentPartner()) redirect("/partners/dashboard");
  return (
    <div className="auth">
      <div className="card stack">
        <h1 style={{ fontSize: 26 }}>Create a developer account</h1>
        <p className="muted small">For building themes and apps. Selling on Oyklane? Your store's login is at store.oyklane.com.</p>
        <SignUpForm />
        <p className="small muted">
          Already have one? <Link href="/partners/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

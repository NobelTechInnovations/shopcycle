import Link from "next/link";
import { redirect } from "next/navigation";
import { currentPartner } from "@/lib/api";
import { ADMIN_ORIGIN } from "@/lib/config";
import { SignInForm } from "../forms";

export const metadata = { title: "Developer sign in" };

export default async function SignIn({ searchParams }) {
  if (await currentPartner()) redirect("/partners/dashboard");
  const { next } = await searchParams;
  return (
    <div className="auth">
      <div className="card stack">
        <h1 style={{ fontSize: 26 }}>Developer sign in</h1>
        <SignInForm next={next} />
        <p className="small muted">
          New here? <Link href="/partners/signup">Create a developer account</Link>
        </p>
        <p className="small subtle">
          Selling on Oyklane? <a href={`${ADMIN_ORIGIN}/admin`}>Sign in to your store</a> — you buy and install from there.
        </p>
      </div>
    </div>
  );
}

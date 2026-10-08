import Link from "next/link";
import { requirePartner } from "@/lib/partner";
import { ProfileForm } from "../forms";
import { signOutEverywhere } from "../actions";

export const metadata = { title: "Account & payouts", robots: { index: false } };

export default async function Account() {
  const partner = await requirePartner("/partners/account");
  return (
    <div className="wrap dash narrow">
      <div>
        <Link className="small muted" href="/partners/dashboard">
          ← Dashboard
        </Link>
        <h1 style={{ fontSize: 30, marginTop: 8 }}>Account & payouts</h1>
        <p className="muted">{partner.email}</p>
      </div>
      <div className="card card--pad">
        <ProfileForm partner={partner} />
      </div>
      <div className="card card--pad stack">
        <h3>Security</h3>
        <p className="small muted">Signed in somewhere you shouldn't be? This signs you out on every device.</p>
        <form action={signOutEverywhere}>
          <button className="btn btn--sm">Sign out everywhere</button>
        </form>
      </div>
    </div>
  );
}

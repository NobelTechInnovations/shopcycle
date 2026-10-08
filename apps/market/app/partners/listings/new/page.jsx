import Link from "next/link";
import { api } from "@/lib/api";
import { requirePartner } from "@/lib/partner";
import { ListingForm } from "../../forms";

export const metadata = { title: "New listing", robots: { index: false } };

export default async function NewListing({ searchParams }) {
  await requirePartner("/partners/listings/new");
  const { kind: k } = await searchParams;
  const kind = k === "app" ? "app" : "theme";
  const data = await api("/api/partners/overview", { auth: true });
  return (
    <div className="wrap dash narrow">
      <div>
        <Link className="small muted" href="/partners/dashboard">
          ← Dashboard
        </Link>
        <h1 style={{ fontSize: 30, marginTop: 8 }}>New {kind}</h1>
        <p className="muted">Start with the basics — you upload {kind === "theme" ? "the theme" : "releases"} next.</p>
      </div>
      <div className="card card--pad">
        <ListingForm kind={kind} categories={data.categories} scopes={data.scopes} />
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { requirePartner, STATUS } from "@/lib/partner";
import { ListingForm, VersionUpload, SubmitForReview, SecretBox } from "../../forms";

export const metadata = { title: "Listing", robots: { index: false } };

const day = (d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const bump = (v) => {
  const [a, b, c] = String(v || "0.9.9").split(".").map(Number);
  return `${a}.${b}.${(c || 0) + 1}`;
};
const VSTATUS = { draft: ["Not sent", ""], in_review: ["In review", "badge--amber"], approved: ["Live", "badge--green"], rejected: ["Changes needed", "badge--red"] };

export default async function ListingPage({ params, searchParams }) {
  const { id } = await params;
  const { created } = await searchParams;
  await requirePartner(`/partners/listings/${id}`);
  const overview = await api("/api/partners/overview", { auth: true });
  const listing = overview.listings.find((l) => l.id === id);
  if (!listing) notFound();
  const { versions, preview, pages } = await api(`/api/partners/listings/${id}/versions`, { auth: true });
  const latest = versions[0];
  const status = STATUS[listing.status] || [listing.status, ""];
  const canSubmit = latest && ["draft", "rejected"].includes(latest.status);
  return (
    <div className="wrap dash narrow" style={{ maxWidth: 900 }}>
      <div>
        <Link className="small muted" href="/partners/dashboard">
          ← Dashboard
        </Link>
        <div className="spread" style={{ marginTop: 8 }}>
          <h1 style={{ fontSize: 30 }}>{listing.name}</h1>
          <span className={`badge ${status[1]}`} style={{ fontSize: 13 }}>
            {status[0]}
          </span>
        </div>
        {listing.status === "approved" && (
          <p className="small muted" style={{ marginTop: 6 }}>
            Live at <Link href={`/${listing.kind}s/${listing.slug}`}>oyklanestore.com/{listing.kind}s/{listing.slug}</Link>
          </p>
        )}
      </div>

      {created && <div className="alert alert--ok">Created. Next: {listing.kind === "theme" ? "upload the theme's .zip below" : "add a release below"}, then send it for review.</div>}
      {listing.reviewNote && (
        <div className={`alert ${listing.status === "rejected" ? "alert--error" : "alert--info"}`}>
          <b>Note from Oyklane review:</b> {listing.reviewNote}
        </div>
      )}

      <div className="card card--pad stack">
        <div className="spread">
          <h2 style={{ fontSize: 20 }}>{listing.kind === "theme" ? "Theme files" : "Releases"}</h2>
          {preview && (
            <a className="btn btn--sm" href={`${preview.base}/?themeId=${preview.themeId}`} target="_blank" rel="noopener noreferrer">
              Preview latest upload ↗
            </a>
          )}
        </div>
        {preview && pages.length > 0 && (
          <p className="small muted">
            Preview pages:{" "}
            {pages.map((p, i) => (
              <span key={p.key}>
                {i > 0 && " · "}
                <a href={`${preview.base}${p.path}${p.path.includes("?") ? "&" : "?"}themeId=${preview.themeId}`} target="_blank" rel="noopener noreferrer">
                  {p.label}
                </a>
              </span>
            ))}
          </p>
        )}
        {versions.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Uploaded</th>
                  <th>Status</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <b>{v.version}</b>
                      {v.size ? <span className="subtle small"> · {Math.round(v.size / 1024)} KB</span> : null}
                    </td>
                    <td>{day(v.createdAt)}</td>
                    <td>
                      <span className={`badge ${VSTATUS[v.status]?.[1] || ""}`}>{VSTATUS[v.status]?.[0] || v.status}</span>
                    </td>
                    <td className="small muted">{v.reviewNote || v.changelog || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <VersionUpload listingId={listing.id} kind={listing.kind} nextVersion={latest ? bump(latest.version) : "1.0.0"} />
        {canSubmit && <SubmitForReview id={listing.id} disabled={listing.status === "approved"} />}
        {latest?.status === "in_review" && <p className="small muted">Version {latest.version} is with our review team.</p>}
      </div>

      <div className="card card--pad">
        <h2 style={{ fontSize: 20, marginBottom: 16 }}>Listing</h2>
        <ListingForm listing={listing} categories={overview.categories} scopes={overview.scopes} />
      </div>

      {listing.kind === "app" && (
        <div className="card card--pad stack">
          <h2 style={{ fontSize: 20 }}>App secret</h2>
          <SecretBox id={listing.id} />
        </div>
      )}
    </div>
  );
}

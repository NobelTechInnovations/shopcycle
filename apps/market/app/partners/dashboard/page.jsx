import Link from "next/link";
import { api } from "@/lib/api";
import { inr } from "@/lib/config";
import { requirePartner, STATUS } from "@/lib/partner";
import { signOut } from "../actions";

export const metadata = { title: "Developer dashboard", robots: { index: false } };

const day = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");

export default async function Dashboard() {
  const partner = await requirePartner("/partners/dashboard");
  const data = await api("/api/partners/overview", { auth: true });
  const e = data.earnings;
  return (
    <div className="wrap dash">
      <div className="spread">
        <div>
          <h1 style={{ fontSize: 32 }}>Hi, {partner.name.split(" ")[0]}</h1>
          <p className="muted">Your themes and apps on the Oyklane Store.</p>
        </div>
        <div className="row">
          <Link className="btn" href="/partners/account">
            Account & payouts
          </Link>
          <Link className="btn btn--accent" href="/partners/listings/new?kind=theme">
            + New theme
          </Link>
          <Link className="btn btn--accent" href="/partners/listings/new?kind=app">
            + New app
          </Link>
        </div>
      </div>

      {!partner.payoutUpi && (
        <div className="alert alert--info">
          Add your payout UPI ID in <Link href="/partners/account">Account</Link> before listing something paid.
        </div>
      )}

      <div className="stats">
        <div className="card stat">
          <span className="small muted">Owed to you</span>
          <b>{inr(e.owed)}</b>
        </div>
        <div className="card stat">
          <span className="small muted">Earned so far</span>
          <b>{inr(e.lifetime)}</b>
        </div>
        <div className="card stat">
          <span className="small muted">Sales</span>
          <b>{e.sales}</b>
        </div>
        <div className="card stat">
          <span className="small muted">Your share</span>
          <b>{Math.round(e.share * 100)}%</b>
        </div>
      </div>

      <div className="card">
        <div className="spread" style={{ padding: "16px 18px", borderBottom: "1px solid var(--line)" }}>
          <h2 style={{ fontSize: 20 }}>Listings</h2>
        </div>
        {data.listings.length === 0 ? (
          <div className="empty" style={{ margin: 18 }}>
            Nothing yet. Start with a <Link href="/partners/listings/new?kind=theme">theme</Link> or an <Link href="/partners/listings/new?kind=app">app</Link>.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Price</th>
                  <th>Installs</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.listings.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/partners/listings/${l.id}`} style={{ fontWeight: 600, textDecoration: "none" }}>
                        {l.name}
                      </Link>
                    </td>
                    <td>{l.kind === "theme" ? "Theme" : "App"}</td>
                    <td>
                      <span className={`badge ${STATUS[l.status]?.[1] || ""}`}>{STATUS[l.status]?.[0] || l.status}</span>
                    </td>
                    <td>{l.free ? "Free" : `${inr(l.price)}${l.kind === "app" ? "/mo" : ""}`}</td>
                    <td>{l.installs}</td>
                    <td style={{ textAlign: "right" }}>
                      <Link className="btn btn--sm" href={`/partners/listings/${l.id}`}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--line)" }}>
          <h2 style={{ fontSize: 20 }}>Earnings</h2>
        </div>
        {e.recent.length === 0 ? (
          <p className="muted" style={{ padding: 18 }}>
            Sales show up here — your share of each, and when it's paid to you.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>For</th>
                  <th>Sale</th>
                  <th>Your share</th>
                  <th>Paid out</th>
                </tr>
              </thead>
              <tbody>
                {e.recent.map((r) => (
                  <tr key={r.id}>
                    <td>{day(r.createdAt)}</td>
                    <td>{data.listings.find((l) => l.id === r.listingId)?.name || "—"} · {r.source === "theme_sale" ? "theme sale" : "app month"}</td>
                    <td>{inr(r.gross)}</td>
                    <td>{inr(r.share)}</td>
                    <td>{r.paid ? <span className="badge badge--green">Paid</span> : <span className="badge">Owed</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <form action={signOut}>
        <button className="btn btn--ghost btn--sm">Sign out</button>
      </form>
    </div>
  );
}

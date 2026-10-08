import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap" style={{ padding: "96px 20px", textAlign: "center" }}>
      <h1 style={{ fontSize: 34 }}>Not found</h1>
      <p className="muted" style={{ marginTop: 8 }}>This theme or app isn't on the Oyklane Store (any more).</p>
      <div className="row" style={{ justifyContent: "center", marginTop: 20 }}>
        <Link className="btn btn--primary" href="/themes">
          Browse themes
        </Link>
        <Link className="btn" href="/apps">
          Browse apps
        </Link>
      </div>
    </div>
  );
}

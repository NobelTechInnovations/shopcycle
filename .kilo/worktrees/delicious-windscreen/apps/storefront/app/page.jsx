// Shown for an address that isn't any store's (an unknown subdomain, or a
// domain nobody has connected). Deliberately says nothing about how the
// platform is hosted.
export const metadata = { title: "Store not found", robots: { index: false } };

export default function RootPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
        background: "#f7f7f8",
        color: "#111114",
        padding: 24,
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>This store isn't available</h1>
        <p style={{ color: "#6b6b76", margin: 0, lineHeight: 1.6 }}>
          There's no store at this address. Check the link, or contact the business you were trying to reach.
        </p>
      </div>
    </main>
  );
}

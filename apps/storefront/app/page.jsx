export default function RootPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        background: "#f6f6f7",
        color: "#1a1a1a",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <h1 style={{ fontSize: 22 }}>ShopCycle Storefront</h1>
        <p style={{ color: "#6b7280" }}>
          This app serves individual stores at <code>/store/&lt;handle&gt;</code> — there's no
          storefront at the root since this is a multi-tenant platform.
        </p>
      </div>
    </div>
  );
}

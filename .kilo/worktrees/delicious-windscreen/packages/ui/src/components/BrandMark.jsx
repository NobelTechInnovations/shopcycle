"use client";

/**
 * The Oyklane logo — the same violet→teal gradient mark apps/www uses in
 * its nav and footer, so the marketing site, seller admin, and platform
 * admin all read as one product. `tone="dark"` is for placement on a dark
 * surface (auth brand panel, super-admin); `label` adds a small product
 * suffix ("Admin", "Platform") after the wordmark.
 */
export function BrandMark({ size = 26, tone = "light", label, showWordmark = true }) {
  const text = tone === "dark" ? "#F5F5F4" : "#111114";
  const sub = tone === "dark" ? "rgba(245,245,244,0.55)" : "#9A9AA5";
  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <span
        aria-hidden="true"
        className="relative inline-block shrink-0 overflow-hidden"
        style={{
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.3),
          background: "linear-gradient(135deg, #7C5CFF 0%, #2DD4BF 100%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25)",
        }}
      >
        {/* The "O" — a ring cut into the mark, legible at every size. */}
        <span
          className="absolute rounded-full"
          style={{
            inset: Math.round(size * 0.26),
            border: `${Math.max(2, Math.round(size * 0.1))}px solid rgba(255,255,255,0.92)`,
          }}
        />
      </span>
      {showWordmark && (
        <span className="flex items-baseline gap-1.5 leading-none">
          <span style={{ color: text, fontWeight: 650, fontSize: Math.round(size * 0.62), letterSpacing: "-0.02em" }}>
            Oyklane
          </span>
          {label && (
            <span style={{ color: sub, fontWeight: 500, fontSize: Math.round(size * 0.46) }}>{label}</span>
          )}
        </span>
      )}
    </span>
  );
}

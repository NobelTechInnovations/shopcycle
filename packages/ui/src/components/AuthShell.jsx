"use client";

import { BrandMark } from "./BrandMark";

// Serif for the one big heading; the form keeps the app's sans.
const SERIF_HREF = "https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap";
const SERIF = '"Newsreader", "Iowan Old Style", Georgia, serif';

const PHOTOS = {
  // Unsplash License — Aninge Fetzer.
  packing: { src: "/auth/packing.webp", alt: "A seller packing orders into kraft gift bags", credit: "Aninge Fetzer / Unsplash" },
  bags: { src: "/auth/bags.webp", alt: "Gift bags with tissue paper, ready to ship", credit: "Aninge Fetzer / Unsplash" },
};

/**
 * Split-screen sign-in layout shared by the seller admin (login, sign-up,
 * password pages) and the platform admin: the form on a clean white half
 * with the logo top-left and one serif heading, and a full-bleed photo of
 * selling — orders being packed — on the other half (hidden on phones).
 * `photo`: "packing" | "bags". `note`: small print at the bottom.
 * `homeHref`: where the logo goes (the marketing site, for sellers).
 */
export function AuthShell({ variant = "seller", title, subtitle, children, footer, homeHref, photo = "packing", note }) {
  const isPlatform = variant === "platform";
  const pic = PHOTOS[photo] || PHOTOS.packing;
  const logo = <BrandMark size={28} label={isPlatform ? "Platform" : undefined} />;

  return (
    <div className="oy-auth min-h-screen flex bg-white">
      <link rel="stylesheet" href={SERIF_HREF} precedence="default" />
      <main className="flex-1 lg:w-1/2 lg:flex-none flex flex-col min-h-screen px-5 sm:px-8 py-6">
        <header>
          {homeHref ? (
            <a href={homeHref} aria-label="Oyklane home" className="inline-block">
              {logo}
            </a>
          ) : (
            logo
          )}
        </header>

        <div className="flex-1 flex items-center justify-center py-10">
          <div className="w-full max-w-[440px]">
            <h1 className="m-0 text-center text-ink" style={{ fontFamily: SERIF, fontWeight: 400, fontSize: "clamp(34px, 4.2vw, 46px)", lineHeight: 1.08, letterSpacing: "-0.02em" }}>
              {title}
            </h1>
            {subtitle && <p className="text-[15px] text-ink-muted text-center mt-3 mb-0">{subtitle}</p>}
            <div className="mt-9">{children}</div>
            {footer && <div className="mt-7 text-[14px] text-ink-muted text-center">{footer}</div>}
          </div>
        </div>

        {note && <p className="w-full max-w-[440px] mx-auto text-[12.5px] leading-relaxed text-ink-muted m-0">{note}</p>}
      </main>

      <aside className="hidden lg:block lg:w-1/2 relative overflow-hidden bg-[#EFE7DC]">
        <img src={pic.src} alt={pic.alt} className="absolute inset-0 h-full w-full object-cover" />
        {!isPlatform && (
          <div className="absolute left-8 bottom-8 flex items-center gap-3 rounded-2xl bg-white/90 px-4 py-3 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.45)] backdrop-blur" aria-hidden="true">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E5F1FB] text-[#0078d4]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 8h14l-1.2 12.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8z" />
                <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
              </svg>
            </span>
            <span className="flex flex-col">
              <span className="text-[13px] font-semibold text-ink">New order #1042 · ₹1,299</span>
              <span className="text-[12px] text-ink-muted">Paid by UPI · ships today</span>
            </span>
          </div>
        )}
        <span className="absolute right-4 bottom-3 text-[11px] text-white/70">{pic.credit}</span>
      </aside>
    </div>
  );
}

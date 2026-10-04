"use client";

import { Check } from "lucide-react";
import { BrandMark } from "./BrandMark";

const PANELS = {
  seller: {
    headline: "Build your store.\nSell everywhere.",
    points: [
      "Your own storefront live on a free oyklane.com address",
      "Themes you can customize without touching code",
      "Orders, customers, and payments in one place",
    ],
  },
  platform: {
    headline: "The control room\nfor Oyklane.",
    points: [
      "Every store, plan, and app on the platform",
      "A separate session — never shared with seller accounts",
      "Billing health and access control in one view",
    ],
  },
};

/**
 * Split-screen sign-in layout shared by the seller admin (login/register)
 * and the platform admin. Left: a dark brand panel with the same
 * gradient-glow language as apps/www, so signing in feels like the same
 * product the marketing site promised. Right: the form itself, on a
 * clean surface. The brand panel is hidden below `lg` — on a phone the
 * form is all anyone needs.
 */
export function AuthShell({ variant = "seller", title, subtitle, children, footer }) {
  const panel = PANELS[variant] || PANELS.seller;
  const isPlatform = variant === "platform";

  return (
    <div className="min-h-screen flex bg-app-surface">
      <aside
        className="hidden lg:flex lg:w-[46%] xl:w-[42%] relative overflow-hidden flex-col justify-between p-12"
        style={{ background: "#07070A" }}
      >
        {/* Brand glow — the two gradient endpoints as soft light sources. */}
        <div
          aria-hidden="true"
          className="absolute -top-40 -left-32 w-[520px] h-[520px] rounded-full"
          style={{ background: "radial-gradient(closest-side, rgba(124,92,255,0.38), transparent)" }}
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-48 -right-40 w-[560px] h-[560px] rounded-full"
          style={{ background: "radial-gradient(closest-side, rgba(45,212,191,0.22), transparent)" }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(ellipse at 30% 40%, black, transparent 70%)",
            WebkitMaskImage: "radial-gradient(ellipse at 30% 40%, black, transparent 70%)",
          }}
        />

        <div className="relative">
          <BrandMark size={30} tone="dark" label={isPlatform ? "Platform" : undefined} />
        </div>

        <div className="relative max-w-md">
          <h2
            className="text-[40px] leading-[1.08] font-semibold m-0 whitespace-pre-line"
            style={{ color: "#F5F5F4", letterSpacing: "-0.03em" }}
          >
            {panel.headline}
          </h2>
          <ul className="list-none p-0 mt-8 mb-0 flex flex-col gap-3.5">
            {panel.points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-[15px]" style={{ color: "rgba(245,245,244,0.72)" }}>
                <span
                  className="mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full shrink-0"
                  style={{ background: "rgba(124,92,255,0.18)", color: "#B7A6FF" }}
                >
                  <Check size={12} strokeWidth={3} aria-hidden="true" />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs m-0" style={{ color: "rgba(245,245,244,0.4)" }}>
          © {new Date().getFullYear()} Oyklane
        </p>
      </aside>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[380px]">
          <div className="lg:hidden mb-10">
            <BrandMark size={28} label={isPlatform ? "Platform" : undefined} />
          </div>
          <h1 className="text-[26px] font-semibold text-ink m-0" style={{ letterSpacing: "-0.02em" }}>
            {title}
          </h1>
          {subtitle && <p className="text-[15px] text-ink-muted mt-2 mb-0">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-sm text-ink-muted text-center">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

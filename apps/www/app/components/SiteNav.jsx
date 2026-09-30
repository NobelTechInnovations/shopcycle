"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, I } from "./Icon";
import { APP_URL } from "./site";

const FEATURES = [
  { href: "/#builder", icon: I.store, title: "Store builder", text: "Four themes, drag-and-drop sections, no code." },
  { href: "/#checkout", icon: I.bolt, title: "One-Click Checkout", text: "Phone, code, saved address, pay — in a popup." },
  { href: "/#flow", icon: I.flow, title: "Flow automations", text: "Emails that send themselves after every order." },
  { href: "/#help", icon: I.life, title: "Help in seconds", text: "An assistant that knows your store, then real people." },
  { href: "/#more", icon: I.receipt, title: "GST, COD & payments", text: "Five gateways, cash on delivery, tax invoices." },
  { href: "/apps", icon: I.puzzle, title: "App store", text: "Phone Login, reviews, pixels and more." },
];

/** The top bar: logo, a Features menu, the inner pages and sign-up.
 * Below 1080px the links fold into a full-screen menu. */
export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  const cur = (href) => (pathname === href ? "page" : undefined);

  // Light or dark, remembered on this device (layout.jsx applies it before paint).
  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("oy-theme", next);
    } catch {}
  }

  return (
    <header className="nav">
      <a href="#main" className="skip">
        Skip to content
      </a>
      <div className="wrap nav__inner">
        <Link href="/" className="logo" aria-label="Oyklane home">
          <span className="logo__mark" aria-hidden="true" />
          Oyklane
        </Link>
        <nav aria-label="Main">
          <ul className="nav__links">
            <li className="has-menu">
              <button type="button" className="nav__link" aria-haspopup="true">
                Features <Icon d={I.chevron} />
              </button>
              <div className="nav__menu" role="menu">
                {FEATURES.map((f) => (
                  <Link key={f.title} href={f.href} className="menu-item" role="menuitem">
                    <span className="menu-item__icon">
                      <Icon d={f.icon} />
                    </span>
                    <span className="menu-item__text">
                      <b>{f.title}</b>
                      <small>{f.text}</small>
                    </span>
                  </Link>
                ))}
              </div>
            </li>
            <li>
              <Link href="/integrations" className="nav__link" aria-current={cur("/integrations")}>
                Integrations
              </Link>
            </li>
            <li>
              <Link href="/apps" className="nav__link" aria-current={cur("/apps")}>
                Apps
              </Link>
            </li>
            <li>
              <Link href="/pricing" className="nav__link" aria-current={cur("/pricing")}>
                Pricing
              </Link>
            </li>
            <li>
              <Link href="/#themes" className="nav__link">
                Themes
              </Link>
            </li>
          </ul>
        </nav>
        <div className="nav__actions">
          <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label="Switch between light and dark" title="Light / dark">
            <svg className="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
            </svg>
            <svg className="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          </button>
          <a href={`${APP_URL}/login`} className="nav__login">
            Log in
          </a>
          <a href={`${APP_URL}/register`} className="btn btn--primary btn--sm">
            Start free
          </a>
        </div>
        <button type="button" className="nav__burger" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((v) => !v)}>
          <Icon d={open ? I.x : I.menu} />
        </button>
      </div>
      <div id="mobile-menu" className="mobile-menu" data-open={open}>
        {FEATURES.map((f) => (
          <Link key={f.title} href={f.href} onClick={() => setOpen(false)}>
            {f.title}
          </Link>
        ))}
        <Link href="/integrations">Integrations</Link>
        <Link href="/apps">Apps</Link>
        <Link href="/pricing">Pricing</Link>
        <a href={`${APP_URL}/login`}>Log in</a>
        <a href={`${APP_URL}/register`} className="btn btn--primary btn--lg">
          Start your free trial
        </a>
      </div>
    </header>
  );
}

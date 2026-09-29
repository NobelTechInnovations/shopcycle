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
                    <span>
                      <b>{f.title}</b>
                      <span>{f.text}</span>
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

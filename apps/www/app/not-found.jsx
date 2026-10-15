import Link from "next/link";
import { Icon, I } from "./components/Icon";
import { APP_URL } from "./components/site";

export const metadata = { title: "Page not found" };

const PLACES = [
  { href: "/", icon: I.home, title: "Home", text: "What Oyklane does, in five minutes." },
  { href: "/pricing", icon: I.tag, title: "Pricing", text: "Plans in ₹, with a free trial." },
  { href: "/apps", icon: I.grid, title: "Apps", text: "Phone Login, reviews, Flow and more." },
  { href: "/integrations", icon: I.puzzle, title: "Integrations", text: "Payments, couriers, ads and WhatsApp." },
];

/** 404 — the same look as every other page, with the likely next steps. */
export default function NotFound() {
  return (
    <section className="error-page">
      <div className="wrap">
        <span className="icon-tile"><Icon d={I.search} /></span>
        <p className="error-page__code">Error 404</p>
        <h1 className="h1">We couldn&apos;t find that page.</h1>
        <p className="lead">The link may be old or mistyped. Try one of these instead — or go to your dashboard if you were signing in.</p>
        <div className="hero__ctas">
          <Link href="/" className="btn btn--primary btn--lg">Go to the home page</Link>
          <a href={`${APP_URL}/login`} className="btn btn--ghost btn--lg">Log in to your store</a>
        </div>
        <ul className="error-page__places">
          {PLACES.map((p) => (
            <li key={p.href}>
              <Link href={p.href}>
                <span className="icon-tile"><Icon d={p.icon} /></span>
                <span>
                  <b>{p.title}</b>
                  <small>{p.text}</small>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

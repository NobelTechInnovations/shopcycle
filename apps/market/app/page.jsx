import Link from "next/link";
import { api } from "@/lib/api";
import { ThemeCard, AppCard } from "./components/Cards";

export default async function Home() {
  const [themes, apps] = await Promise.all([api("/api/market/public/browse?kind=theme").catch(() => ({ items: [] })), api("/api/market/public/browse?kind=app").catch(() => ({ items: [] }))]);
  return (
    <>
      <section className="hero">
        <div className="wrap hero__in">
          <span className="badge badge--accent">For Oyklane stores</span>
          <h1 style={{ marginTop: 16 }}>
            Themes and apps that make <span className="grad-text">your store sell more</span>
          </h1>
          <p className="lead">Free and paid — by Oyklane and independent developers. Preview every page of a theme with real products before you install it.</p>
          <form className="search" action="/search" role="search">
            <label htmlFor="q" className="sr-only">
              Search themes and apps
            </label>
            <input id="q" name="q" placeholder="Search themes and apps — “grocery”, “reviews”, “WhatsApp”…" />
            <button className="btn btn--primary">Search</button>
          </form>
          <div className="chips">
            <Link className="chip" href="/themes?category=food">
              Food & grocery themes
            </Link>
            <Link className="chip" href="/themes?category=fashion">
              Fashion themes
            </Link>
            <Link className="chip" href="/themes?price=free">
              Free themes
            </Link>
            <Link className="chip" href="/apps?category=marketing">
              Marketing apps
            </Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section__head">
            <div>
              <h2>Themes</h2>
              <p>Every theme previews with real products — home, collections, product pages, cart and more.</p>
            </div>
            <Link className="btn" href="/themes">
              All themes
            </Link>
          </div>
          <div className="grid grid--themes">
            {themes.items.slice(0, 8).map((t) => (
              <ThemeCard key={t.id} item={t} />
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="section__head">
            <div>
              <h2>Apps</h2>
              <p>Add reviews, WhatsApp, payments by UPI QR, Google & Meta channels and more.</p>
            </div>
            <Link className="btn" href="/apps">
              All apps
            </Link>
          </div>
          <div className="grid grid--apps">
            {apps.items.slice(0, 9).map((a) => (
              <AppCard key={a.id} item={a} />
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="card card--pad spread" style={{ background: "var(--hero), var(--surface)", padding: 32 }}>
            <div style={{ maxWidth: 620 }}>
              <h2>Build themes and apps. Keep {Math.round((themes.partnerShare ?? 0.8) * 100)}% of every sale.</h2>
              <p className="muted" style={{ marginTop: 8 }}>
                List free or paid themes and apps for thousands of Indian brands on Oyklane. We handle payments and licences — you get paid by UPI.
              </p>
            </div>
            <div className="row">
              <Link className="btn btn--accent btn--lg" href="/partners/signup">
                Become a developer
              </Link>
              <Link className="btn btn--lg" href="/partners">
                How it works
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

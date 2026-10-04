import Link from "next/link";
import { Icon, I } from "../components/Icon";
import { APP_URL } from "../components/site";
import { CATEGORIES, INTEGRATIONS, STATUS_LABEL } from "../data/integrations";
import { Logo } from "../components/Logo";

export const metadata = {
  title: "Integrations",
  description: "Payments, couriers, pixels, WhatsApp, email and an open API — everything Oyklane connects to, and what's coming next.",
};

function Card({ x }) {
  return (
    <article className="card">
      <div className="card__top">
        <Logo {...x.logo} size={48} title={x.name} />
        <span className={`badge badge--${x.status}`}>{STATUS_LABEL[x.status]}</span>
      </div>
      <h3>{x.name}</h3>
      <p>{x.text}</p>
    </article>
  );
}

export default function IntegrationsPage() {
  const featured = INTEGRATIONS.find((x) => x.featured);
  const popular = INTEGRATIONS.filter((x) => x.popular && !x.featured);
  // The hero shows real brands first.
  const hero = [...INTEGRATIONS.filter((x) => x.logo.brand || x.logo.word), ...INTEGRATIONS.filter((x) => x.logo.icon)].filter((x) => x.status !== "soon").slice(0, 15);

  return (
    <>
      <section className="wrap page-hero">
        <div>
          <span className="eyebrow">
            <span className="eyebrow__icon"><Icon d={I.puzzle} /></span>
            Integrations
          </span>
          <h1 className="h1">
            Our <span className="grad">integrations</span>
          </h1>
          <p className="lead">Connect your store to the payment gateways, couriers, pixels and messaging your customers already use. Most are built in — no plugins to find, no extra bills.</p>
          <div className="hero__ctas" style={{ justifyContent: "flex-start" }}>
            <a href={`${APP_URL}/register`} className="btn btn--primary">
              Start free <Icon d={I.arrow} />
            </a>
            <Link href="#developer" className="btn btn--ghost">
              Build your own with our API
            </Link>
          </div>
        </div>
        <div className="hex" aria-hidden="true">
          {hero.map((x) => (
            <Logo key={x.name} {...x.logo} size={72} title={x.name} className="float-tile" />
          ))}
        </div>
      </section>

      <section className="wrap" style={{ paddingBottom: 110 }}>
        <div className="lib">
          <nav className="lib__nav" aria-label="Integration categories">
            <a href="#popular">Most popular</a>
            {CATEGORIES.map((c) => (
              <a key={c.key} href={`#${c.key}`}>
                {c.label} <span>{INTEGRATIONS.filter((x) => x.category === c.key).length}</span>
              </a>
            ))}
          </nav>

          <div>
            {featured && (
              <div className="featured-card" data-reveal>
                <div>
                  <span className="badge badge--app">Featured</span>
                  <h2 className="h3">{featured.name}</h2>
                  <p className="muted" style={{ margin: 0 }}>{featured.text} Shoppers who&rsquo;ve bought on any Oyklane store find their address already filled in.</p>
                  <p style={{ marginTop: 22 }}>
                    <Link href="/#checkout" className="link-arrow">See how it works <Icon d={I.arrow} /></Link>
                  </p>
                </div>
                <ul className="includes" style={{ margin: 0, alignContent: "center" }}>
                  <li className="chip">Mobile + one-time code</li>
                  <li className="chip">Saved addresses</li>
                  <li className="chip">UPI, cards, COD</li>
                  <li className="chip">Payment brand icons</li>
                  <li className="chip">Works from any page</li>
                </ul>
              </div>
            )}

            <div className="lib__group" id="popular">
              <h2 className="lib__title"><Icon d={I.star} /> Most popular</h2>
              <div className="cards">
                {popular.map((x) => (
                  <Card key={x.name} x={x} />
                ))}
              </div>
            </div>

            {CATEGORIES.map((c) => (
              <div className="lib__group" id={c.key} key={c.key}>
                <h2 className="lib__title"><Icon d={I[c.icon]} /> {c.label}</h2>
                <div className="cards">
                  {INTEGRATIONS.filter((x) => x.category === c.key).map((x) => (
                    <Card key={x.name} x={x} />
                  ))}
                </div>
              </div>
            ))}

            <div className="cta" style={{ marginTop: 72, padding: "48px 24px" }} data-reveal>
              <h2 className="h2" style={{ maxWidth: "18ch" }}>Missing an integration?</h2>
              <p className="lead">Build it yourself with our REST API and webhooks, or tell us from your dashboard&rsquo;s Help — we build the most-asked ones first.</p>
              <div className="hero__ctas">
                <a href={`${APP_URL}/register`} className="btn btn--light">Start free</a>
                <Link href="/apps" className="btn btn--ghost">See the app store</Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

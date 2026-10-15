import Link from "next/link";
import { Icon, I } from "../components/Icon";
import { APP_URL } from "../components/site";
import { CATEGORIES, INTEGRATIONS, GUIDES, STATUS_LABEL } from "../data/integrations";
import { Logo } from "../components/Logo";

export const metadata = {
  title: "Integrations",
  description: "How Oyklane connects to payments, couriers, ads, WhatsApp, email and your own tools — step by step, and what's coming next.",
};

const OVERVIEW = [
  { icon: I.grid, title: "Find it in your dashboard", text: "Most connections live in Settings; the rest are apps you install in one click." },
  { icon: I.lock, title: "Sign in or paste a key", text: "Continue with Facebook or Google, or paste your gateway's keys. You can disconnect any time." },
  { icon: I.check, title: "It works on your store", text: "Checkout, tracking, messages and reports update by themselves — no plugins, no code." },
];

function Card({ x }) {
  return (
    <article className="card">
      <div className="card__top">
        <Logo {...x.logo} size={44} title={x.name} />
        <span className={`badge badge--${x.status}`}>{STATUS_LABEL[x.status]}</span>
      </div>
      <h3>{x.name}</h3>
      <p>{x.text}</p>
    </article>
  );
}

/** Everything Oyklane connects to, as a guide: how each kind connects, step by step. */
export default function IntegrationsPage() {
  // Real brands, each mark once.
  const seen = new Set();
  const hero = INTEGRATIONS.filter((x) => {
    const mark = x.logo.brand || x.logo.word;
    if (!mark || x.status === "soon" || seen.has(mark)) return false;
    seen.add(mark);
    return true;
  }).slice(0, 15);

  return (
    <>
      <section className="hero hero--page">
        <div className="wrap page-hero">
          <div>
            <h1 className="h1">How Oyklane connects to your tools</h1>
            <p className="lead">
              Payments, couriers, ads, WhatsApp, email and your own software — what each connection does, how to switch it on, and what&apos;s coming next.
            </p>
            <div className="hero__ctas">
              <a href={`${APP_URL}/register`} className="btn btn--primary btn--lg">Start free trial</a>
              <Link href="/developers" className="btn btn--ghost btn--lg">API docs</Link>
            </div>
          </div>
          <div className="hex" aria-hidden="true">
            {hero.map((x) => (
              <Logo key={x.name} {...x.logo} size={68} title={x.name} />
            ))}
          </div>
        </div>
      </section>

      <section className="wrap overview">
        {OVERVIEW.map((o, n) => (
          <div key={o.title} className="overview__step">
            <span className="icon-tile"><Icon d={o.icon} /></span>
            <span>
              <b>{n + 1}. {o.title}</b>
              <small>{o.text}</small>
            </span>
          </div>
        ))}
      </section>

      <section className="wrap" style={{ paddingBottom: 110 }}>
        <div className="lib">
          <nav className="lib__nav" aria-label="Integration categories">
            {CATEGORIES.map((c) => (
              <a key={c.key} href={`#${c.key}`}>
                {c.label} <span>{INTEGRATIONS.filter((x) => x.category === c.key).length}</span>
              </a>
            ))}
            <Link href="/developers">API docs</Link>
          </nav>

          <div>
            {CATEGORIES.map((c) => {
              const g = GUIDES[c.key];
              return (
                <div className="lib__group guide" id={c.key} key={c.key}>
                  <div className="guide__head">
                    <span className="icon-tile"><Icon d={I[c.icon]} /></span>
                    <div>
                      <h2 className="h2">{c.label}</h2>
                      {g && <p className="lead">{g.intro}</p>}
                    </div>
                  </div>
                  {g && (
                    <div className="guide__how">
                      <p className="guide__label">How it works</p>
                      <ol className="guide__steps">
                        {g.steps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                      {g.link && (
                        <p style={{ margin: "16px 0 0" }}>
                          <Link href={g.link.href} className="link-arrow">{g.link.label}</Link>
                        </p>
                      )}
                    </div>
                  )}
                  <div className="cards">
                    {INTEGRATIONS.filter((x) => x.category === c.key).map((x) => (
                      <Card key={x.name} x={x} />
                    ))}
                  </div>
                </div>
              );
            })}

            <div className="guide-cta">
              <h2 className="h2">Missing an integration?</h2>
              <p className="lead">Connect anything with our REST API and webhooks, or tell us from your dashboard&apos;s Help — we build the most-asked ones first.</p>
              <div className="hero__ctas">
                <Link href="/developers" className="btn btn--primary btn--lg">Read the API docs</Link>
                <Link href="/apps" className="btn btn--ghost btn--lg">See the apps</Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

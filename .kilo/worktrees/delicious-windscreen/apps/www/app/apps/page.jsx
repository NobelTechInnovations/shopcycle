import Link from "next/link";
import { Icon, I } from "../components/Icon";
import { APP_URL } from "../components/site";
import { FlowMock } from "../components/mocks";
import { getApps, ROADMAP } from "../data/apps";
import { AppsBrowser } from "./AppsBrowser";

export const metadata = {
  title: "App store",
  description: "Add Flow automations, One-Click Checkout, Phone Login, product reviews and pixels to your Oyklane store — installed apps sit right in your sidebar.",
};

export default async function AppsPage() {
  const apps = await getApps();
  return (
    <>
      <section className="wrap page-hero page-hero--center">
        <div>
          <span className="eyebrow eyebrow--center">
            <span className="eyebrow__icon"><Icon d={I.puzzle} /></span>
            App store
          </span>
          <h1 className="h1">
            Apps for every <span className="grad">stage of your store</span>
          </h1>
          <p className="lead">Install in one click; each app sits in your dashboard&rsquo;s sidebar, with its settings one tap away. Most are free — paid apps show their price up front.</p>
        </div>
      </section>

      <section className="wrap" style={{ paddingBottom: 40 }}>
        <div className="feature">
          <div className="feature__copy">
            <span className="eyebrow">
              <span className="eyebrow__icon"><Icon d={I.flow} /></span>
              New · Free
            </span>
            <h2 className="h2">Flow: automate every customer email</h2>
            <p className="lead">When an order is placed, shipped or delivered — or a checkout is left behind — Flow waits, checks, and sends the right email in your store&rsquo;s name.</p>
            <ul className="includes">
              <li className="chip">Thank first-time buyers</li>
              <li className="chip">Review requests</li>
              <li className="chip">Win-back offers</li>
              <li className="chip">COD confirmation</li>
            </ul>
            <p className="feature__more">
              <a href={`${APP_URL}/register`} className="btn btn--primary">
                Start free and install Flow <Icon d={I.arrow} />
              </a>
            </p>
          </div>
          <div className="feature__visual">
            <FlowMock />
          </div>
        </div>
      </section>

      <section className="section section--tight">
        <div className="wrap">
          <div className="head head--center" data-reveal>
            <h2 className="h2">All apps</h2>
          </div>
          <AppsBrowser apps={apps} appUrl={APP_URL} />
        </div>
      </section>

      <section className="section section--tight">
        <div className="wrap">
          <div className="head head--center" data-reveal>
            <span className="eyebrow eyebrow--center">
              <span className="eyebrow__icon"><Icon d={I.spark} /></span>
              Coming next
            </span>
            <h2 className="h2">On the workbench</h2>
            <p className="lead">We&rsquo;re building these now. They&rsquo;re not available yet — tell us which you need first from Help in your dashboard.</p>
          </div>
          <ul className="roadmap" style={{ padding: 0, margin: 0 }}>
            {ROADMAP.map((r) => (
              <li key={r.name}>
                <article className="card" style={{ height: "100%" }}>
                  <div className="card__top">
                    <h3>{r.name}</h3>
                    <span className="badge badge--soon">{r.tag ? `Soon · ${r.tag}` : "Soon"}</span>
                  </div>
                  <p>{r.text}</p>
                </article>
              </li>
            ))}
          </ul>
          <p style={{ textAlign: "center", marginTop: 40 }}>
            <Link href="/integrations" className="link-arrow">
              See every integration <Icon d={I.arrow} />
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}

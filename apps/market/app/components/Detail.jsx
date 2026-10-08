import Link from "next/link";
import { getUrl, inr, CATEGORY_LABELS, withShots } from "@/lib/config";
import { ThemeMock, Price } from "./Cards";

/** A theme's or app's page: pictures, what it is, and the buy box. */
export function Detail({ item: raw, preview }) {
  const item = withShots(raw);
  const theme = item.kind === "theme";
  const shots = item.screenshots || [];
  return (
    <div className="wrap detail">
      <div className="stack" style={{ minWidth: 0 }}>
        <div className="small muted">
          <Link href={theme ? "/themes" : "/apps"}>{theme ? "Themes" : "Apps"}</Link> / {item.name}
        </div>
        <h1 style={{ fontSize: "clamp(30px,4vw,44px)" }}>{item.name}</h1>
        {item.tagline && <p className="muted" style={{ fontSize: 17 }}>{item.tagline}</p>}
        {theme ? (
          <div className="gallery">
            <div className="gallery__main">{shots[0] ? <img src={shots[0]} alt={`${item.name} theme`} /> : <ThemeMock swatch={item.swatch} />}</div>
            {shots.length > 1 && (
              <div className="gallery__thumbs">
                {shots.slice(1).map((s) => (
                  <img key={s} src={s} alt="" loading="lazy" />
                ))}
              </div>
            )}
          </div>
        ) : (
          shots.length > 0 && (
            <div className="gallery__thumbs" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}>
              {shots.map((s) => (
                <img key={s} src={s} alt="" loading="lazy" />
              ))}
            </div>
          )
        )}
        {item.description && (
          <div className="card card--pad" style={{ marginTop: 20 }}>
            <h2 style={{ fontSize: 20, marginBottom: 10 }}>About</h2>
            <p className="prose">{item.description}</p>
          </div>
        )}
        {!theme && item.scopeLabels?.length > 0 && (
          <div className="card card--pad">
            <h2 style={{ fontSize: 20, marginBottom: 10 }}>What it can do in your store</h2>
            <ul className="ticks">
              {item.scopeLabels.map((s) => (
                <li key={s}>{s}</li>
              ))}
              {item.embeds && <li>Add a script to your store's pages (not checkout)</li>}
            </ul>
          </div>
        )}
        {item.changelog && (
          <div className="card card--pad">
            <h2 style={{ fontSize: 20, marginBottom: 10 }}>What's new in {item.version}</h2>
            <p className="prose">{item.changelog}</p>
          </div>
        )}
      </div>

      <aside className="buybox">
        <div className="card card--pad stack">
          <div className="buybox__price">
            <Price item={item} />
          </div>
          {!item.free && <p className="small muted">{theme ? "One-time, for one store. + GST. Updates included." : "A month, billed with your Oyklane plan. + GST. Cancel any time."}</p>}
          <div className="stack">
            <a className="btn btn--accent btn--lg btn--block" href={getUrl(item.kind, item.slug)}>
              {item.free ? `Add to my store` : theme ? `Buy for ${inr(item.price)}` : `Install`}
            </a>
            {theme && preview && (
              <Link className="btn btn--lg btn--block" href={`/themes/${item.slug}/preview`}>
                Preview every page
              </Link>
            )}
          </div>
          <p className="small subtle">You'll confirm in your Oyklane admin — sign in there if you aren't.</p>
          <dl className="facts">
            <div>
              <dt>By</dt>
              <dd>{item.official ? "Oyklane" : item.by?.website ? <a href={item.by.website} target="_blank" rel="noopener noreferrer">{item.by.name}</a> : item.by?.name}</dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{CATEGORY_LABELS[item.category] || item.category}</dd>
            </div>
            {item.version && (
              <div>
                <dt>Version</dt>
                <dd>{item.version}</dd>
              </div>
            )}
            {item.installs ? (
              <div>
                <dt>Used by</dt>
                <dd>{item.installs.toLocaleString("en-IN")} stores</dd>
              </div>
            ) : null}
            {item.supportEmail && (
              <div>
                <dt>Support</dt>
                <dd>
                  <a href={`mailto:${item.supportEmail}`}>{item.supportEmail}</a>
                </dd>
              </div>
            )}
            {item.privacyUrl && (
              <div>
                <dt>Privacy</dt>
                <dd>
                  <a href={item.privacyUrl} target="_blank" rel="noopener noreferrer">
                    Policy
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </div>
        {theme && (
          <ul className="ticks card card--pad">
            <li>Change colours, fonts, sections and layouts without code</li>
            <li>Works with every Oyklane feature — checkout, UPI, COD, reviews</li>
            <li>Fast on phones, ready for Google</li>
          </ul>
        )}
      </aside>
    </div>
  );
}

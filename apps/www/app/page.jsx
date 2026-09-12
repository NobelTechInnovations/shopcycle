const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const FEATURES = [
  { title: "Drag-and-drop theme editor", text: "Real controllers for every section — image uploads, color pickers, menu and collection dropdowns. No code, no guesswork." },
  { title: "Multi-store, one login", text: "Run several stores from a single account and switch between them in one click, the way an agency or multi-brand seller actually works." },
  { title: "A real app ecosystem", text: "Install analytics, reviews, and marketing apps the same way you install a theme — configure once, it runs on every page." },
  { title: "Your own domain", text: "Launch on your store's oyklane.com address, then point your own domain at it whenever you're ready — no migration, no downtime." },
  { title: "Built-in checkout", text: "Cart, discounts, shipping, and Cash on Delivery or online payments — wired up from day one, not a paid add-on." },
  { title: "Built for every device", text: "Every theme, every editor screen, every storefront — responsive by default, not an afterthought." },
];

const PLANS = [
  { name: "Free", price: "₹0", period: "/mo", desc: "Get started and see how it feels.", items: ["Up to 10 products", "1 staff account", "Free theme library", "Community support"] },
  { name: "Starter", price: "₹999", period: "/mo", highlight: true, desc: "For a store that's finding its customers.", items: ["Up to 200 products", "5 staff accounts", "Custom domain", "App installs", "Email support"] },
  { name: "Growth", price: "₹2,999", period: "/mo", desc: "For a team scaling past one store.", items: ["Up to 5,000 products", "20 staff accounts", "Multi-store switching", "Priority support"] },
];

function Icon({ d }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  layers: "M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  store: "M3 9l1-5h16l1 5M3 9v11h18V9M3 9h18M9 20v-6h6v6",
  puzzle: "M12 2v4M12 18v4M2 12h4M18 12h4M8 8l-2-2M18 6l-2 2M6 18l2-2M16 16l2 2",
  globe: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2c2.5 2.7 4 6.3 4 10s-1.5 7.3-4 10c-2.5-2.7-4-6.3-4-10s1.5-7.3 4-10z",
  cart: "M3 3h2l2.4 12.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 8H6",
  device: "M4 4h16v12H4zM9 20h6M12 16v4",
};

export default function HomePage() {
  return (
    <>
      <nav className="nav">
        <a href="/" className="nav__logo">
          <span className="nav__logo-mark" aria-hidden="true" />
          Oyklane
        </a>
        <div className="nav__actions">
          <a href={`${APP_URL}/login`} className="nav__link">Log in</a>
          <a href={`${APP_URL}/register`} className="btn btn--solid btn--sm">Start free trial</a>
        </div>
      </nav>

      {/* Hero */}
      <header className="hero">
        <div className="hero__glow" aria-hidden="true" />
        <div className="hero__content">
          <span className="hero__eyebrow">Now live in early access — <span>free while you build</span></span>
          <h1>
            Build your store.<br />Sell <em>everywhere</em>.
          </h1>
          <p>
            Oyklane is the commerce platform to design a store that looks like you, install the apps you actually
            need, and sell to real customers — without touching a line of code.
          </p>
          <div className="hero__ctas">
            <a href={`${APP_URL}/register`} className="btn btn--solid">Start free trial</a>
            <a href="#product" className="btn btn--outline">See how it works</a>
          </div>
          <p className="hero__note">No credit card required · Free theme included · Cancel anytime</p>
        </div>
      </header>

      {/* Showcase */}
      <section className="section" id="product">
        <div className="section__head center">
          <p className="section__kicker">One platform</p>
          <h2>Everything a store needs, already built in</h2>
          <p>Storefront, theme editor, and order management — the same three screens you'll actually live in.</p>
        </div>

        <div className="showcase">
          <div className="mockup">
            <div className="mockup__bar"><span className="mockup__dot" /><span className="mockup__dot" /><span className="mockup__dot" /></div>
            <div className="mini-store__header">
              <span className="mini-store__logo">Aurora Goods</span>
              <span className="mini-store__nav">New · Shop · About</span>
              <span className="mini-store__icons"><span /><span /><span /></span>
            </div>
            <div className="mini-store__hero">
              <strong>Summer Edit</strong>
              <span />
            </div>
            <div className="mini-store__grid">
              <div className="mini-store__card" /><div className="mini-store__card" /><div className="mini-store__card" />
            </div>
          </div>

          <div className="mockup">
            <div className="mockup__bar"><span className="mockup__dot" /><span className="mockup__dot" /><span className="mockup__dot" /></div>
            <div className="mini-editor" style={{ height: 220 }}>
              <div className="mini-editor__panel">
                <div className="active" /><div /><div /><div /><div />
              </div>
              <div className="mini-editor__preview">
                <div className="block" style={{ height: 50 }} />
                <div className="block" /><div className="block" />
              </div>
              <div className="mini-editor__settings">
                <div className="mini-editor__field" />
                <div className="mini-editor__field" style={{ height: 40 }} />
                <div className="mini-editor__swatches">
                  <span style={{ background: "#111" }} /><span style={{ background: "#7c5cff" }} /><span style={{ background: "#2dd4bf" }} />
                </div>
              </div>
            </div>
          </div>

          <div className="mockup">
            <div className="mockup__bar"><span className="mockup__dot" /><span className="mockup__dot" /><span className="mockup__dot" /></div>
            <div className="mini-dash">
              <div className="mini-dash__stats">
                <div className="mini-dash__stat">Sales<b>₹48.2k</b></div>
                <div className="mini-dash__stat">Orders<b>36</b></div>
                <div className="mini-dash__stat">Visitors<b>1.2k</b></div>
              </div>
              <div className="mini-dash__row"><span>#1042 Riya S.</span><span className="mini-dash__badge">Paid</span></div>
              <div className="mini-dash__row"><span>#1041 Aman K.</span><span className="mini-dash__badge">Paid</span></div>
              <div className="mini-dash__row"><span>#1040 Neha P.</span><span className="mini-dash__badge">Fulfilled</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* Big editor deep-dive */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="feature-panel">
          <div className="feature-panel__inner">
            <div className="section__head center" style={{ maxWidth: 620, margin: "0 auto" }}>
              <p className="section__kicker">Theme editor</p>
              <h2>Design your store like you mean it</h2>
              <p>Every section — header, hero, product grid, footer — has real controls: pick a collection from a dropdown, upload an image, choose your colors. Nothing to type that you don't already know.</p>
            </div>
            <div className="mockup">
              <div className="mockup__bar"><span className="mockup__dot" /><span className="mockup__dot" /><span className="mockup__dot" /></div>
              <div className="mini-editor" style={{ height: 320, fontSize: 10 }}>
                <div className="mini-editor__panel" style={{ gap: 10, padding: "16px 12px" }}>
                  <div className="active" style={{ height: 10 }} /><div style={{ height: 10 }} /><div style={{ height: 10 }} /><div style={{ height: 10 }} /><div style={{ height: 10 }} /><div style={{ height: 10 }} />
                </div>
                <div className="mini-editor__preview" style={{ padding: 20, gap: 10 }}>
                  <div className="block" style={{ height: 90 }} />
                  <div className="block" style={{ height: 40 }} />
                  <div className="block" style={{ height: 40 }} />
                </div>
                <div className="mini-editor__settings" style={{ padding: "16px 12px", gap: 10 }}>
                  <div className="mini-editor__field" style={{ height: 12 }} />
                  <div className="mini-editor__field" style={{ height: 12 }} />
                  <div className="mini-editor__field" style={{ height: 60 }} />
                  <div className="mini-editor__swatches">
                    <span style={{ background: "#111" }} /><span style={{ background: "#7c5cff" }} /><span style={{ background: "#2dd4bf" }} /><span style={{ background: "#eee", border: "1px solid #ccc" }} />
                  </div>
                  <div className="mini-editor__field" style={{ height: 24, borderRadius: 999 }} />
                </div>
              </div>
            </div>
          </div>
          <div style={{ height: 48 }} />
        </div>
      </section>

      {/* Feature grid */}
      <section className="section">
        <div className="section__head center">
          <p className="section__kicker">Why Oyklane</p>
          <h2>Built for people running a real business</h2>
        </div>
        <div className="grid-features">
          {FEATURES.map((f, i) => (
            <div className="grid-features__item" key={f.title}>
              <div className="grid-features__icon"><Icon d={ICONS[Object.keys(ICONS)[i % 6]]} /></div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Roles */}
      <section className="section">
        <div className="section__head center">
          <p className="section__kicker">Built for how commerce actually works</p>
          <h2>One platform, three ways in</h2>
          <p>Whether you're selling, shopping, or running the platform itself, Oyklane gives you exactly the screen you need — nothing borrowed from someone else's flow.</p>
        </div>
        <div className="roles">
          <div className="role-card">
            <span className="role-card__tag">Sellers</span>
            <h3>Build & manage your store</h3>
            <p>Sign in once, run every store you own, and design each one independently.</p>
            <ul>
              <li>Install a theme, customize every section</li>
              <li>Manage products, orders, and customers</li>
              <li>Switch between your stores in one click</li>
            </ul>
          </div>
          <div className="role-card">
            <span className="role-card__tag">Buyers</span>
            <h3>Shop like anywhere else</h3>
            <p>A fast, familiar storefront on the seller's own address — no account required to browse.</p>
            <ul>
              <li>Search, cart, and checkout that just works</li>
              <li>Cash on delivery or online payment</li>
              <li>Order confirmation and tracking</li>
            </ul>
          </div>
          <div className="role-card">
            <span className="role-card__tag">Platform</span>
            <h3>Run the whole marketplace</h3>
            <p>A fully separate control room for the team running Oyklane itself.</p>
            <ul>
              <li>Manage every company and its plan</li>
              <li>Publish apps and themes to the library</li>
              <li>Suspend a store if billing fails</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="section">
        <div className="section__head center">
          <p className="section__kicker">Pricing</p>
          <h2>Start free. Grow when you're ready.</h2>
        </div>
        <div className="pricing">
          {PLANS.map((p) => (
            <div className={`price-card ${p.highlight ? "price-card--highlight" : ""}`} key={p.name}>
              <p className="price-card__name">{p.name}</p>
              <p className="price-card__price">{p.price}<span>{p.period}</span></p>
              <p className="price-card__desc">{p.desc}</p>
              <ul>
                {p.items.map((it) => <li key={it}>{it}</li>)}
              </ul>
              <a href={`${APP_URL}/register`} className={`btn ${p.highlight ? "btn--solid" : "btn--outline"}`}>Get started</a>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <div className="cta-band">
        <h2>Your store is one click away</h2>
        <p>Free to start. No credit card. Live in minutes.</p>
        <a href={`${APP_URL}/register`} className="btn btn--solid">Start free trial</a>
      </div>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer__grid">
            <div>
              <div className="footer__brand"><span className="nav__logo-mark" aria-hidden="true" />Oyklane</div>
              <p className="footer__brand-text">The commerce platform for building, running, and growing an online store.</p>
            </div>
            <div className="footer__col">
              <h4>Oyklane</h4>
              <a href="#product">What is Oyklane?</a>
              <a href={`${APP_URL}/register`}>Start free trial</a>
              <a href={`${APP_URL}/login`}>Log in</a>
            </div>
            <div className="footer__col">
              <h4>Platform</h4>
              <a href="#product">Theme library</a>
              <a href="#product">App library</a>
              <a href="#pricing">Pricing</a>
            </div>
            <div className="footer__col">
              <h4>Support</h4>
              <a href="mailto:hello@oyklane.com">Contact us</a>
              <a href="#">Help center</a>
              <a href="#">Status</a>
            </div>
          </div>
          <div className="footer__bottom">
            <div className="footer__legal">
              <span>© {new Date().getFullYear()} Oyklane</span>
              <a href="#">Terms</a>
              <a href="#">Privacy</a>
            </div>
            <div className="footer__social">
              <a href="#" aria-label="X"><Icon d="M4 4l16 16M20 4L4 20" /></a>
              <a href="#" aria-label="Instagram"><Icon d="M4 4h16v16H4zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM17 7h.01" /></a>
              <a href="#" aria-label="LinkedIn"><Icon d="M4 4h16v16H4zM8 10v6M8 8v.01M12 16v-3.5a1.5 1.5 0 0 1 3 0V16" /></a>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}

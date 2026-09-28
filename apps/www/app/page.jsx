import { ThemeShowcase } from "./ThemeShowcase";
import { Pricing } from "./Pricing";
import { getPlans } from "./plans";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const DEMO_URL = process.env.NEXT_PUBLIC_DEMO_STORE_URL || "https://loomwear.oyklane.com";

const I = {
  check: "M5 12.5l4.5 4.5L19 7.5",
  layers: "M12 3 3 8l9 5 9-5-9-5zM3 16l9 5 9-5M3 12l9 5 9-5",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  card: "M3 6h18v12H3zM3 10h18M7 15h4",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  code: "M8 8l-5 4 5 4M16 8l5 4-5 4M14 5l-4 14",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.3 2.5 3.5 5.5 3.5 9s-1.2 6.5-3.5 9c-2.3-2.5-3.5-5.5-3.5-9S9.7 5.5 12 3z",
  sliders: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21h4",
  arrow: "M5 12h14M13 6l6 6-6 6",
  phone: "M8 2.5h8a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5zM11 18.5h2",
  shield: "M12 3l7 3v5.5c0 4.4-3 8.2-7 9.5-4-1.3-7-5.1-7-9.5V6zM9 12l2.2 2.2L15.5 10",
  pin: "M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
};

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function Icon({ d, className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const faq = (pricing) => [
  ["Do I need to know how to code?", "No. Pick a theme, change its colours, fonts, photos and sections in the editor, and arrange your product page by dragging blocks. The code editor is there if you ever want it."],
  ["How do I get paid?", "Straight into your own account. Connect Razorpay, Cashfree, PayU, Stripe or PayPal (test mode first, if you like) and turn cash on delivery on or off. Oyklane never holds your money."],
  ["Can I use my own domain?", "Yes. Every store gets a free yourname.oyklane.com address. Point your own domain at it from Settings ▸ Domains — SSL is set up for you automatically."],
  [
    "What does it cost?",
    `${pricing.plans.map((p, i) => `${i === 0 ? "" : i === pricing.plans.length - 1 ? " and " : ", "}${p.name} ${inr(p.priceMonthly)}`).join("")} a month (plus 18% GST), with a small fee per paid order: ${pricing.plans.map((p) => `${p.commissionPercent}%`).join(", ")}. Every store starts with a ${pricing.trialDays}-day free trial${pricing.introEnabled ? `, then ${inr(pricing.introPrice)} for the first month` : ""}. Pay yearly and save ${pricing.annualDiscountPercent}%.`,
  ],
  ["Can I move my reviews and products over?", "Yes — import products from a CSV, and import your existing product reviews from a CSV matched by product. Customers' stars show up straight away."],
  ["Is it built for Indian sellers?", "From the ground up: rupee pricing, cash on delivery, UPI and Indian gateways, GST invoices with HSN codes and GSTIN, Indian states at checkout and PIN-code addresses."],
];

export default async function HomePage() {
  const pricing = await getPlans();
  return (
    <>
      <header className="nav">
        <div className="wrap nav__inner">
          <a href="/" className="logo" aria-label="Oyklane home">
            <span className="logo__mark" aria-hidden="true" />
            Oyklane
          </a>
          <nav aria-label="Main">
            <ul className="nav__links">
              <li><a href="#themes">Themes</a></li>
              <li><a href="#features">Features</a></li>
              <li><a href="#checkout">Checkout</a></li>
              <li><a href="#pricing">Pricing</a></li>
              <li><a href="#faq">FAQ</a></li>
            </ul>
          </nav>
          <div className="nav__actions">
            <a href={`${APP_URL}/login`} className="nav__login">Log in</a>
            <a href={`${APP_URL}/register`} className="btn btn--primary btn--sm">Start free</a>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="hero">
          <div className="wrap hero__grid">
            <div className="hero__copy">
              <a href="#themes" className="pill">
                <b>New</b> One-Click Checkout · Phone login for shoppers
              </a>
              <h1 className="h1">Your brand&rsquo;s store, live this week.</h1>
              <p className="lead">
                Oyklane gives Indian brands a fast, beautiful storefront with cash on delivery, five payment gateways, GST invoices and reviews built in — and an editor you&rsquo;ll actually enjoy.
              </p>
              <div className="hero__ctas">
                <a href={`${APP_URL}/register`} className="btn btn--primary">
                  Start your store <Icon d={I.arrow} />
                </a>
                <a href={DEMO_URL} target="_blank" rel="noopener" className="btn btn--ghost">
                  See a live store
                </a>
              </div>
              <p className="hero__trust">
                <span><Icon d={I.check} /> {pricing.trialDays}-day free trial</span>
                <span><Icon d={I.check} /> Cash on delivery built in</span>
                <span><Icon d={I.check} /> Your own domain, free SSL</span>
              </p>
            </div>

            <div className="hero__visual">
              <div className="browser">
                <div className="browser__bar">
                  <span className="browser__dots" aria-hidden="true"><i /><i /><i /></span>
                  <span className="browser__url">loomwear.oyklane.com</span>
                </div>
                <div className="browser__screen">
                  <img src="/showcase/atelier.webp" alt="Loomwear, a clothing store built on Oyklane with the Atelier theme" width="1440" height="1000" fetchPriority="high" />
                </div>
              </div>
              <div className="phone">
                <img src="/showcase/atelier-mobile.webp" alt="The same store's product page on a phone, with size and colour pickers" width="390" height="844" />
              </div>
              <div className="toast" role="img" aria-label="A new-order alert: order 1043, ₹2,299, cash on delivery">
                <span className="toast__icon"><Icon d={I.bell} /></span>
                <span>
                  <strong>New order #1043 · ₹2,299</strong>
                  <span>Ananya S. · Cash on delivery</span>
                </span>
              </div>
            </div>
          </div>
        </section>

        <div className="strip">
          <div className="wrap strip__inner">
            <p className="strip__label">Built for how India shops</p>
            <ul className="strip__items">
              <li>UPI</li>
              <li>Razorpay</li>
              <li>Cashfree</li>
              <li>PayU</li>
              <li>Stripe</li>
              <li>PayPal</li>
              <li>Cash on delivery</li>
              <li>GST invoices</li>
            </ul>
          </div>
        </div>

        {/* Themes */}
        <section className="section section--soft" id="themes">
          <div className="wrap">
            <div className="head">
              <span className="kicker">Themes</span>
              <h2 className="h2">Four themes. Your brand in every one.</h2>
              <p className="lead">Start from a design made for what you sell, then make it yours — colours, fonts, photos and sections, all without code.</p>
            </div>
            <ThemeShowcase demoUrl={DEMO_URL} appUrl={APP_URL} />
          </div>
        </section>

        {/* Features */}
        <section className="section" id="features">
          <div className="wrap">
            <div className="head">
              <span className="kicker">Everything included</span>
              <h2 className="h2">The things a growing store needs, already built.</h2>
              <p className="lead">No stack of paid plugins. The day you sign up, you have what most stores spend months wiring together.</p>
            </div>

            <div className="bento">
              <article className="card card--xl">
                <span className="card__icon"><Icon d={I.layers} /></span>
                <h3 className="h3">Arrange your pages — no code</h3>
                <p className="muted">Drag sections on your home page. On the product page, move the price under the button, make the title bigger, hide what you don&rsquo;t need — the design stays polished.</p>
                <div className="card__demo">
                  <ul className="blocks" aria-label="Product page blocks, as seen in the editor">
                    <li><span className="grip">⋮⋮</span> Title <b>Large</b></li>
                    <li><span className="grip">⋮⋮</span> Size &amp; colour picker <b>Pills</b></li>
                    <li><span className="grip">⋮⋮</span> Quantity &amp; add to cart</li>
                    <li><span className="grip">⋮⋮</span> Price <b>Large</b></li>
                    <li className="is-off"><span className="grip">⋮⋮</span> Delivery &amp; payment badges <b>Hidden</b></li>
                  </ul>
                </div>
              </article>

              <article className="card">
                <span className="card__icon"><Icon d={I.bolt} /></span>
                <h3 className="h3">Quick add, from any card</h3>
                <p className="muted">Shoppers pick a size and colour right from the collection page — the cart slides in, no page loads.</p>
              </article>

              <article className="card">
                <span className="card__icon"><Icon d={I.star} /></span>
                <h3 className="h3">Reviews that sell</h3>
                <p className="muted">Stars on every card, verified-buyer badges, replies and CSV import.</p>
                <div className="card__demo"><span className="stars" aria-label="4.5 out of 5">★★★★½</span> <span className="muted">4.5 · 128 reviews</span></div>
              </article>

              <article className="card">
                <span className="card__icon"><Icon d={I.receipt} /></span>
                <h3 className="h3">GST-ready</h3>
                <p className="muted">Tax invoices with HSN codes, CGST/SGST or IGST worked out, and your buyer&rsquo;s GSTIN when they add one (Growth and Pro).</p>
              </article>

              <article className="card">
                <span className="card__icon"><Icon d={I.sliders} /></span>
                <h3 className="h3">A checkout you control</h3>
                <p className="muted">Choose which fields to ask for — mobile, landmark, company, GSTIN, a gift note — and which are required.</p>
              </article>

              <article className="card card--wide card--dark">
                <span className="card__icon"><Icon d={I.chart} /></span>
                <h3 className="h3">Meta Pixel &amp; Google Analytics, fully wired</h3>
                <p className="muted">Connect with Facebook and pick your pixel. Every shopping event is sent — including checkout — so your ads learn from real sales.</p>
                <div className="card__demo chips">
                  <span className="chip">ViewContent</span>
                  <span className="chip">AddToCart</span>
                  <span className="chip">InitiateCheckout</span>
                  <span className="chip">Purchase</span>
                </div>
              </article>

              <article className="card card--wide">
                <span className="card__icon"><Icon d={I.code} /></span>
                <h3 className="h3">API &amp; webhooks</h3>
                <p className="muted">Keys with exactly the access each app needs, and signed webhooks for orders, products and customers.</p>
                <pre className="code">
                  <span className="k">GET</span> /api/v1/orders?status=paid{"\n"}Authorization: Bearer <span className="s">oyk_••••••</span>
                </pre>
              </article>

              <article className="card">
                <span className="card__icon"><Icon d={I.globe} /></span>
                <h3 className="h3">Your domain, free SSL</h3>
                <p className="muted">A free yourbrand.oyklane.com address from day one; connect your own domain whenever you&rsquo;re ready.</p>
              </article>

              <article className="card">
                <span className="card__icon"><Icon d={I.layers} /></span>
                <h3 className="h3">Custom data</h3>
                <p className="muted">Add Fabric, Fit, Care or a Size chart to every product — shown on the page, in one click.</p>
              </article>

              <article className="card">
                <span className="card__icon"><Icon d={I.bell} /></span>
                <h3 className="h3">Hear every sale</h3>
                <p className="muted">A cheerful coin sound and a note with the customer&rsquo;s name whenever an order comes in.</p>
              </article>
            </div>
          </div>
        </section>

        {/* Payments */}
        <section className="section band" id="payments">
          <div className="wrap">
            <div className="head">
              <span className="kicker">Payments</span>
              <h2 className="h2">Get paid your way — straight into your account.</h2>
              <p className="lead muted">Connect as many gateways as you like, try them in test mode, and switch any off with one click. Unpaid online orders release their stock automatically.</p>
            </div>
            <div className="pay-grid">
              <div className="pay"><strong>Razorpay</strong><span>UPI, cards, netbanking and wallets</span></div>
              <div className="pay"><strong>Cashfree</strong><span>UPI, cards and pay later</span></div>
              <div className="pay"><strong>PayU</strong><span>India&rsquo;s widest set of methods</span></div>
              <div className="pay"><strong>Stripe</strong><span>Cards from anywhere</span></div>
              <div className="pay"><strong>PayPal</strong><span>For international buyers</span></div>
              <div className="pay"><strong>Cash on delivery</strong><span>On or off, your call</span></div>
            </div>
          </div>
        </section>

        {/* One-click checkout */}
        <section className="section" id="checkout">
          <div className="wrap split split--flip">
            <div className="head" style={{ marginBottom: 0 }}>
              <span className="kicker">One-Click Checkout</span>
              <h2 className="h2">Checkout in seconds, not forms.</h2>
              <p className="lead muted">Returning buyers type their mobile number, confirm a one-time code, pick a saved address and pay — all in a popup, without leaving the page they were on.</p>
              <ul className="ticks">
                <li><Icon d={I.phone} /> Mobile number and a one-time code by SMS or WhatsApp</li>
                <li><Icon d={I.pin} /> Addresses they&rsquo;ve used before, filled in for them</li>
                <li><Icon d={I.card} /> UPI, cards and net banking from your gateways — plus cash on delivery</li>
                <li><Icon d={I.shield} /> Phone login for shoppers: no passwords to forget</li>
              </ul>
            </div>
            <div className="ck" aria-hidden="true">
              <div className="ck__sheet">
                <div className="ck__head"><span>Loomwear</span><em><Icon d={I.shield} /> Secure checkout</em></div>
                <div className="ck__sum"><span>Order summary · 2 items</span><strong>₹2,299</strong></div>
                <ol className="ck__steps"><li className="done">Mobile</li><li className="done">Address</li><li className="now">Payment</li></ol>
                <p className="ck__title">Choose how to pay</p>
                <div className="ck__addr"><Icon d={I.pin} /><span><b>Ananya Sharma</b>Flat 402, Lotus Residency, Indiranagar, Bengaluru 560038</span></div>
                <div className="ck__opt is-on"><i /><span><b>UPI, cards &amp; net banking</b>Google Pay, PhonePe, Paytm, all cards</span></div>
                <div className="ck__opt"><i /><span><b>Cash on delivery</b>Pay when your order arrives</span></div>
                <div className="ck__pay"><Icon d={I.shield} /> Pay ₹2,299</div>
              </div>
              <div className="ck__otp">
                <span>Enter the code sent to +91 98765 00001</span>
                <div>{["4", "8", "1", "2", "9", "6"].map((d, i) => <b key={i}>{d}</b>)}</div>
              </div>
            </div>
          </div>
        </section>

        {/* Product page spotlight */}
        <section className="section">
          <div className="wrap split">
            <div className="browser">
              <div className="browser__bar">
                <span className="browser__dots" aria-hidden="true"><i /><i /><i /></span>
                <span className="browser__url">loomwear.oyklane.com/products/pure-linen-shirt</span>
              </div>
              <div className="browser__screen">
                <img src="/showcase/atelier-product.webp" alt="A product page with star rating, size and colour pickers and add to cart" width="1440" height="1000" loading="lazy" />
              </div>
            </div>
            <div className="head" style={{ marginBottom: 0 }}>
              <span className="kicker">Product pages</span>
              <h2 className="h2">Pages that turn visits into orders.</h2>
              <ul className="ticks">
                <li><Icon d={I.check} /> Separate Size and Colour pickers, with sold-out options crossed out</li>
                <li><Icon d={I.check} /> The photo changes to the colour they pick</li>
                <li><Icon d={I.check} /> Stars, reviews and verified-buyer badges</li>
                <li><Icon d={I.check} /> Delivery, COD and returns promises right by the button</li>
                <li><Icon d={I.check} /> Fast on phones — where most of your customers shop</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Steps */}
        <section className="section section--soft">
          <div className="wrap">
            <div className="head head--center">
              <span className="kicker">How it works</span>
              <h2 className="h2">From sign-up to first sale in an afternoon.</h2>
            </div>
            <ol className="steps">
              <li className="step">
                <h3 className="h3">Pick a theme</h3>
                <p className="muted">Choose Atelier, Lumière, Modern or Classic and make it yours in the editor.</p>
              </li>
              <li className="step">
                <h3 className="h3">Add your products</h3>
                <p className="muted">Photos, sizes and colours in a few clicks — or import a CSV of everything you sell.</p>
              </li>
              <li className="step">
                <h3 className="h3">Switch on payments</h3>
                <p className="muted">Connect a gateway, keep cash on delivery on, share your link — you&rsquo;re open.</p>
              </li>
            </ol>
          </div>
        </section>

        {/* Pricing */}
        <section className="section" id="pricing">
          <div className="wrap">
            <div className="head head--center">
              <span className="kicker">Pricing</span>
              <h2 className="h2">Simple plans. Try free for {pricing.trialDays} days.</h2>
              <p className="lead">
                {pricing.introEnabled ? `Then ${inr(pricing.introPrice)} for your first month on any plan. ` : ""}No setup fees, no product limits, and you can change plans whenever you like.
              </p>
            </div>
            <Pricing data={pricing} appUrl={APP_URL} />
          </div>
        </section>

        {/* FAQ */}
        <section className="section section--soft" id="faq">
          <div className="wrap">
            <div className="head head--center">
              <span className="kicker">Questions</span>
              <h2 className="h2">Good to know</h2>
            </div>
            <div className="faq">
              {faq(pricing).map(([q, a]) => (
                <details key={q}>
                  <summary>{q}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <div className="cta">
              <h2 className="h2">Open your store today.</h2>
              <p className="lead">Pick a theme, add a few products and share your link — your first month is on us.</p>
              <div className="hero__ctas" style={{ justifyContent: "center" }}>
                <a href={`${APP_URL}/register`} className="btn btn--light">Start your store <Icon d={I.arrow} /></a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap">
          <div className="footer__grid">
            <div>
              <a href="/" className="logo"><span className="logo__mark" aria-hidden="true" />Oyklane</a>
              <p className="muted" style={{ marginTop: 12, maxWidth: "32ch", fontSize: 14.5 }}>The commerce platform for Indian brands — themes, payments, GST and growth in one place.</p>
            </div>
            <div>
              <h4>Product</h4>
              <ul>
                <li><a href="#themes">Themes</a></li>
                <li><a href="#features">Features</a></li>
                <li><a href="#payments">Payments</a></li>
                <li><a href="#checkout">One-Click Checkout</a></li>
                <li><a href="#pricing">Pricing</a></li>
              </ul>
            </div>
            <div>
              <h4>Sellers</h4>
              <ul>
                <li><a href={`${APP_URL}/register`}>Start a store</a></li>
                <li><a href={`${APP_URL}/login`}>Log in</a></li>
                <li><a href={DEMO_URL} target="_blank" rel="noopener">Live demo store</a></li>
              </ul>
            </div>
            <div>
              <h4>Help</h4>
              <ul>
                <li><a href="#faq">FAQ</a></li>
                <li><a href={`${APP_URL}/login`}>Seller dashboard</a></li>
              </ul>
            </div>
          </div>
          <div className="footer__bottom">
            <span>© {new Date().getFullYear()} Oyklane. Made in India.</span>
            <span>Prices in INR, plus 18% GST.</span>
          </div>
        </div>
      </footer>
    </>
  );
}

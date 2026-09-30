import Link from "next/link";
import { ThemeShowcase } from "./ThemeShowcase";
import { Pricing } from "./Pricing";
import { getPlans } from "./plans";
import { Icon, I } from "./components/Icon";
import { APP_URL, DEMO_URL, inr } from "./components/site";
import { HeroShowcase } from "./components/HeroShowcase";
import { EditorMock, CheckoutMock, FlowMock, HelpMock } from "./components/mocks";
import { INTEGRATIONS } from "./data/integrations";

const MARQUEE = [
  ["Razorpay", "R", "#2B7BF6"],
  ["Cashfree", "C", "#6C3BF5"],
  ["PayU", "P", "#1FB45F"],
  ["Stripe", "S", "#635BFF"],
  ["PayPal", "PP", "#1A5ED6"],
  ["UPI", "U", "#0F766E"],
  ["Cash on delivery", "₹", "#16A34A"],
  ["Meta Pixel", "M", "#0866FF"],
  ["Google Analytics", "GA", "#F9AB00"],
  ["WhatsApp", "WA", "#25D366"],
  ["Shiprocket", "SR", "#7B3FE4"],
  ["Delhivery", "D", "#E11D48"],
  ["Google sign-in", "G", "#EA4335"],
];

const faq = (pricing) => [
  ["Do I need to know how to code?", "No. Pick a theme, change its colours, fonts, photos and sections in the editor, and arrange your product page by dragging blocks. The code editor is there if you ever want it."],
  ["How do I get paid?", "Straight into your own account. Connect Razorpay, Cashfree, PayU, Stripe or PayPal (test mode first, if you like) and switch cash on delivery on or off. Oyklane never holds your money."],
  ["What is One-Click Checkout?", "An app that turns checkout into a popup: the shopper types their mobile number, confirms a one-time code, picks a saved address and pays with any method your gateway offers — without leaving the page they were on."],
  ["What does Flow do?", "Flow sends emails for you when something happens: a thank-you after a first order, a review request three days after delivery, a nudge to someone who left their checkout. Start from a recipe, change the words, switch it on. It's free."],
  [
    "What does it cost?",
    `${pricing.plans.map((p, i) => `${i === 0 ? "" : i === pricing.plans.length - 1 ? " and " : ", "}${p.name} ${inr(p.priceMonthly)}`).join("")} a month (plus 18% GST), with a small fee per paid order. Every store starts with a ${pricing.trialDays}-day free trial${pricing.introEnabled ? `, then ${inr(pricing.introPrice)} for the first month` : ""}.`,
  ],
  ["Can I use my own domain?", "Yes. Every store gets a free yourname.oyklane.com address. Point your own domain at it from Settings ▸ Domains — SSL is set up for you."],
  ["What if I get stuck?", "Press Help in your dashboard. The assistant answers from our guides and knows your store's setup; if it can't sort it out, one click sends the conversation to our team, and we reply by email."],
];

export default async function HomePage() {
  const pricing = await getPlans();
  const cloud = INTEGRATIONS.filter((x) => x.status !== "soon").slice(0, 16);
  return (
    <>
      {/* ── Hero ── */}
      <section className="hero">
        <div className="wrap">
          <Link href="/#flow" className="pill">
            <b>New</b> Flow — customer emails that send themselves
            <span className="pill__go"><Icon d={I.arrow} /></span>
          </Link>
          <h1 className="h1">
            Build the store. <span className="grad">Grow the brand.</span>
          </h1>
          <p className="lead">
            A storefront you design without code, a checkout that takes seconds, UPI and cash on delivery, GST invoices — and apps that bring customers back. Built for Indian brands.
          </p>
          <div className="hero__ctas">
            <a href={`${APP_URL}/register`} className="btn btn--primary btn--lg">
              Start your free trial <Icon d={I.arrow} />
            </a>
            <Link href="/pricing" className="btn btn--ghost btn--lg">
              See pricing
            </Link>
          </div>
          <p className="hero__alt">
            {pricing.trialDays}-day free trial · no card needed to start
            {DEMO_URL && (
              <>
                {" · "}
                <a href={DEMO_URL} target="_blank" rel="noopener">see a live store</a>
              </>
            )}
          </p>
          <div className="features-row">
            Inside:
            <span className="chip"><Icon d={I.store} /> Store builder</span>
            <span className="chip"><Icon d={I.bolt} /> One-Click Checkout</span>
            <span className="chip"><Icon d={I.flow} /> Flow automations</span>
            <span className="chip"><Icon d={I.receipt} /> GST invoices</span>
          </div>
          <HeroShowcase />
        </div>

        <div className="marquee" aria-label="Works with">
          <p className="marquee__label">Works with the tools Indian brands use</p>
          <div className="marquee__track">
            {[...MARQUEE, ...MARQUEE].map(([name, mono, color], i) => (
              <span className="marquee__item" key={i} aria-hidden={i >= MARQUEE.length ? "true" : undefined}>
                <i style={{ background: color }}>{mono}</i>
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Everything you need ── */}
      <section className="section" id="features">
        <div className="wrap">
          <h2 className="h2 big-title" data-reveal>
            Everything you need to <span className="grad">sell online</span>
          </h2>

          <div className="feature" id="builder" data-reveal>
            <div className="feature__copy">
              <span className="eyebrow">
                <span className="eyebrow__icon"><Icon d={I.store} /></span>
                Store builder
              </span>
              <h3 className="h2">A store that looks like your brand</h3>
              <p className="lead">Start from a theme made for what you sell, then change colours, fonts, photos and every section. Drag the blocks on your product page into the order that sells.</p>
              <ul className="includes">
                <li className="includes__label">Includes</li>
                <li className="chip">4 themes</li>
                <li className="chip">Drag &amp; drop sections</li>
                <li className="chip">Your domain + SSL</li>
                <li className="chip">Mobile first</li>
              </ul>
              <p className="feature__more">
                <Link href="/#themes" className="link-arrow">See the themes <Icon d={I.arrow} /></Link>
              </p>
            </div>
            <div className="feature__visual">
              <EditorMock />
            </div>
          </div>

          <div className="feature feature--flip" id="checkout" data-reveal>
            <div className="feature__copy">
              <span className="eyebrow">
                <span className="eyebrow__icon"><Icon d={I.bolt} /></span>
                One-Click Checkout
              </span>
              <h3 className="h2">Checkout in seconds, not forms</h3>
              <p className="lead">Mobile number, a one-time code, a saved address, pay — in a popup, without leaving the page. Buyers who&rsquo;ve shopped on any Oyklane store find their address already there.</p>
              <ul className="includes">
                <li className="includes__label">Includes</li>
                <li className="chip">UPI · cards · COD</li>
                <li className="chip">OTP by SMS or WhatsApp</li>
                <li className="chip">Saved addresses</li>
                <li className="chip">Back to the popup if payment fails</li>
              </ul>
              <p className="feature__more">
                <Link href="/apps" className="link-arrow">Explore the app <Icon d={I.arrow} /></Link>
              </p>
            </div>
            <div className="feature__visual">
              <CheckoutMock />
            </div>
          </div>

          <div className="feature" id="flow" data-reveal>
            <div className="feature__copy">
              <span className="eyebrow">
                <span className="eyebrow__icon"><Icon d={I.flow} /></span>
                Flow automations
              </span>
              <h3 className="h2">Emails that send themselves</h3>
              <p className="lead">Pick a trigger, add waits and conditions, write the email once. Flow thanks first-time buyers, asks for reviews after delivery, and brings back customers who went quiet — every day, without you.</p>
              <ul className="includes">
                <li className="includes__label">Includes</li>
                <li className="chip">8 ready recipes</li>
                <li className="chip">Waits &amp; conditions</li>
                <li className="chip">Their name, their order</li>
                <li className="chip">Run history</li>
              </ul>
              <p className="feature__more">
                <Link href="/apps" className="link-arrow">Free in the app store <Icon d={I.arrow} /></Link>
              </p>
            </div>
            <div className="feature__visual">
              <FlowMock />
            </div>
          </div>

          <div className="feature feature--flip" id="help" data-reveal>
            <div className="feature__copy">
              <span className="eyebrow">
                <span className="eyebrow__icon"><Icon d={I.life} /></span>
                Help that knows your store
              </span>
              <h3 className="h2">Stuck? Answers in seconds</h3>
              <p className="lead">Ask in your own words — even in Hinglish. The assistant answers from our guides and your store&rsquo;s setup. Still stuck? One click sends the whole conversation to our team, and the reply lands in your inbox.</p>
              <ul className="includes">
                <li className="includes__label">Includes</li>
                <li className="chip">AI assistant</li>
                <li className="chip">Help centre</li>
                <li className="chip">Tickets answered by email</li>
              </ul>
            </div>
            <div className="feature__visual">
              <HelpMock />
            </div>
          </div>
        </div>
      </section>

      {/* ── And more ── */}
      <section className="section" id="more">
        <div className="wrap">
          <div className="head head--center" data-reveal>
            <span className="eyebrow eyebrow--center">
              <span className="eyebrow__icon"><Icon d={I.spark} /></span>
              And more
            </span>
            <h2 className="h2">Run a bigger business with less effort</h2>
          </div>
          <div className="bento" data-reveal>
            <article className="tile tile--wide">
              <span className="tile__icon"><Icon d={I.card} /></span>
              <h3 className="h3">Get paid your way</h3>
              <p>Razorpay, Cashfree, PayU, Stripe and PayPal — straight to your account, with every method your gateway offers shown with its logo. Cash on delivery on or off in one switch.</p>
              <div className="tile__demo mini-chips">
                <span>UPI</span>
                <span>Google Pay</span>
                <span>PhonePe</span>
                <span>Cards</span>
                <span>Net banking</span>
                <span>Wallets</span>
                <span>Cash on delivery</span>
              </div>
            </article>
            <article className="tile">
              <span className="tile__tag">₹299/mo app</span>
              <span className="tile__icon"><Icon d={I.phone} /></span>
              <h3 className="h3">Phone login</h3>
              <p>Shoppers sign in with a one-time code — no passwords. WhatsApp order updates are coming, included.</p>
            </article>
            <article className="tile">
              <span className="tile__icon"><Icon d={I.receipt} /></span>
              <h3 className="h3">GST-ready</h3>
              <p>Tax invoices with HSN codes, CGST/SGST or IGST worked out, and your buyer&rsquo;s GSTIN.</p>
            </article>
            <article className="tile">
              <span className="tile__icon"><Icon d={I.star} /></span>
              <h3 className="h3">Reviews that sell</h3>
              <p>Stars on every card, verified-buyer badges, replies and CSV import.</p>
              <div className="tile__demo"><span className="stars">★★★★★</span> <span className="muted">4.8 · 128 reviews</span></div>
            </article>
            <article className="tile">
              <span className="tile__icon"><Icon d={I.eye} /></span>
              <h3 className="h3">Live view &amp; analytics</h3>
              <p>Who&rsquo;s on your store right now, sales by day, top products — and a coin sound for every order.</p>
            </article>
            <article className="tile tile--half">
              <span className="tile__icon"><Icon d={I.chart} /></span>
              <h3 className="h3">Meta Pixel &amp; Google Analytics</h3>
              <p>Continue with Facebook and pick your pixel. Every shopping event is sent — checkout included — so your ads learn from real sales.</p>
            </article>
            <article className="tile tile--half">
              <span className="tile__icon"><Icon d={I.code} /></span>
              <h3 className="h3">API &amp; webhooks</h3>
              <p>Keys with exactly the access each tool needs, and signed webhooks for orders, products and customers.</p>
              <pre className="code">
                <span className="k">GET</span> /api/v1/orders?status=paid{"\n"}Authorization: Bearer <span className="s">oyk_••••••</span>
              </pre>
            </article>
          </div>
        </div>
      </section>

      {/* ── Integrations ── */}
      <section className="section section--tight" id="integrations">
        <div className="wrap">
          <div className="head head--center" data-reveal>
            <span className="eyebrow eyebrow--center">
              <span className="eyebrow__icon"><Icon d={I.puzzle} /></span>
              Integrations
            </span>
            <h2 className="h2">Plugged into the tools you already use</h2>
            <p className="lead">Payments, couriers, pixels, WhatsApp and your own code through our API — connected in a few clicks, no plugins to hunt for.</p>
          </div>
          <div className="int-cloud" data-reveal aria-hidden="true">
            {cloud.map((x) => (
              <span key={x.name} className="logo-tile" title={x.name}>
                <i style={{ background: x.color }}>{x.mono}</i>
              </span>
            ))}
          </div>
          <p style={{ textAlign: "center" }}>
            <Link href="/integrations" className="link-arrow">
              Explore the integrations library <Icon d={I.arrow} />
            </Link>
          </p>
        </div>
      </section>

      {/* ── Themes ── */}
      <section className="section" id="themes">
        <div className="wrap">
          <div className="head" data-reveal>
            <span className="eyebrow">
              <span className="eyebrow__icon"><Icon d={I.layers} /></span>
              Themes
            </span>
            <h2 className="h2">Four themes. Your brand in every one.</h2>
            <p className="lead">Start from a design made for what you sell, then make it yours — colours, fonts, photos and sections, all without code.</p>
          </div>
          <div data-reveal>
            <ThemeShowcase demoUrl={DEMO_URL} appUrl={APP_URL} />
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="section" id="pricing">
        <div className="wrap">
          <div className="head head--center" data-reveal>
            <span className="eyebrow eyebrow--center">
              <span className="eyebrow__icon"><Icon d={I.tag} /></span>
              Pricing
            </span>
            <h2 className="h2">Simple plans. Try free for {pricing.trialDays} days.</h2>
            <p className="lead">{pricing.introEnabled ? `Then ${inr(pricing.introPrice)} for your first month on any plan. ` : ""}No setup fees, no product limits, change plans whenever you like.</p>
          </div>
          <Pricing data={pricing} appUrl={APP_URL} />
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="section section--tight" id="faq">
        <div className="wrap">
          <div className="head head--center" data-reveal>
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

      {/* ── CTA ── */}
      <section className="section section--tight">
        <div className="wrap">
          <div className="cta" data-reveal>
            <h2 className="h2">
              Open your store <span className="grad">this week.</span>
            </h2>
            <p className="lead">Pick a theme, add a few products, switch on payments and share your link.</p>
            <div className="hero__ctas">
              <a href={`${APP_URL}/register`} className="btn btn--light btn--lg">
                Start your free trial <Icon d={I.arrow} />
              </a>
              <Link href="/apps" className="btn btn--ghost btn--lg">
                Browse apps
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

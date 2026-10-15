import Link from "next/link";
import { ThemeShowcase } from "./ThemeShowcase";
import { Pricing } from "./Pricing";
import { getPlans } from "./plans";
import { getApps, APP_LOGO } from "./data/apps";
import { Icon, I } from "./components/Icon";
import { APP_URL, DEMO_URL, MARKET_URL, inr } from "./components/site";
import { HeroShowcase } from "./components/HeroShowcase";
import { EditorMock, CheckoutMock, FlowMock, HelpMock } from "./components/mocks";
import { INTEGRATIONS } from "./data/integrations";
import { Logo, Mark } from "./components/Logo";

const WORKS_WITH = [
  ["Razorpay", { brand: "razorpay" }],
  ["Cashfree", { word: "cashfree" }],
  ["PayU", { word: "payu" }],
  ["Stripe", { brand: "stripe" }],
  ["PayPal", { brand: "paypal" }],
  ["UPI", { word: "upi" }],
  ["PhonePe", { brand: "phonepe" }],
  ["Meta", { brand: "meta" }],
  ["Google", { brand: "google" }],
  ["WhatsApp", { brand: "whatsapp" }],
  ["Shiprocket", { word: "shiprocket" }],
  ["Delhivery", { word: "delhivery" }],
];

/** Why sellers pick Oyklane — the highlighted band. */
const STRENGTHS = [
  { icon: I.cod, title: "Made for India", text: "UPI, cards, net banking and cash on delivery. GST invoices with HSN codes and your buyer's GSTIN." },
  { icon: I.bolt, title: "Checkout in seconds", text: "One-Click Checkout: mobile number, a code, a saved address, pay — without leaving the page." },
  { icon: I.chat, title: "WhatsApp and SMS built in", text: "Order updates, an inbox for replies and sign-in codes — from your number or ours." },
  { icon: I.megaphone, title: "Ads from your dashboard", text: "Run Meta and Google campaigns, see results in plain words and approve suggestions." },
  { icon: I.wallet, title: "Your money, directly", text: "Payments land in your own gateway account. Oyklane never holds your money." },
  { icon: I.layers, title: "No code needed", text: "Eight free themes, a drag-and-drop editor, your own domain with SSL — set up in an afternoon." },
  { icon: I.life, title: "Help in your language", text: "Ask in English or Hinglish. An assistant that knows your store, and real people behind it." },
  { icon: I.tag, title: "Simple pricing", text: "Monthly plans in ₹, no product limits, no setup fee. Pay-as-you-go extras like ₹0.50 per SMS." },
];

const GROW = [
  { logo: { brand: "meta" }, title: "Meta Ads", text: "Create Facebook and Instagram campaigns, check what's selling and pause what isn't — without Ads Manager.", href: "/integrations" },
  { logo: { brand: "google" }, title: "Google Ads", text: "Search, Shopping and Performance Max campaigns with keyword ideas and purchase tracking on your store.", href: "/integrations" },
  { logo: { brand: "whatsapp" }, title: "WhatsApp", text: "Order updates customers actually read, a shared inbox, templates and broadcasts to people who opted in.", href: "/integrations" },
  { logo: { icon: "flow" }, title: "Flow emails", text: "Thank first-time buyers, ask for reviews after delivery and win back quiet customers — automatically.", href: "/apps" },
];

const faq = (pricing) => [
  ["Do I need to know how to code?", "No. Pick a theme, change its colours, fonts, photos and sections in the editor, and arrange your product page by dragging blocks. The code editor is there if you ever want it."],
  ["How do I get paid?", "Straight into your own account. Connect Razorpay, Cashfree, PayU, Stripe or PayPal (test mode first, if you like) and switch cash on delivery on or off. Oyklane never holds your money."],
  ["What is One-Click Checkout?", "An app that turns checkout into a popup: the shopper types their mobile number, confirms a one-time code, picks a saved address and pays with any method your gateway offers — without leaving the page they were on."],
  ["Can I message customers on WhatsApp?", "Yes. Order confirmed, shipped and delivered messages go out automatically from Oyklane's number with your store's name — or connect your own WhatsApp Business number for your own templates, inbox and broadcasts."],
  [
    "What does it cost?",
    `${pricing.plans.map((p, i) => `${i === 0 ? "" : i === pricing.plans.length - 1 ? " and " : ", "}${p.name} ${inr(p.priceMonthly)}`).join("")} a month (plus 18% GST), with a small fee per paid order. Every store starts with a ${pricing.trialDays}-day free trial${pricing.introEnabled ? `, then ${inr(pricing.introPrice)} for the first month` : ""}.`,
  ],
  ["What is the Oyklane Store?", "Our marketplace of themes and apps made by Oyklane and independent developers. Install one on your store in a click; paid ones are billed with your plan."],
  ["Can I use my own domain?", "Yes. Every store gets a free yourname.oyklane.com address. Point your own domain at it from Settings ▸ Domains — SSL is set up for you."],
];

export default async function HomePage() {
  const [pricing, apps] = await Promise.all([getPlans(), getApps()]);
  const cloud = INTEGRATIONS.filter((x) => x.status !== "soon" && (x.logo.brand || x.logo.word)).slice(0, 16);
  const lowest = Math.min(...pricing.plans.map((p) => Number(p.priceMonthly) || Infinity));
  const storeApps = apps.filter((a) => APP_LOGO[a.key]).slice(0, 6);

  return (
    <>
      {/* ── Hero ── */}
      <section className="hero">
        <div className="wrap hero__grid">
          <div className="hero__copy">
            <h1 className="h1">Your own online store, made for selling in India.</h1>
            <p className="lead">
              Design your store without code. Take UPI, cards and cash on delivery, send GST invoices, keep customers updated on WhatsApp and run ads on Meta and Google — from one dashboard.
            </p>
            <div className="hero__ctas">
              <a href={`${APP_URL}/register`} className="btn btn--primary btn--lg">
                Start free trial
              </a>
              <Link href="/pricing" className="btn btn--ghost btn--lg">
                See pricing
              </Link>
            </div>
            <ul className="proof">
              <li><Icon d={I.check} /> {pricing.trialDays}-day free trial</li>
              <li><Icon d={I.check} /> No card needed to start</li>
              <li><Icon d={I.check} /> Live on your own domain</li>
            </ul>
            {DEMO_URL && (
              <p className="hero__alt">
                <a href={DEMO_URL} target="_blank" rel="noopener">See a live store</a>
              </p>
            )}
          </div>

          <div className="hero-visual" aria-label="An Oyklane store with a new UPI order, a WhatsApp update and a GST invoice" role="img">
            <div className="browser hero-visual__frame">
              <div className="browser__bar">
                <span className="browser__dots"><i /><i /><i /></span>
                <span className="browser__url">loomwear.oyklane.com</span>
              </div>
              <div className="browser__screen">
                <img src="/showcase/atelier.webp" alt="" width="1440" height="1000" fetchPriority="high" />
              </div>
            </div>
            <div className="float-card float-card--order">
              <span className="float-card__icon float-card__icon--green"><Icon d={I.cart} /></span>
              <span>
                <b>New order #1043 · ₹2,299</b>
                <small>Paid by UPI · just now</small>
              </span>
            </div>
            <div className="float-card float-card--wa">
              <span className="float-card__head"><Mark brand="whatsapp" size={16} /> WhatsApp</span>
              <p>Hi Ananya, your order #1043 from Loomwear is on its way with Delhivery.</p>
              <small>Sent automatically</small>
            </div>
            <div className="float-card float-card--gst">
              <span className="float-card__icon"><Icon d={I.receipt} /></span>
              <span>
                <b>GST invoice ready</b>
                <small>CGST + SGST · buyer GSTIN added</small>
              </span>
            </div>
          </div>
        </div>

        <div className="wrap works">
          <p className="works__label">Works with the payment, shipping and marketing tools you already use</p>
          <ul className="works__row">
            {WORKS_WITH.map(([name, logo]) => (
              <li key={name}>
                <Logo {...logo} size={32} />
                {name}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Strengths ── */}
      <section className="band band--dark" id="why">
        <div className="wrap">
          <div className="head">
            <h2 className="h2">Why Indian brands choose Oyklane</h2>
            <p className="lead">Everything a growing online shop needs, built in and working together — not a pile of plugins.</p>
          </div>
          <ul className="stats">
            <li><b>5</b><span>payment gateways, plus cash on delivery</span></li>
            <li><b>{Number.isFinite(lowest) ? inr(lowest) : "₹199"}</b><span>a month to start, plus GST</span></li>
            <li><b>{pricing.trialDays} days</b><span>free trial, no card needed</span></li>
            <li><b>₹0</b><span>setup fee and product limits</span></li>
          </ul>
          <div className="strengths">
            {STRENGTHS.map((s) => (
              <article key={s.title} className="strength">
                <span className="icon-tile icon-tile--dark"><Icon d={s.icon} /></span>
                <h3 className="h3">{s.title}</h3>
                <p>{s.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Product tour ── */}
      <section className="section" id="tour">
        <div className="wrap">
          <div className="head head--center">
            <h2 className="h2">See it in action</h2>
            <p className="lead">Your storefront, checkout, automations and dashboard — the screens you'll use every day.</p>
          </div>
          <HeroShowcase />
        </div>
      </section>

      {/* ── Features ── */}
      <section className="section section--alt" id="features">
        <div className="wrap">
          <div className="feature" id="builder">
            <div className="feature__copy">
              <span className="icon-tile"><Icon d={I.store} /></span>
              <h2 className="h2">A store that looks like your brand</h2>
              <p className="lead">Start from a theme made for what you sell, then change colours, fonts, photos and every section. Drag the blocks on your product page into the order that sells.</p>
              <ul className="includes">
                <li className="chip">8 free themes — fashion, jewellery, food, drinks, bags and one-product brands</li>
                <li className="chip">Drag-and-drop sections and product blocks</li>
                <li className="chip">Your own domain with free SSL</li>
                <li className="chip">Fast and mobile-first</li>
              </ul>
              <p className="feature__more"><Link href="/#themes" className="link-arrow">See the themes</Link></p>
            </div>
            <div className="feature__visual"><EditorMock /></div>
          </div>

          <div className="feature feature--flip" id="checkout">
            <div className="feature__copy">
              <span className="icon-tile"><Icon d={I.bolt} /></span>
              <h2 className="h2">Checkout in seconds, not forms</h2>
              <p className="lead">Mobile number, a one-time code, a saved address, pay — in a popup, without leaving the page. Shoppers who've bought on any Oyklane store find their address already there.</p>
              <ul className="includes">
                <li className="chip">UPI, cards and cash on delivery</li>
                <li className="chip">Codes by SMS or WhatsApp</li>
                <li className="chip">Saved addresses</li>
                <li className="chip">Back to the popup if a payment fails</li>
              </ul>
              <p className="feature__more"><Link href="/apps" className="link-arrow">Explore the app</Link></p>
            </div>
            <div className="feature__visual"><CheckoutMock /></div>
          </div>

          <div className="feature" id="flow">
            <div className="feature__copy">
              <span className="icon-tile"><Icon d={I.flow} /></span>
              <h2 className="h2">Emails that send themselves</h2>
              <p className="lead">Pick a trigger, add waits and conditions, write the email once. Flow thanks first-time buyers, asks for reviews after delivery and brings back customers who went quiet.</p>
              <ul className="includes">
                <li className="chip">8 ready recipes</li>
                <li className="chip">Waits and conditions</li>
                <li className="chip">Their name and their order in every email</li>
                <li className="chip">A history of every run</li>
              </ul>
              <p className="feature__more"><Link href="/apps" className="link-arrow">Free in the app store</Link></p>
            </div>
            <div className="feature__visual"><FlowMock /></div>
          </div>

          <div className="feature feature--flip" id="help">
            <div className="feature__copy">
              <span className="icon-tile"><Icon d={I.life} /></span>
              <h2 className="h2">Stuck? Answers in seconds</h2>
              <p className="lead">Ask in your own words — even in Hinglish. The assistant answers from our guides and your store's setup. Still stuck? One click sends the conversation to our team, and the reply lands in your inbox.</p>
              <ul className="includes">
                <li className="chip">AI assistant that knows your store</li>
                <li className="chip">Help centre</li>
                <li className="chip">Real people, answered by email</li>
              </ul>
            </div>
            <div className="feature__visual"><HelpMock /></div>
          </div>
        </div>
      </section>

      {/* ── Grow ── */}
      <section className="section" id="grow">
        <div className="wrap">
          <div className="head">
            <h2 className="h2">Bring in customers, then bring them back</h2>
            <p className="lead">Ads, WhatsApp and email work from the same dashboard as your orders — so you can see what each rupee brought in.</p>
          </div>
          <div className="grow">
            {GROW.map((g) => (
              <Link key={g.title} href={g.href} className="grow-card">
                <Logo {...g.logo} size={48} />
                <h3 className="h3">{g.title}</h3>
                <p>{g.text}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Oyklane Store (marketplace) ── */}
      <section className="section section--alt" id="store">
        <div className="wrap market">
          <div className="market__copy">
            <span className="icon-tile"><Icon d={I.grid} /></span>
            <h2 className="h2">The Oyklane Store: themes and apps for your shop</h2>
            <p className="lead">Add reviews, phone login, rentals, Instagram feeds and more — made by Oyklane and independent developers. Install in one click; paid ones are billed with your plan. Developers can sell their own themes and apps.</p>
            <div className="hero__ctas">
              <a href={MARKET_URL} className="btn btn--primary btn--lg" target="_blank" rel="noopener">
                Visit the Oyklane Store
              </a>
              <a href={`${MARKET_URL}/partners/dashboard`} className="btn btn--ghost btn--lg" target="_blank" rel="noopener">
                Developer dashboard
              </a>
            </div>
          </div>
          <div className="market__grid">
            {storeApps.map((a) => (
              <div key={a.key} className="market-app">
                <Logo {...APP_LOGO[a.key]} size={40} />
                <span>
                  <b>{a.name}</b>
                  <small>{a.usagePrice ? `₹${Number(a.usagePrice.amount).toFixed(2)} per ${a.usagePrice.unit}` : a.priceMonthly ? `${inr(a.priceMonthly)}/month` : "Free"}</small>
                </span>
              </div>
            ))}
            <div className="market-theme">
              <img src="/showcase/lumiere.webp" alt="" width="1440" height="1000" loading="lazy" />
              <span>
                <b>Lumière theme</b>
                <small>Jewellery and luxury</small>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Also built in ── */}
      <section className="section" id="more">
        <div className="wrap">
          <div className="head">
            <h2 className="h2">Also built in</h2>
            <p className="lead">The everyday parts of running an online shop in India, ready on day one.</p>
          </div>
          <div className="bento">
            <article className="tile tile--wide">
              <span className="tile__icon"><Icon d={I.card} /></span>
              <h3 className="h3">Get paid your way</h3>
              <p>Razorpay, Cashfree, PayU, Stripe and PayPal — straight to your account, with every method your gateway offers shown with its logo. Cash on delivery on or off in one switch.</p>
              <div className="tile__demo mini-chips">
                <span><Mark word="upi" /> UPI</span>
                <span><Mark brand="googlepay" /> Google Pay</span>
                <span><Mark brand="phonepe" /> PhonePe</span>
                <span><Mark brand="paytm" /> Paytm</span>
                <span><Mark brand="visa" /> Visa</span>
                <span><Mark brand="mastercard" /> Mastercard</span>
                <span><Mark word="rupay" /> RuPay</span>
                <span><Mark word="cod" /> Cash on delivery</span>
              </div>
            </article>
            <article className="tile">
              <span className="tile__tag">₹0.50 per SMS</span>
              <span className="tile__icon"><Icon d={I.phone} /></span>
              <h3 className="h3">Phone login</h3>
              <p>Shoppers sign in with a one-time code by SMS or WhatsApp — no passwords. Free to install; pay only for the codes sent.</p>
            </article>
            <article className="tile">
              <span className="tile__icon"><Icon d={I.receipt} /></span>
              <h3 className="h3">GST-ready</h3>
              <p>Tax invoices with HSN codes, CGST/SGST or IGST worked out, and your buyer's GSTIN.</p>
            </article>
            <article className="tile">
              <span className="tile__icon"><Icon d={I.star} /></span>
              <h3 className="h3">Reviews that sell</h3>
              <p>Stars on every card, verified-buyer badges, replies and CSV import.</p>
            </article>
            <article className="tile">
              <span className="tile__icon"><Icon d={I.eye} /></span>
              <h3 className="h3">Live view and analytics</h3>
              <p>Who's on your store right now, sales by day, top products — and a coin sound for every order.</p>
            </article>
            <article className="tile tile--half">
              <span className="tile__icon"><Icon d={I.chart} /></span>
              <h3 className="h3">Meta Pixel and Google Analytics</h3>
              <p>Continue with Facebook and pick your pixel. Every shopping event is sent — checkout included — so your ads learn from real sales.</p>
            </article>
            <article className="tile tile--half">
              <span className="tile__icon"><Icon d={I.code} /></span>
              <h3 className="h3">API and webhooks</h3>
              <p>Keys with exactly the access each tool needs, and signed webhooks for orders, products and customers.</p>
              <pre className="code">
                <span className="k">GET</span> /api/v1/orders?status=paid{"\n"}Authorization: Bearer <span className="s">oyk_••••••</span>
              </pre>
            </article>
          </div>
        </div>
      </section>

      {/* ── Integrations ── */}
      <section className="section section--alt" id="integrations">
        <div className="wrap">
          <div className="head">
            <h2 className="h2">Plugged into the tools you already use</h2>
            <p className="lead">Payments, couriers, pixels, WhatsApp and your own code through our API — connected in a few clicks, no plugins to hunt for.</p>
          </div>
          <div className="int-cloud" aria-hidden="true">
            {cloud.map((x) => (
              <Logo key={x.name} {...x.logo} size={76} title={x.name} />
            ))}
          </div>
          <p>
            <Link href="/integrations" className="link-arrow">Explore the integrations library</Link>
          </p>
        </div>
      </section>

      {/* ── Themes ── */}
      <section className="section" id="themes">
        <div className="wrap">
          <div className="head">
            <h2 className="h2">Eight free themes. Your brand in every one.</h2>
            <p className="lead">Start from a design made for what you sell, then make it yours — colours, fonts, photos and sections, all without code.</p>
          </div>
          <ThemeShowcase demoUrl={DEMO_URL} appUrl={APP_URL} />
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="section section--alt" id="pricing">
        <div className="wrap">
          <div className="head head--center">
            <h2 className="h2">Simple plans. Try free for {pricing.trialDays} days.</h2>
            <p className="lead">{pricing.introEnabled ? `Then ${inr(pricing.introPrice)} for your first month on any plan. ` : ""}No setup fees, no product limits, change plans whenever you like.</p>
          </div>
          <Pricing data={pricing} appUrl={APP_URL} />
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="section" id="faq">
        <div className="wrap faq-wrap">
          <div className="head">
            <h2 className="h2">Questions sellers ask</h2>
            <p className="lead">
              Something else? <a href={`${APP_URL}/register`} className="link-arrow">Start a free trial</a> and ask the Help assistant inside your dashboard.
            </p>
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

      {/* ── Call to action ── */}
      <section className="band band--violet">
        <div className="wrap cta">
          <div>
            <h2 className="h2">Open your store this week.</h2>
            <p className="lead">Pick a theme, add a few products, switch on payments and share your link.</p>
          </div>
          <div className="hero__ctas">
            <a href={`${APP_URL}/register`} className="btn btn--white btn--lg">
              Start free trial
            </a>
            <Link href="/pricing" className="btn btn--outline-white btn--lg">
              See pricing
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

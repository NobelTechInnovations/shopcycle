import Link from "next/link";
import { LegalPage, ContactBlock, LEGAL } from "../legal/LegalPage";

export const metadata = {
  title: "Privacy Policy",
  description: "What Oyklane collects, why, who it's shared with, how long it's kept, and your rights under India's Digital Personal Data Protection Act.",
  alternates: { canonical: "/privacy" },
};

const sections = [
  {
    id: "who",
    title: "Who we are",
    body: (
      <>
        <p>
          {LEGAL.name} (“Oyklane”, “we”) runs an e-commerce platform for businesses in India: sellers build an online store on Oyklane, sell through it, and
          manage orders, payments, marketing and apps from the Oyklane admin. This policy covers <strong>oyklane.com</strong>, the seller admin
          (store.oyklane.com), stores on <strong>*.oyklane.com</strong> and on sellers&apos; own domains, and our apps and APIs.
        </p>
        <ul>
          <li>
            <strong>Sellers</strong> (and their staff) who create an Oyklane account: we decide how their data is used, so we are its data fiduciary.
          </li>
          <li>
            <strong>Shoppers</strong> who buy from a store on Oyklane: the store is the seller you&apos;re buying from and decides how your data is used for
            your order — Oyklane processes it on the store&apos;s behalf. The store&apos;s own privacy policy also applies.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "collect",
    title: "What we collect",
    body: (
      <>
        <h3>From sellers</h3>
        <ul>
          <li>Account details: name, email, phone number, password (stored only as a one-way hash), two-step verification settings.</li>
          <li>Business and store details: store name, address, GSTIN, policies, products, images, prices, discounts, theme and settings.</li>
          <li>Billing: your plan, invoices and payment status. Card, UPI and bank details are handled by our payment partner (Razorpay); we don&apos;t store them.</li>
          <li>Support: messages to our team and to the Help assistant.</li>
          <li>Technical: IP address, browser, device type and activity logs, used to keep accounts secure.</li>
        </ul>
        <h3>From shoppers, for the store you buy from</h3>
        <ul>
          <li>Name, email, phone number, delivery and billing addresses, order history, reviews you write, and messages to the store.</li>
          <li>Sign-in: one-time codes sent by email, SMS or WhatsApp, or a password you set (hashed), or Google sign-in.</li>
          <li>Cart and visit information: products viewed, pages visited, device type and campaign links you arrived from, so the store can understand its sales.</li>
          <li>
            <strong>Oyklane account</strong>: when you sign in to a store with something that proves who you are (an emailed code, Google or a phone code), your
            browser keeps a signed token with that proven email or phone. Another Oyklane store you visit uses it to sign you in to the account you already have
            there — and creates one only when you open your account, sign-in or checkout on that store. You can sign out at any time, which removes it from
            your browser.
          </li>
          <li>Payments are made through the store&apos;s own payment gateway (such as Razorpay, Cashfree, PayU or Stripe). We receive the payment status, not your card or bank details.</li>
        </ul>
        <h3>From Google and Meta, when a seller connects them</h3>
        <p>
          A seller can sign in with Google and with Facebook once for their store (Settings ▸ Connected accounts). We then receive only what the seller&apos;s
          apps need:
        </p>
        <ul>
          <li>
            <strong>Google</strong>: the account&apos;s email, name and profile picture; the Google Business Profile locations it manages and their reviews and
            rating (Google Reviews app); its Merchant Center accounts, the product data source we add and Google&apos;s processing reports (Google &amp; YouTube
            app); and, if the seller uses it, its Google Analytics properties and web data streams (Google Analytics app).
          </li>
          <li>
            <strong>Meta</strong>: the Facebook user&apos;s name and id; the Pages they manage and the Instagram business accounts linked to them (profile and
            recent posts, for the Instagram Feed app); their businesses and product catalogues (Facebook &amp; Instagram shop); their ad accounts and pixels
            (Facebook Pixel, Meta Ads); and their WhatsApp Business accounts and numbers (WhatsApp app).
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "use",
    title: "How we use it",
    body: (
      <ul>
        <li>To run the service: host stores, take orders, send order and account emails and messages, show dashboards and reports, run the apps a seller installs.</li>
        <li>To sign people in and keep accounts, stores and payments secure, and to prevent fraud and abuse.</li>
        <li>To bill sellers for their plan and paid apps.</li>
        <li>To answer support requests, including with the Help assistant (an AI model answers from our help articles and the seller&apos;s store settings).</li>
        <li>To improve Oyklane, using aggregated information that doesn&apos;t identify anyone.</li>
        <li>To meet legal obligations (tax and accounting records, lawful requests).</li>
      </ul>
    ),
  },
  {
    id: "google",
    title: "Google user data",
    body: (
      <>
        <div className="legal__note">
          <p style={{ margin: 0 }}>
            Oyklane&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{" "}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </div>
        <ul>
          <li>We use Google data only to provide the features the seller turned on: showing their reviews on their store, listing their products in Merchant Center and reporting its status, and setting up Google Analytics on their store.</li>
          <li>We don&apos;t sell it, don&apos;t use it for advertising, and don&apos;t use it to develop or train generalised AI or machine-learning models.</li>
          <li>Our staff don&apos;t read it, except with the seller&apos;s permission for support, for security, or where the law requires.</li>
          <li>Google&apos;s access tokens are stored encrypted. Disconnecting Google in Settings ▸ Connected accounts deletes them and revokes our access at Google; you can also remove Oyklane at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">myaccount.google.com/permissions</a>.</li>
        </ul>
      </>
    ),
  },
  {
    id: "meta",
    title: "Meta (Facebook, Instagram, WhatsApp) data",
    body: (
      <ul>
        <li>We use data from Meta only for the seller&apos;s Meta apps: showing their Instagram posts on their store, keeping their catalogue in sync, listing their pixels, running the ads and WhatsApp messages they create.</li>
        <li>We never post, message or spend on a seller&apos;s behalf unless they ask for that in Oyklane.</li>
        <li>Access tokens are stored encrypted. Disconnecting Facebook in Settings ▸ Connected accounts deletes them; you can also remove Oyklane in Facebook ▸ Settings ▸ Apps and websites. See <Link href="/data-deletion">Data deletion</Link>.</li>
      </ul>
    ),
  },
  {
    id: "share",
    title: "Who we share it with",
    body: (
      <>
        <p>We don&apos;t sell personal data. We share it only:</p>
        <ul>
          <li><strong>With the store</strong> you buy from — your order and account details, so they can fulfil and support your order.</li>
          <li>
            <strong>With service providers</strong> who run parts of Oyklane for us under contract: hosting and databases (Railway, Vercel, Supabase), image
            storage (ImageKit), email (ZeptoMail), SMS and WhatsApp (Zoho, Twilio, MSG91, Meta), AI models for the Help assistant and writing tools, and our
            billing partner (Razorpay).
          </li>
          <li><strong>With services a seller connects</strong> — their payment gateway, couriers, Google, Meta, analytics — as needed for what they turned on.</li>
          <li><strong>When the law requires</strong> it, or to protect people, our users or Oyklane from fraud or harm.</li>
          <li><strong>If Oyklane is sold or merged</strong>, with the new owner, who must keep this policy&apos;s promises.</li>
        </ul>
      </>
    ),
  },
  {
    id: "where",
    title: "Where it's kept and how it's protected",
    body: (
      <ul>
        <li>Our main database is in Mumbai, India. Some providers (such as email, AI and hosting edge networks) may process data outside India, with appropriate safeguards.</li>
        <li>All traffic uses HTTPS. Passwords are hashed; access tokens and payment-gateway keys are encrypted at rest; staff access is limited and logged; sellers can turn on two-step verification.</li>
      </ul>
    ),
  },
  {
    id: "keep",
    title: "How long we keep it",
    body: (
      <ul>
        <li>Seller accounts and store data: while the account is open, then deleted within 30 days of a deletion request or account closure (backups within 90 days).</li>
        <li>Order and invoice records: as long as tax and accounting law requires (generally 8 years in India).</li>
        <li>Sign-in codes expire within minutes; security logs are kept up to 1 year.</li>
        <li>Data from Google or Meta: until the seller disconnects the account or uninstalls the app, then deleted.</li>
      </ul>
    ),
  },
  {
    id: "rights",
    title: "Your rights",
    body: (
      <>
        <p>Under the Digital Personal Data Protection Act, 2023 you can:</p>
        <ul>
          <li>get a summary of the personal data we hold about you and how it&apos;s used;</li>
          <li>have it corrected, completed or updated;</li>
          <li>have it erased when it&apos;s no longer needed (see <Link href="/data-deletion">Data deletion</Link>);</li>
          <li>withdraw consent you gave (for example to marketing messages) — as easily as you gave it;</li>
          <li>nominate someone to act for you; and</li>
          <li>complain to our Grievance Officer, and then to the Data Protection Board of India.</li>
        </ul>
        <p>
          Sellers can change most details in the admin. Shoppers can edit their details in their account on the store, and should contact the store first for
          their orders; you can also write to us at <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a>.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies",
    body: (
      <ul>
        <li><strong>Needed to work</strong>: your sign-in session, your cart, the Oyklane account sign-in described above, and security protections.</li>
        <li><strong>Preferences</strong>: for example light or dark mode on oyklane.com.</li>
        <li><strong>The store&apos;s own tools</strong>: a store may add analytics or advertising tags (such as Google Analytics or the Meta pixel). Those are the store&apos;s choice and covered by its policy.</li>
      </ul>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: <p>Oyklane is for businesses and adults. We don&apos;t knowingly collect personal data from children under 18 without verifiable consent from a parent or guardian; if you believe we have, write to us and we&apos;ll delete it.</p>,
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: <p>We&apos;ll post any changes here and update the date at the top. If a change matters, we&apos;ll tell sellers by email or in the admin before it takes effect.</p>,
  },
  {
    id: "contact",
    title: "Contact and grievances",
    body: <ContactBlock />,
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      intro="What Oyklane collects, why, who it's shared with, how long it's kept, and how to use your rights."
      sections={sections}
    />
  );
}

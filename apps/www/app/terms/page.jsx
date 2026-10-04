import Link from "next/link";
import { LegalPage, ContactBlock, LEGAL } from "../legal/LegalPage";

export const metadata = {
  title: "Terms of Service",
  description: "The terms for using Oyklane to build and run an online store — plans and billing, your responsibilities as a seller, and ours.",
  alternates: { canonical: "/terms" },
};

const courts = LEGAL.city ? `the courts at ${LEGAL.city}, India` : "the courts of India";

const sections = [
  {
    id: "agreement",
    title: "These terms",
    body: (
      <>
        <p>
          These terms are an agreement between you and {LEGAL.name} (“Oyklane”, “we”) for using oyklane.com, the seller admin, stores hosted on Oyklane,
          our apps and our APIs (together, the “Service”). By creating an account or using the Service you agree to them, and to our{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
        <p>
          You must be at least 18 and able to enter a binding contract. If you sign up for a business, you confirm you&apos;re allowed to agree for it, and
          “you” means that business.
        </p>
      </>
    ),
  },
  {
    id: "account",
    title: "Your account",
    body: (
      <ul>
        <li>Give accurate details and keep them up to date. Keep your password and sign-in codes private, and turn on two-step verification.</li>
        <li>You&apos;re responsible for what happens in your account, including what your staff do with the access you give them.</li>
        <li>Tell us straight away at <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> if you think someone else has access.</li>
      </ul>
    ),
  },
  {
    id: "service",
    title: "The Service",
    body: (
      <ul>
        <li>Each store gets a free address on oyklane.com and can connect a domain you own. You keep ownership of your domain.</li>
        <li>Themes, apps and features may change as we improve the Service. If we remove something you pay for, we&apos;ll tell you first and adjust your bill fairly.</li>
        <li>We aim to keep the Service available at all times but don&apos;t promise it will be uninterrupted or error-free; planned maintenance is announced where possible.</li>
      </ul>
    ),
  },
  {
    id: "billing",
    title: "Plans, trials and billing",
    body: (
      <ul>
        <li>Prices are in Indian rupees and exclude GST, which is added at 18% (or the rate in force). Each payment comes with a GST invoice.</li>
        <li>New stores may start with a free trial. To keep using your plan after it, set up autopay (UPI AutoPay, card or e-mandate through Razorpay); nothing is charged before the trial ends.</li>
        <li>Plans and paid apps renew each billing period until you cancel. You can change or cancel your plan from Settings ▸ Plan &amp; billing; cancellation takes effect at the end of the period you&apos;ve paid for.</li>
        <li>If a payment fails, we retry and let you know. If it stays unpaid, access to the admin can be paused — your store and data are kept, and everything resumes when you pay.</li>
        <li>Fees already paid aren&apos;t refunded for part-used periods, except where the law requires or we say otherwise.</li>
        <li>We&apos;ll give at least 30 days&apos; notice before raising the price of your plan.</li>
      </ul>
    ),
  },
  {
    id: "seller",
    title: "Your responsibilities as a seller",
    body: (
      <>
        <p>You are the seller to your customers. You are responsible for:</p>
        <ul>
          <li>the products you sell being lawful, safe, accurately described and correctly priced, and for having the rights to the images and text you use;</li>
          <li>complying with the laws that apply to your business, including the Consumer Protection Act, 2019 and E-Commerce Rules, 2020 (such as showing your business details, a grievance contact and your return, refund and shipping policies), GST and other taxes, and the Legal Metrology rules;</li>
          <li>fulfilling orders, deliveries, returns, refunds and customer support;</li>
          <li>the personal data of your customers: use it only for your store, keep it safe, honour their rights, and publish a privacy policy on your store; and</li>
          <li>any messages you send to customers, including getting consent for marketing.</li>
        </ul>
        <p>
          Don&apos;t sell anything illegal or restricted, including weapons, drugs, counterfeit or stolen goods, hazardous materials, or anything that
          infringes someone else&apos;s rights.
        </p>
      </>
    ),
  },
  {
    id: "payments",
    title: "Payments to your store",
    body: (
      <ul>
        <li>Your customers pay through your own payment gateway account (Razorpay, Cashfree, PayU, Stripe or others you connect) or cash on delivery. Money goes from the gateway to you; Oyklane doesn&apos;t hold your funds.</li>
        <li>Your agreement with your gateway — fees, settlement, chargebacks, refunds — is between you and the gateway.</li>
      </ul>
    ),
  },
  {
    id: "connected",
    title: "Connected accounts and third-party services",
    body: (
      <ul>
        <li>You can connect your Google and Facebook accounts once for your store; apps you turn on then act through them only for what you ask (for example listing products on Google or showing your Instagram posts). You can disconnect them any time in Settings ▸ Connected accounts.</li>
        <li>Third-party services (Google, Meta, payment gateways, couriers, messaging providers) have their own terms and policies, which apply to your use of them. We&apos;re not responsible for their services or decisions, such as approving a listing or an ad.</li>
      </ul>
    ),
  },
  {
    id: "content",
    title: "Your content and our platform",
    body: (
      <ul>
        <li>You own your store&apos;s content — products, images, text, customer lists. You give us permission to host, copy, display and adapt it as needed to run the Service and your store.</li>
        <li>Oyklane, its software, themes and brand belong to us. While your account is active you may use the themes and features on your store; you may not copy, resell or reverse-engineer the Service.</li>
        <li>AI features (product descriptions, the Help assistant) make suggestions — check them before you publish; you&apos;re responsible for what you put on your store.</li>
        <li>If you send us feedback, we may use it without owing you anything.</li>
      </ul>
    ),
  },
  {
    id: "use",
    title: "Acceptable use",
    body: (
      <p>
        Don&apos;t use the Service to break the law, deceive people, send spam, upload malware, probe or overload our systems, get around limits or security,
        access other stores&apos; data, or scrape the Service. Use the API within its documented limits and keep your API keys secret.
      </p>
    ),
  },
  {
    id: "shoppers",
    title: "For shoppers",
    body: (
      <p>
        When you buy from a store on Oyklane, your purchase is with that store, not with Oyklane: the store is responsible for the products, delivery,
        returns and refunds. Your Oyklane account sign-in (see the <Link href="/privacy#collect">Privacy Policy</Link>) is offered for convenience and you can
        sign out at any time.
      </p>
    ),
  },
  {
    id: "termination",
    title: "Suspension and closing an account",
    body: (
      <ul>
        <li>You can close your account at any time by writing to us from your account email.</li>
        <li>We may suspend or close an account that breaks these terms or the law, puts others at risk, or stays unpaid — with notice where we reasonably can.</li>
        <li>After closing, you can ask for an export of your store data within 30 days; after that it&apos;s deleted as described in our <Link href="/privacy#keep">Privacy Policy</Link>.</li>
      </ul>
    ),
  },
  {
    id: "liability",
    title: "Disclaimers and liability",
    body: (
      <ul>
        <li>The Service is provided “as is”. To the extent the law allows, we don&apos;t give warranties beyond those in these terms.</li>
        <li>We aren&apos;t liable for indirect or consequential losses, lost profits or lost data, or for what third-party services do.</li>
        <li>Our total liability for any claim is limited to the fees you paid us in the 12 months before the claim.</li>
        <li>You&apos;ll compensate us for claims from third parties caused by your products, your store content or your breach of these terms or the law.</li>
        <li>Nothing here limits liability that can&apos;t be limited by law.</li>
      </ul>
    ),
  },
  {
    id: "law",
    title: "Governing law and disputes",
    body: (
      <p>
        These terms are governed by the laws of India. Write to us first — most problems are solved quickly. If not, disputes go to {courts}.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: <p>We may update these terms. We&apos;ll post the new version here and, for important changes, tell sellers by email or in the admin at least 15 days before they apply. Using the Service after that means you accept them.</p>,
  },
  {
    id: "contact",
    title: "Contact",
    body: <ContactBlock />,
  },
];

export default function TermsPage() {
  return <LegalPage eyebrow="Legal" title="Terms of Service" intro="The terms for building and running a store on Oyklane." sections={sections} />;
}

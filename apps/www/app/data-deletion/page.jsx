import Link from "next/link";
import { LegalPage, ContactBlock, LEGAL } from "../legal/LegalPage";

export const metadata = {
  title: "Data deletion",
  description: "How to delete your Oyklane data, disconnect Google or Facebook, and remove your details from a store.",
  alternates: { canonical: "/data-deletion" },
};

const sections = [
  {
    id: "connected",
    title: "Disconnect Google or Facebook",
    body: (
      <>
        <p>To remove the data Oyklane received from Google or Meta (Facebook, Instagram, WhatsApp):</p>
        <ul>
          <li>
            In the Oyklane admin open <strong>Settings ▸ Connected accounts</strong> and press <strong>Disconnect</strong>. We delete the access tokens straight
            away and revoke our access at Google; the reviews, posts and catalogue status we stored for your apps are deleted within 30 days.
          </li>
          <li>
            Or remove Oyklane from your account: Google at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">myaccount.google.com/permissions</a>; Facebook at{" "}
            <strong>Settings &amp; privacy ▸ Settings ▸ Apps and websites</strong>. Then write to us and we&apos;ll delete what we stored.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "seller",
    title: "Delete your seller account and store",
    body: (
      <>
        <p>
          Email <a href={`mailto:${LEGAL.privacyEmail}?subject=Delete%20my%20Oyklane%20account`}>{LEGAL.privacyEmail}</a> from the email on your account, with
          your store&apos;s address. We confirm it&apos;s you, then delete your account, store, products, customers and connected accounts within 30 days
          (backups within 90 days).
        </p>
        <p>
          We keep only what the law requires — such as invoices for tax records — and delete it when that period ends. Ask for an export of your store data
          first if you want one.
        </p>
      </>
    ),
  },
  {
    id: "shopper",
    title: "If you shopped at a store on Oyklane",
    body: (
      <ul>
        <li>Sign in to your account on the store to see and change your details, or ask the store to delete them — the store decides about your order records.</li>
        <li>To stop the Oyklane account signing you in on other stores, press <strong>Sign out</strong> on any store; it&apos;s removed from that browser.</li>
        <li>You can also write to us with the store&apos;s name and the email or phone you used, and we&apos;ll pass it to the store and help.</li>
      </ul>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <>
        <p>
          More about what we keep and why: <Link href="/privacy">Privacy Policy</Link>.
        </p>
        <ContactBlock />
      </>
    ),
  },
];

export default function DataDeletionPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Data deletion"
      intro="How to delete your data from Oyklane, disconnect Google or Facebook, or remove your details from a store."
      sections={sections}
    />
  );
}

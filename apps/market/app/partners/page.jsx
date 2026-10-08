import Link from "next/link";
import { api } from "@/lib/api";

export const metadata = { title: "Build for Oyklane", description: "Sell themes and apps to Indian brands on Oyklane. Keep most of every sale; we handle payments, GST and licences." };

export default async function PartnersLanding() {
  const share = Math.round(((await api("/api/market/public/browse?kind=theme").catch(() => null))?.partnerShare ?? 0.8) * 100);
  return (
    <>
      <section className="hero">
        <div className="wrap hero__in">
          <span className="badge badge--accent">Oyklane developers</span>
          <h1 style={{ marginTop: 16, maxWidth: 820 }}>
            Build themes and apps for Indian brands. <span className="grad-text">Keep {share}%.</span>
          </h1>
          <p className="lead">List free or paid. Oyklane takes the payment, checks the licence and sends your share to your UPI ID.</p>
          <div className="row" style={{ marginTop: 28 }}>
            <Link className="btn btn--accent btn--lg" href="/partners/signup">
              Create a developer account
            </Link>
            <Link className="btn btn--lg" href="/partners/docs">
              Read the docs
            </Link>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap stack" style={{ gap: 24 }}>
          <h2>How it works</h2>
          <div className="steps">
            <div className="card">
              <h3>Build</h3>
              <p className="muted small" style={{ marginTop: 6 }}>Themes are Liquid, like the ones Oyklane ships. Apps use the Oyklane API and webhooks — and can add a script to the storefront.</p>
            </div>
            <div className="card">
              <h3>Upload and preview</h3>
              <p className="muted small" style={{ marginTop: 6 }}>Upload a theme as a .zip — we check every file and show it on our demo store, every page, straight away.</p>
            </div>
            <div className="card">
              <h3>Review</h3>
              <p className="muted small" style={{ marginTop: 6 }}>Our team checks it works, is fast and is safe. Usually within 2 working days.</p>
            </div>
            <div className="card">
              <h3>Get paid</h3>
              <p className="muted small" style={{ marginTop: 6 }}>Themes: one-time price. Apps: monthly, billed with the seller's plan. Your {share}% goes to your UPI ID.</p>
            </div>
          </div>
          <div className="card card--pad">
            <h3>Your work stays yours</h3>
            <ul className="ticks" style={{ marginTop: 12 }}>
              <li>Theme files never leave our servers — previews are rendered, not downloaded.</li>
              <li>A paid theme is licensed to one store. Its code is locked: the seller customises it in the editor but can't read or copy it.</li>
              <li>A sale counts only when Razorpay confirms the payment — signature, order and amount all checked.</li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}

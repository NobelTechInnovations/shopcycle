import { Browse } from "../components/Browse";
import { ComingSoonCard, COMING_SOON_APPS } from "../components/Cards";

export const metadata = { title: "Apps", description: "Apps for Oyklane stores — marketing, reviews, shipping, payments and more." };

export default async function AppsPage({ searchParams }) {
  const sp = await searchParams;
  // Courier apps on the way — shown unless a filter rules shipping out.
  const showSoon = !sp?.q && (!sp?.category || sp.category === "shipping") && (!sp?.price || sp.price === "all");
  return (
    <>
      <Browse kind="app" base="/apps" searchParams={searchParams} title="Apps" intro="Add what your store needs. Paid apps are billed monthly with your Oyklane plan." />
      {showSoon && (
        <section className="wrap" style={{ paddingBottom: 56 }}>
          <h2 style={{ fontSize: 22, marginBottom: 6 }}>Coming soon: shipping</h2>
          <p className="muted" style={{ marginTop: 0 }}>One-click courier connections — live rates, label booking and tracking inside your orders.</p>
          <div className="grid grid--apps">
            {COMING_SOON_APPS.map((a) => (
              <ComingSoonCard key={a.slug} item={a} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

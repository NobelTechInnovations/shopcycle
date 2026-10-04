import { Pricing } from "../Pricing";
import { getPlans } from "../plans";
import { Icon, I } from "../components/Icon";
import { APP_URL, inr } from "../components/site";

export const metadata = {
  title: "Pricing",
  description: "Simple monthly plans for Indian brands, with a free trial. Prices in INR, plus GST — no setup fees, no product limits.",
};

export default async function PricingPage() {
  const pricing = await getPlans();
  const { plans } = pricing;
  // Every feature any plan has, in plan order, with which plans include it.
  const seen = new Map();
  for (const p of plans) for (const f of p.features || []) if (!seen.has(f.key)) seen.set(f.key, f.name);
  const rows = [...seen.entries()];

  const faq = [
    ["Is there a free trial?", `Yes — ${pricing.trialDays} days on any plan${pricing.introEnabled ? `, then ${inr(pricing.introPrice)} for your first month` : ""}. You choose autopay (UPI or card) to carry on; nothing is charged during the trial.`],
    ["What's the fee per order?", `A small percentage of each paid order — ${plans.map((p) => `${p.name} ${p.commissionPercent}%`).join(", ")}. It's billed with your plan, never taken from your payments.`],
    ["Can I change plans later?", "Anytime. Upgrades apply straight away; downgrades at the end of the period you've paid for."],
    ["Do apps cost extra?", "Most apps are free, including Flow and One-Click Checkout (which adds a small fee on orders paid through it). Paid apps, like Phone Login, show their monthly price before you install."],
    ["Is GST included?", "No — prices are before 18% GST, and every bill comes with a GST invoice."],
  ];

  return (
    <>
      <section className="wrap page-hero page-hero--center">
        <div>
          <span className="eyebrow eyebrow--center">
            <span className="eyebrow__icon"><Icon d={I.tag} /></span>
            Pricing
          </span>
          <h1 className="h1">
            Simple plans. <span className="grad">Free for {pricing.trialDays} days.</span>
          </h1>
          <p className="lead">No setup fees, no product limits, and you can change plans whenever you like.</p>
        </div>
      </section>

      <section className="wrap" style={{ paddingBottom: 90 }}>
        <Pricing data={pricing} appUrl={APP_URL} />
      </section>

      {rows.length > 0 && (
        <section className="section section--tight">
          <div className="wrap">
            <div className="head head--center" data-reveal>
              <h2 className="h2">Compare plans</h2>
            </div>
            <div className="table-wrap">
              <table className="compare">
                <thead>
                  <tr>
                    <th scope="col">Feature</th>
                    {plans.map((p) => (
                      <th key={p.key} scope="col">{p.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Price per month</td>
                    {plans.map((p) => (
                      <td key={p.key}>{inr(p.priceMonthly)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td>Fee per paid order</td>
                    {plans.map((p) => (
                      <td key={p.key}>{p.commissionPercent}%</td>
                    ))}
                  </tr>
                  <tr>
                    <td>Staff accounts</td>
                    {plans.map((p) => (
                      <td key={p.key}>{p.staffLimit}</td>
                    ))}
                  </tr>
                  {rows.map(([key, name]) => (
                    <tr key={key}>
                      <td>{name}</td>
                      {plans.map((p) => (
                        <td key={p.key}>
                          {(p.features || []).some((f) => f.key === key) ? (
                            <>
                              <Icon d={I.check} />
                              <span className="sr-only">Included</span>
                            </>
                          ) : (
                            <span className="no" aria-label="Not included">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      <section className="section section--tight" id="faq">
        <div className="wrap">
          <div className="head head--center" data-reveal>
            <h2 className="h2">Pricing questions</h2>
          </div>
          <div className="faq">
            {faq.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "https://api.oyklane.com").replace(/\/$/, "");

// Shown only if the API can't be reached while the page is built.
const FALLBACK = {
  trialDays: 3,
  introEnabled: true,
  introPrice: 99,
  annualDiscountPercent: 20,
  plans: [
    { key: "starter", name: "Starter", tagline: "Everything to open your store.", priceMonthly: 599, priceYearly: 5750.4, commissionPercent: 2, staffLimit: 2, features: [] },
    { key: "growth", name: "Growth", tagline: "Marketing, reports and GST invoices for a growing brand.", priceMonthly: 1199, priceYearly: 11510.4, commissionPercent: 1.5, staffLimit: 10, features: [] },
    { key: "pro", name: "Pro", tagline: "The lowest fees, API access and priority support.", priceMonthly: 1999, priceYearly: 19190.4, commissionPercent: 0.5, staffLimit: 30, features: [] },
  ],
};

/** The plans exactly as Super admin ▸ Plans has them (the public sign-up
 * endpoint), refreshed every minute — and at once when Super admin saves a
 * plan (app/api/revalidate). The page never waits on the API per visit. */
export async function getPlans() {
  try {
    const res = await fetch(`${API_URL}/api/auth/plans`, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    if (!data?.plans?.length) throw new Error("no plans");
    const yearlyOff = (p) => (p.priceMonthly ? Math.round((1 - p.priceYearly / (p.priceMonthly * 12)) * 100) : 0);
    return {
      trialDays: data.trialDays ?? FALLBACK.trialDays,
      introEnabled: data.introEnabled ?? true,
      introPrice: data.introPrice ?? FALLBACK.introPrice,
      annualDiscountPercent: Math.max(0, ...data.plans.map(yearlyOff)),
      plans: data.plans,
    };
  } catch {
    return FALLBACK;
  }
}

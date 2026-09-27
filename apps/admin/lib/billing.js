import { formatCurrency } from "@shopcycle/utils";

/**
 * Shared by the billing screens (/billing and Settings ▸ Plan & billing).
 * Every amount and every decision comes from the API (/api/billing) — this
 * file only formats and opens Razorpay's Checkout window.
 */
export const inr = (n) => formatCurrency(Number(n || 0), "INR");

/** Subscription status → StatusBadge props. */
export const STATUS = {
  TRIALING: { status: "scheduled", label: "Free trial" },
  PENDING_PAYMENT: { status: "failed", label: "Payment needed" },
  ACTIVE: { status: "active", label: "Active" },
  PAST_DUE: { status: "failed", label: "Past due" },
  GRACE_PERIOD: { status: "pending", label: "Payment failed" },
  CANCEL_SCHEDULED: { status: "pending", label: "Ends soon" },
  CANCELLED: { status: "cancelled", label: "Cancelled" },
  SUSPENDED: { status: "suspended", label: "Suspended" },
  EXPIRED: { status: "expired", label: "Expired" },
};

export const METHODS = [
  { key: "upi", label: "UPI AutoPay", hint: "Approve once in your UPI app. Up to ₹15,000 per payment." },
  { key: "card", label: "Credit or debit card", hint: "Visa, Mastercard, RuPay — saved securely by Razorpay." },
  { key: "emandate", label: "Bank e-mandate", hint: "Net banking. Your bank confirms within 1–3 days." },
];

export const KIND_LABEL = {
  intro: "First month",
  regular: "Subscription",
  proration: "Upgrade",
  fees: "Checkout fees",
  reactivation: "Subscription",
  subscription: "Subscription",
};

export const PURPOSE_LABEL = { mandate_setup: "Autopay setup", charge: "Automatic charge", manual: "One-time payment" };

export function daysLeft(d) {
  if (!d) return null;
  return Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000));
}

export function formatDay(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const GST = (amount, rate) => Math.round(Number(amount) * Number(rate)) / 100;
export const withGst = (amount, rate) => Math.round((Number(amount) + GST(amount, rate)) * 100) / 100;
export const gstOf = GST;

let scriptPromise = null;
function loadCheckoutScript() {
  if (typeof window !== "undefined" && window.Razorpay) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        scriptPromise = null;
        reject(new Error("Couldn't load the payment window. Check your connection and try again."));
      };
      document.body.appendChild(s);
    });
  }
  return scriptPromise;
}

/**
 * Opens Razorpay Checkout with the options the API returned. Resolves with
 * { orderId, paymentId, signature } — which the API then verifies with
 * Razorpay; the browser's word is never taken as proof of payment.
 * Rejects with `cancelled: true` if the window is closed.
 */
export async function openCheckout(options) {
  await loadCheckoutScript();
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: options.key,
      order_id: options.order_id,
      ...(options.customer_id && { customer_id: options.customer_id }),
      ...(options.recurring && { recurring: options.recurring }),
      amount: options.amount,
      currency: options.currency || "INR",
      name: options.name || "Oyklane",
      description: options.description,
      prefill: options.prefill,
      notes: options.notes,
      theme: { color: "#111111" },
      handler: (res) => resolve({ orderId: res.razorpay_order_id, paymentId: res.razorpay_payment_id, signature: res.razorpay_signature }),
      modal: {
        ondismiss: () => reject(Object.assign(new Error("Payment window closed."), { cancelled: true })),
      },
    });
    rzp.on("payment.failed", (res) => {
      // Checkout lets the seller retry inside the window; this only
      // surfaces why the attempt failed.
      const reason = res?.error?.description;
      if (reason) console.warn("Payment attempt failed:", reason);
    });
    rzp.open();
  });
}

/** Runs a checkout the API started: sandbox finishes server-side; Razorpay
 * opens the window, then the API verifies. Returns the fresh billing
 * overview (or null when the seller closed the window). */
export async function completeCheckout(apiFetch, started) {
  if (started.completed) return { billing: started.billing, status: "captured" };
  let paid;
  try {
    paid = await openCheckout(started.checkout);
  } catch (err) {
    if (err.cancelled) return null;
    throw err;
  }
  const verified = await apiFetch("/api/billing/checkout/verify", { method: "POST", body: paid });
  return { billing: verified.billing, status: verified.status };
}

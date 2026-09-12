"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

/**
 * Mirrors apps/storefront/.../checkout/pay/page.jsx's pattern (a Razorpay
 * checkout widget is inherently client-side JS, unlike the rest of this
 * app) but in `subscription_id` mode rather than `order_id` — this
 * authorizes a recurring mandate instead of collecting a one-off payment.
 *
 * Unlike that storefront page, this one has no dynamic route segment or
 * cookie-reading parent to force dynamic rendering, so a production build
 * would try to statically prerender it — useSearchParams() then requires
 * an explicit Suspense boundary (see Next's "missing-suspense-with-csr-
 * bailout" docs) even though nothing here actually needs to suspend at
 * runtime (there's no server data fetch, just reading the URL).
 */
export default function BillingPayPage() {
  return (
    <Suspense fallback={<PayFallback />}>
      <BillingPay />
    </Suspense>
  );
}

function PayFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-app-bg px-4 text-center">
      <p className="text-sm text-ink-muted">Opening secure payment window…</p>
    </div>
  );
}

function BillingPay() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const subscriptionId = searchParams.get("subscriptionId");
  const key = searchParams.get("key");
  const planId = searchParams.get("planId");
  const [status, setStatus] = useState("loading"); // loading | opening | error

  useEffect(() => {
    if (!subscriptionId || !key || !planId) {
      setStatus("error");
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => {
      setStatus("opening");
      const rzp = new window.Razorpay({
        key,
        subscription_id: subscriptionId,
        name: "Oyklane",
        description: "Monthly platform billing mandate",
        handler: async function handleMandateAuthorized(response) {
          try {
            await apiFetch("/api/store/subscribe/verify", {
              method: "POST",
              body: {
                planId,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_subscription_id: response.razorpay_subscription_id,
                razorpay_signature: response.razorpay_signature,
              },
            });
            router.push("/admin");
            router.refresh();
          } catch (err) {
            router.push(`/billing?billingError=${encodeURIComponent(err.message)}`);
          }
        },
        modal: {
          ondismiss: function handleDismiss() {
            router.push("/billing?billingError=Mandate authorization was cancelled.");
          },
        },
      });
      rzp.on("payment.failed", function handleFailed() {
        router.push("/billing?billingError=Mandate authorization failed. Please try again.");
      });
      rzp.open();
    };
    script.onerror = () => setStatus("error");
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, [subscriptionId, key, planId, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-app-bg px-4 text-center">
      {status === "error" ? (
        <div>
          <h1 className="text-lg font-semibold text-ink mb-2">Couldn't start billing setup</h1>
          <p className="text-sm text-ink-muted">
            <a href="/billing" className="text-brand underline">
              Go back and try again
            </a>
          </p>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">Opening secure payment window…</p>
      )}
    </div>
  );
}

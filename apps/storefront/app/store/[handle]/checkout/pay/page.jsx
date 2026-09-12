"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

/**
 * The one page in this storefront that isn't a Liquid-rendered template or
 * a zero-JS form — a payment gateway's own checkout modal is inherently a
 * client-side widget, so this is a deliberate, narrow exception to the
 * "plain HTML forms, no client JS" pattern used everywhere else here (see
 * apps/storefront/lib/cart-actions.js's doc comments for that pattern).
 *
 * The order already exists server-side (created "pending" by the checkout
 * POST before redirecting here) — this page's only job is to collect the
 * payment against it and hand the result to a same-origin route so the API
 * is never called directly from the browser.
 */
export default function RazorpayPayPage() {
  const { handle } = useParams();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order");
  const rzpOrderId = searchParams.get("rzpOrderId");
  const amount = searchParams.get("amount");
  const key = searchParams.get("key");
  const [status, setStatus] = useState("loading"); // loading | opening | error

  useEffect(() => {
    if (!orderId || !rzpOrderId || !amount || !key) {
      setStatus("error");
      return;
    }

    // A rewrite (see proxy.js) is invisible to the browser — window.location
    // always reflects what the visitor actually typed/clicked. On a store's
    // own (sub)domain that's a clean "/checkout/pay"; on the internal
    // /store/:handle preview path it's "/store/:handle/checkout/pay". Either
    // way, stripping this page's own suffix off the current path gives
    // exactly the right base for every other link on this page — no env
    // vars or host-parsing needed client-side.
    const basePath = window.location.pathname.replace(/\/checkout\/pay\/?$/, "");

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => {
      setStatus("opening");
      const rzp = new window.Razorpay({
        key,
        amount,
        currency: "INR",
        order_id: rzpOrderId,
        name: "Checkout",
        handler: async function handlePaymentSuccess(response) {
          const verifyRes = await fetch(`${basePath}/checkout/razorpay/verify`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ orderId, ...response }),
          });
          if (verifyRes.ok) {
            window.location.href = `${basePath}/checkout/confirmation?order=${orderId}`;
          } else {
            window.location.href = `${basePath}/checkout?checkoutError=${encodeURIComponent(
              "Payment could not be verified. Please contact us with your order number."
            )}`;
          }
        },
        modal: {
          ondismiss: function handleDismiss() {
            window.location.href = `${basePath}/checkout?checkoutError=${encodeURIComponent(
              "Payment was cancelled."
            )}`;
          },
        },
      });
      rzp.on("payment.failed", function handlePaymentFailed() {
        window.location.href = `${basePath}/checkout?checkoutError=${encodeURIComponent(
          "Payment failed. Please try again."
        )}`;
      });
      rzp.open();
    };
    script.onerror = () => setStatus("error");
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, [handle, orderId, rzpOrderId, amount, key]);

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        color: "#1a1a1a",
        textAlign: "center",
        padding: 24,
      }}
    >
      {status === "error" ? (
        <div>
          <h1 style={{ fontSize: 20 }}>Couldn't start payment</h1>
          <p style={{ color: "#6b7280" }}>
            {/* Reached only after the client-side effect above has already run
                (this state is never the initial render), so window is safe here. */}
            <a href={`${window.location.pathname.replace(/\/checkout\/pay\/?$/, "")}/checkout`}>Go back to checkout</a>
          </p>
        </div>
      ) : (
        <p>Opening secure payment window…</p>
      )}
    </div>
  );
}

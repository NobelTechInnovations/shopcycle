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
const RZP_METHODS = {
  upi: { name: "Pay with UPI", instruments: [{ method: "upi" }] },
  card: { name: "Pay with card", instruments: [{ method: "card" }] },
  netbanking: { name: "Net banking", instruments: [{ method: "netbanking" }] },
  wallet: { name: "Wallets", instruments: [{ method: "wallet" }] },
  emi: { name: "EMI", instruments: [{ method: "emi" }, { method: "cardless_emi" }] },
  paylater: { name: "Pay later", instruments: [{ method: "paylater" }] },
};

export default function RazorpayPayPage() {
  const { handle } = useParams();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order");
  const rzpOrderId = searchParams.get("rzpOrderId");
  const amount = searchParams.get("amount");
  const key = searchParams.get("key");
  // Started from the One-Click popup: a closed window or failed payment
  // goes back to that page (popup reopened), not to the checkout page.
  const back = searchParams.get("back");
  // The way to pay the shopper picked at checkout — Razorpay opens on it.
  const method = searchParams.get("method");
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
    const safeBack = back && back.startsWith("/") && !back.startsWith("//") && !back.includes("\\") ? back : null;
    const retry = (message) => {
      if (safeBack) {
        const url = new URL(safeBack, window.location.origin);
        url.searchParams.set("oyCheckout", "retry");
        url.searchParams.set("oyError", message);
        return url.pathname + url.search;
      }
      return `${basePath}/checkout?checkoutError=${encodeURIComponent(message)}`;
    };
    // Back from the thank-you page, or this page restored from the history:
    // don't open the payment window again.
    const seen = `oy-rzp-${orderId}`;
    try {
      if (sessionStorage.getItem(seen)) {
        window.location.replace(retry("Payment wasn't completed. Try again, or choose another way to pay."));
        return undefined;
      }
      sessionStorage.setItem(seen, "1");
    } catch {}

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
        // Show only the method chosen at checkout (Razorpay's "configure
        // payment methods": one block, default blocks hidden).
        ...(RZP_METHODS[method] && {
          config: {
            display: {
              blocks: { chosen: { name: RZP_METHODS[method].name, instruments: RZP_METHODS[method].instruments } },
              sequence: ["block.chosen"],
              preferences: { show_default_blocks: false },
            },
          },
        }),
        handler: async function handlePaymentSuccess(response) {
          const verifyRes = await fetch(`${basePath}/checkout/razorpay/verify`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ orderId, ...response }),
          });
          // replace(): Back from the thank-you page never returns here.
          if (verifyRes.ok) {
            window.location.replace(`${basePath}/checkout/confirmation?order=${orderId}`);
          } else {
            window.location.replace(retry("Payment could not be verified. If you were charged, contact the store with your order number."));
          }
        },
        modal: {
          ondismiss: function handleDismiss() {
            window.location.replace(retry("Payment was cancelled. Try again, or choose another way to pay."));
          },
        },
      });
      rzp.on("payment.failed", function handlePaymentFailed() {
        window.location.replace(retry("Payment failed. Try again, or choose another way to pay."));
      });
      rzp.open();
    };
    script.onerror = () => setStatus("error");
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, [handle, orderId, rzpOrderId, amount, key, back, method]);

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

import { FlaskConical, Info } from "lucide-react";

/**
 * Tells the merchant how plan billing behaves on this deployment, before
 * they click anything (billing.mode from the API):
 *   sandbox       — local test mode: plans start with no payment
 *   unconfigured  — plans can't be chosen yet
 *   razorpay      — normal; renders nothing
 */
export function BillingModeNotice({ billing, className = "" }) {
  if (billing?.mode === "sandbox") {
    return (
      <div
        role="status"
        className={`flex items-start gap-2.5 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 ${className}`}
      >
        <FlaskConical size={16} className="text-accent mt-0.5 shrink-0" aria-hidden="true" />
        <p className="text-sm text-ink m-0">
          <strong className="font-semibold">Test mode.</strong> Choosing a plan starts the free trial straight away, with no
          Razorpay mandate and no payment. Real billing switches on once Razorpay keys are added.
        </p>
      </div>
    );
  }
  if (billing?.mode === "unconfigured") {
    return (
      <div
        role="status"
        className={`flex items-start gap-2.5 rounded-lg border border-status-warning/30 bg-status-warning/5 px-4 py-3 ${className}`}
      >
        <Info size={16} className="text-status-warning mt-0.5 shrink-0" aria-hidden="true" />
        <div className="text-sm text-ink">
          <p className="m-0">
            <strong className="font-semibold">Plan billing isn't switched on yet.</strong> You can keep using your store;
            choosing a plan will open up shortly.
          </p>
          {billing.setupHint && <p className="text-[13px] text-ink-muted mt-1 mb-0">Setup: {billing.setupHint}</p>}
        </div>
      </div>
    );
  }
  return null;
}

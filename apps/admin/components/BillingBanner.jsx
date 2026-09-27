"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Clock, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { daysLeft, formatDay } from "@/lib/billing";

const TONE = {
  info: { box: "border-accent/30 bg-accent/5", icon: "text-accent", Icon: Clock },
  warning: { box: "border-status-warning/30 bg-status-warning/5", icon: "text-status-warning", Icon: AlertTriangle },
  danger: { box: "border-status-danger/30 bg-status-danger/5", icon: "text-status-danger", Icon: AlertTriangle },
};

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Locked, suspended and unpaid stores never reach the shell (the admin
 * layout sends them to /billing), so only the open-dashboard states show. */
function messageFor(s) {
  const reason = s.access?.reason;
  if (reason === "trial" && !s.autopay) {
    const left = daysLeft(s.trialEndsAt);
    return {
      tone: left != null && left <= 1 ? "warning" : "info",
      title: left === 0 ? "Your free trial ends today." : `Free trial: ${plural(left ?? 0, "day")} left.`,
      text: `Set up autopay to keep your dashboard open after ${formatDay(s.trialEndsAt)}. Nothing is charged until the trial ends.`,
      cta: { href: "/billing", label: "Set up autopay" },
    };
  }
  if (reason === "grace") {
    return {
      tone: "warning",
      title: "Your last payment didn't go through.",
      text: `Pay by ${formatDay(s.graceEndsAt)} to keep your dashboard open. We'll also retry automatically.`,
      cta: { href: "/billing", label: "Pay now" },
    };
  }
  if (reason === "expired_grace") {
    return {
      tone: "warning",
      title: "Your subscription has ended.",
      text: `Your dashboard stays open until ${formatDay(s.graceEndsAt)}. Choose a plan to keep going.`,
      cta: { href: "/billing", label: "Choose a plan" },
    };
  }
  if (reason === "cancel_scheduled") {
    return {
      tone: "info",
      title: "Your subscription is ending.",
      text: `It stays active until ${formatDay(s.currentPeriodEnd)}.`,
      cta: { href: "/admin/settings/billing", label: "Resume" },
    };
  }
  if (s.notice) {
    return {
      tone: s.notice.severity === "danger" ? "danger" : "warning",
      title: s.notice.title,
      text: s.notice.body,
      cta: { href: "/admin/settings/billing", label: "View billing" },
      noticeId: s.notice.id,
    };
  }
  return null;
}

export function BillingBanner() {
  const pathname = usePathname();
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/billing/status")
      .then((s) => !cancelled && setStatus(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const msg = status && messageFor(status);
  if (!msg || pathname?.startsWith("/admin/settings/billing")) return null;
  const tone = TONE[msg.tone];

  async function dismiss() {
    setStatus((s) => ({ ...s, notice: null }));
    await apiFetch("/api/billing/notifications/read", { method: "POST", body: { ids: [msg.noticeId] } }).catch(() => {});
  }

  return (
    <div role="status" className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border px-4 py-3 ${tone.box}`}>
      <div className="flex items-start gap-2.5 min-w-0">
        <tone.Icon size={18} className={`${tone.icon} mt-0.5 shrink-0`} aria-hidden="true" />
        <p className="m-0 text-sm text-ink">
          <strong className="font-semibold">{msg.title}</strong> {msg.text}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href={msg.cta.href}
          className="inline-flex items-center h-8 px-3 rounded-lg bg-ink text-white text-[13px] font-medium hover:opacity-90"
        >
          {msg.cta.label}
        </Link>
        {msg.noticeId && (
          <button type="button" onClick={dismiss} aria-label="Dismiss" className="p-1 rounded text-ink-muted hover:text-ink">
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

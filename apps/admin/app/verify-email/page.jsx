"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button, Skeleton } from "antd";
import { CheckCircle2 } from "lucide-react";
import { AuthShell } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<AuthShell title="Confirming your email…"><Skeleton active paragraph={{ rows: 2 }} /></AuthShell>}>
      <VerifyEmail />
    </Suspense>
  );
}

/** The link from the sign-up email. Confirms on arrival — the token itself
 * is the proof, so no sign-in is needed. */
function VerifyEmail() {
  const token = useSearchParams().get("token") || "";
  const [state, setState] = useState({ status: "loading" });
  const ran = useRef(false);

  useEffect(() => {
    // Strict mode runs effects twice in dev; the token only works once.
    if (ran.current) return;
    ran.current = true;
    if (!token) {
      setState({ status: "error", message: "This link is incomplete. Open it straight from the email." });
      return;
    }
    apiFetch("/api/auth/email/verify", { method: "POST", body: { token } })
      .then((r) => setState({ status: "ok", email: r.email }))
      .catch((err) => setState({ status: "error", message: err.message }));
  }, [token]);

  if (state.status === "loading") {
    return (
      <AuthShell title="Confirming your email…">
        <Skeleton active paragraph={{ rows: 2 }} />
      </AuthShell>
    );
  }

  if (state.status === "ok") {
    return (
      <AuthShell title="Email confirmed" subtitle={`${state.email} is confirmed — you can always recover your account with it.`}>
        <div className="flex items-center gap-2 text-status-success mb-6">
          <CheckCircle2 size={18} aria-hidden="true" /> <span className="text-sm">All set.</span>
        </div>
        <Link href="/admin">
          <Button type="primary" block size="large" className="!h-11">
            Go to your store
          </Button>
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="We couldn't confirm your email" subtitle={state.message}>
      <Link href="/admin">
        <Button type="primary" block size="large" className="!h-11">
          Go to your dashboard
        </Button>
      </Link>
      <p className="text-sm text-ink-muted mt-4 mb-0">You can send a fresh link from the banner on your dashboard.</p>
    </AuthShell>
  );
}

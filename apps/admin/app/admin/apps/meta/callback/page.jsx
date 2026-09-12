"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

/**
 * Where META_OAUTH_REDIRECT_URI (see apps/api/src/config/env.js) points —
 * Meta lands the browser here with `?code=...` after the merchant approves
 * access. This page's only job is to hand that code to the API (as an
 * authenticated same-site request, so the API knows which store it's for)
 * and then bounce back to whichever app screen started the connect flow
 * (see MetaConnectPanel's RETURN_TO_KEY).
 */
export default function MetaCallbackPage() {
  return (
    <Suspense fallback={<CallbackStatus text="Connecting…" />}>
      <MetaCallback />
    </Suspense>
  );
}

function CallbackStatus({ text }) {
  return (
    <div className="flex items-center justify-center py-24">
      <p className="text-sm text-ink-muted">{text}</p>
    </div>
  );
}

function MetaCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const returnTo = sessionStorage.getItem("meta-connect-return-to") || "/admin/apps";
    if (!code) {
      setError("Facebook didn't return an authorization code — the connection was likely cancelled.");
      return;
    }
    apiFetch("/api/meta/connect/exchange", { method: "POST", body: { code } })
      .then(() => router.replace(returnTo))
      .catch((err) => setError(err.message));
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
        <p className="text-sm text-status-danger">{error}</p>
        <a href="/admin/apps" className="text-sm text-brand underline">
          Back to Apps
        </a>
      </div>
    );
  }

  return <CallbackStatus text="Finishing connection…" />;
}

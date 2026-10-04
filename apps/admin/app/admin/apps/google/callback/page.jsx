"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

/**
 * Where Google sends the seller back after "Sign in with Google" — the
 * store's one Google account, used by every Google app (the redirect URI
 * registered on Oyklane's Google OAuth client). Hands the code to the API
 * — the state inside says which store and page asked — then goes back.
 */
export default function GoogleCallbackPage() {
  return (
    <Suspense fallback={<Status text="Connecting…" />}>
      <GoogleCallback />
    </Suspense>
  );
}

function Status({ text }) {
  return (
    <div className="flex items-center justify-center py-24">
      <p className="text-sm text-ink-muted">{text}</p>
    </div>
  );
}

function GoogleCallback() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState(null);
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state) {
      setError(params.get("error") === "access_denied" ? "Google sign-in was cancelled." : "Google didn't send a sign-in code. Try connecting again.");
      return;
    }
    apiFetch("/api/accounts/google/callback", { method: "POST", body: { code, state } })
      .then((d) => router.replace(`${d.redirect}${d.redirect.includes("?") ? "&" : "?"}connected=google`))
      .catch((err) => setError(err.message));
  }, [params, router]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-24 text-center px-4">
        <p className="text-sm text-status-danger max-w-md">{error}</p>
        <a href="/admin/apps" className="text-sm underline">
          Back to Apps
        </a>
      </div>
    );
  }
  return <Status text="Finishing the Google connection…" />;
}

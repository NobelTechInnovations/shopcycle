"use client";

import { useEffect, useState } from "react";
import { API_URL, apiFetch } from "@/lib/api";

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.6 10.6 0 0 0 12 1 11 11 0 0 0 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z" />
    </svg>
  );
}

/** "Continue with Google" — a full-page visit to the API, which sends the
 * seller to Google and back. Hidden until the platform has Google set up. */
export function GoogleSignIn() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    apiFetch("/api/auth/google/config")
      .then((c) => setEnabled(Boolean(c?.enabled)))
      .catch(() => {});
  }, []);

  if (!enabled) return null;
  return (
    <>
      <div className="flex items-center gap-3 my-5 text-xs text-ink-muted">
        <span className="h-px flex-1 bg-app-border" />
        or
        <span className="h-px flex-1 bg-app-border" />
      </div>
      <a
        href={`${API_URL}/api/auth/google/start`}
        className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-app-border bg-app-surface text-sm font-medium text-ink hover:bg-app-bg"
      >
        <GoogleMark /> Continue with Google
      </a>
    </>
  );
}

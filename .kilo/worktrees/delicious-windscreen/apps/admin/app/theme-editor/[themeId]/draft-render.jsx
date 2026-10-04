"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

// A preview that fails because the connection blipped (a redeploy, a
// moment of bad Wi-Fi, a busy database) is retried before anything is
// shown — most of the time the seller never sees the hiccup.
const RETRY_DELAYS = [700, 2000, 4500];

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

function retryable(err) {
  // No status: the request never got an answer ("Failed to fetch").
  return !err.status || err.status >= 500 || err.status === 429;
}

export function friendlyPreviewError(err) {
  if (!err.status) return "Couldn't reach Oyklane to refresh the preview. Check your internet connection.";
  if (err.status === 401) return "You've been signed out. Sign in again to keep editing.";
  if (err.status >= 500) return "The preview server is busy right now.";
  return err.message || "The preview couldn't be refreshed.";
}

/** One render-draft call with retries. Rejects with AbortError when a
 * newer edit replaced it. */
export async function renderDraft(themeId, body, signal) {
  for (let attempt = 0; ; attempt++) {
    try {
      const { html } = await apiFetch(`/api/themes/${themeId}/render-draft`, { method: "POST", body, signal });
      return html;
    } catch (err) {
      if (signal?.aborted || err.name === "AbortError") throw err;
      if (!retryable(err) || attempt >= RETRY_DELAYS.length) throw err;
      await wait(RETRY_DELAYS[attempt], signal);
    }
  }
}

/**
 * Debounced live preview: renders `body` whenever `deps` change, cancels
 * the request a newer edit makes stale, and on failure keeps the last good
 * preview on screen with an error bar instead of replacing it.
 * Returns { html, error, busy, retry }.
 */
export function useDraftRender(themeId, makeBody, deps, { delay = 400, enabled = true } = {}) {
  const [html, setHtml] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);
  const makeBodyRef = useRef(makeBody);
  makeBodyRef.current = makeBody;

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const out = await renderDraft(themeId, makeBodyRef.current(), controller.signal);
        setHtml(out);
        setError(null);
      } catch (err) {
        if (controller.signal.aborted || err.name === "AbortError") return;
        setError(friendlyPreviewError(err));
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeId, enabled, nonce, delay, ...deps]);

  return { html, error, busy, retry: () => setNonce((n) => n + 1) };
}

/** The bar shown over the preview when a refresh failed. */
export function PreviewErrorBar({ error, onRetry, hasPreview }) {
  if (!error) return null;
  return (
    <div className="absolute left-1/2 -translate-x-1/2 top-3 z-10 max-w-[92%] flex items-center gap-3 bg-white border border-red-200 shadow-md rounded-lg px-3 py-2 text-[12.5px]">
      <span className="text-red-700">
        {error}
        {hasPreview && <span className="text-ink-muted"> Showing the last version.</span>}
      </span>
      <button type="button" onClick={onRetry} className="shrink-0 font-medium text-accent hover:underline cursor-pointer bg-transparent border-0 p-0">
        Try again
      </button>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { App, Alert, Button, Card } from "antd";
import { CheckCircle2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { BrandGlyph } from "@/components/apps/AppTile";

/**
 * The store's Google and Facebook accounts (Settings ▸ Connected
 * accounts): one sign-in each, shared by every app that needs it. An app
 * page shows <AccountSignIn> until the account is there, then
 * <AccountLine> above its own "pick your business / catalog" step.
 */

export const ACCOUNT = {
  google: { name: "Google", glyph: "google-reviews", button: "Sign in with Google" },
  facebook: { name: "Facebook", glyph: "meta-ads", button: "Continue with Facebook" },
};

/** Sends the browser to Google's / Facebook's sign-in; it comes back to
 * `returnTo` (an admin path). */
export async function startSignIn(kind, returnTo, { rerequest = false } = {}) {
  const back = returnTo || (typeof window !== "undefined" ? window.location.pathname : "/admin/settings/accounts");
  if (kind === "google") {
    const { url } = await apiFetch("/api/accounts/google/url", { method: "POST", body: { returnTo: back } });
    window.location.href = url;
    return;
  }
  const { url } = await apiFetch("/api/accounts/facebook/url", { method: "POST", body: { rerequest } });
  sessionStorage.setItem("meta-connect-endpoint", "/api/accounts/facebook/connect");
  sessionStorage.setItem("meta-connect-return-to", back);
  window.location.href = url;
}

/** True when an app's call failed because the account (or more of it) is
 * needed — the API's 409 { needs: "google" | "facebook" }. */
export const needsAccount = (err) => err?.status === 409 && Boolean(err?.details?.needs);

export function SignInButton({ kind, returnTo, rerequest = false, size = "large", children, className = "" }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const a = ACCOUNT[kind];
  async function go() {
    setBusy(true);
    try {
      await startSignIn(kind, returnTo, { rerequest });
    } catch (err) {
      message.error(err.message);
      setBusy(false);
    }
  }
  return (
    <Button
      type="primary"
      size={size}
      loading={busy}
      onClick={go}
      className={`${kind === "facebook" ? "!bg-[#0866FF] !border-[#0866FF]" : ""} ${className}`}
      icon={kind === "facebook" ? <BrandGlyph app={{ key: a.glyph }} size={16} white /> : <span className="w-[18px] h-[18px] rounded-full bg-white inline-flex items-center justify-center"><BrandGlyph app={{ key: a.glyph }} size={12} /></span>}
    >
      {children || a.button}
    </Button>
  );
}

/**
 * The step before an app can work: sign in once for the whole store.
 * `account` is the API's status for that account; `access` the part this
 * app needs ("reviews", "merchant", "instagram", "catalog", "pixel"…).
 */
export function AccountSignIn({ kind, account, access, title, description, returnTo }) {
  const a = ACCOUNT[kind];
  const missing = account?.connected && access && account.access && account.access[access] === false;
  return (
    <Card>
      <div className="flex items-start gap-4">
        <span className="w-12 h-12 rounded-[14px] bg-white border border-app-border flex items-center justify-center shrink-0">
          <BrandGlyph app={{ key: a.glyph }} size={24} />
        </span>
        <div className="min-w-0">
          <h2 className="m-0 text-[17px] font-semibold text-ink">{title}</h2>
          <p className="m-0 mt-1 text-[13.5px] text-ink-muted">{description}</p>
        </div>
      </div>
      {!account?.configured ? (
        <Alert className="mt-5" type="info" showIcon message={`${a.name} sign-in is being set up on Oyklane`} description="It'll appear here as soon as it's ready — nothing for you to configure." />
      ) : missing ? (
        <div className="mt-5 flex flex-col gap-2 items-start">
          <p className="m-0 text-[13px] text-ink">
            Signed in as <b>{account.email || account.name}</b>, but {a.name} didn&apos;t give Oyklane access to this. Sign in again and tick every box.
          </p>
          <SignInButton kind={kind} returnTo={returnTo} rerequest>
            Allow access
          </SignInButton>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-2 items-start">
          {account?.error && <Alert type="warning" showIcon message={account.error} className="w-full" />}
          <SignInButton kind={kind} returnTo={returnTo} />
          <p className="m-0 text-[12px] text-ink-muted">
            One sign-in for your store — every {a.name} app you add uses it, so you won&apos;t be asked again.
          </p>
        </div>
      )}
    </Card>
  );
}

/** "Using your Google account x@gmail.com · Manage". */
export function AccountLine({ kind, account }) {
  const a = ACCOUNT[kind];
  if (!account?.connected) return null;
  return (
    <p className="m-0 mb-4 flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-muted">
      <CheckCircle2 size={14} className="text-status-success" aria-hidden="true" />
      Using your {a.name} account <b className="text-ink font-medium">{account.email || account.name}</b>
      <span aria-hidden="true">·</span>
      <Link href="/admin/settings/accounts" className="text-ink-muted underline">
        Manage
      </Link>
    </p>
  );
}

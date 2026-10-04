"use client";

import { useCallback, useEffect, useState } from "react";
import { App, Alert, Button, Card, Skeleton, Tag } from "antd";
import { Check, Minus, Unlink } from "lucide-react";
import { useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { BrandGlyph } from "@/components/apps/AppTile";
import { ACCOUNT, SignInButton } from "@/components/accounts/AccountConnect";

// What each account is used for, in the seller's words.
const USES = {
  google: [
    { key: "reviews", label: "Google Reviews — your Business Profile's reviews" },
    { key: "merchant", label: "Google & YouTube — your products in Merchant Center" },
  ],
  facebook: [
    { key: "instagram", label: "Instagram Feed — your posts" },
    { key: "catalog", label: "Facebook & Instagram shop — your catalogue" },
    { key: "pixel", label: "Facebook Pixel — your pixels" },
    { key: "ads", label: "Meta Ads — your ad accounts" },
    { key: "whatsapp", label: "WhatsApp — your business number" },
  ],
};

const when = (iso) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null);

function AccountCard({ kind, account, onChanged }) {
  const { message } = App.useApp();
  const { confirmDialog } = useConfirmDialog();
  const a = ACCOUNT[kind];

  async function disconnect() {
    const ok = await confirmDialog({
      title: `Disconnect ${a.name}?`,
      content: `Apps that use your ${a.name} account stop updating until you sign in again. What's already on your store stays.`,
      okText: "Disconnect",
      danger: true,
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/accounts/${kind}`, { method: "DELETE" });
      message.success(`${a.name} disconnected`);
      onChanged();
    } catch (err) {
      message.error(err.message);
    }
  }

  const missing = account?.connected && USES[kind].some((u) => account.access?.[u.key] === false);
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <span className="w-11 h-11 rounded-[12px] bg-white border border-app-border flex items-center justify-center shrink-0">
            <BrandGlyph app={{ key: a.glyph }} size={22} />
          </span>
          <div className="min-w-0">
            <p className="m-0 text-[15px] font-semibold text-ink flex items-center gap-2">
              {a.name} {account?.connected ? <Tag color="green" className="!m-0">Connected</Tag> : <Tag className="!m-0">Not connected</Tag>}
            </p>
            {account?.connected ? (
              <p className="m-0 mt-0.5 text-[13px] text-ink-muted truncate">
                {account.email || account.name}
                {kind === "google" && account.connectedAt ? ` · since ${when(account.connectedAt)}` : ""}
                {kind === "facebook" && account.expiresAt ? ` · sign in again by ${when(account.expiresAt)}` : ""}
              </p>
            ) : (
              <p className="m-0 mt-0.5 text-[13px] text-ink-muted">Sign in once — every {a.name} app uses it.</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {account?.configured && (!account.connected || missing) && (
            <SignInButton kind={kind} returnTo="/admin/settings/accounts" size="middle" rerequest={Boolean(missing)}>
              {account.connected ? "Sign in again" : a.button}
            </SignInButton>
          )}
          {account?.connected && (
            <Button danger icon={<Unlink size={14} aria-hidden="true" />} onClick={disconnect}>
              Disconnect
            </Button>
          )}
        </div>
      </div>
      {!account?.configured && <Alert className="mt-4" type="info" showIcon message={`${a.name} sign-in is being set up on Oyklane — nothing for you to configure.`} />}
      {account?.error && <Alert className="mt-4" type="warning" showIcon message={account.error} />}
      {account?.connected && (
        <ul className="m-0 mt-4 pl-0 list-none flex flex-col gap-1.5">
          {USES[kind].map((u) => {
            const ok = account.access?.[u.key] !== false;
            return (
              <li key={u.key} className="flex items-center gap-2 text-[13px] text-ink">
                {ok ? <Check size={14} className="text-status-success" aria-hidden="true" /> : <Minus size={14} className="text-ink-subtle" aria-hidden="true" />}
                <span className={ok ? "" : "text-ink-muted"}>{u.label}</span>
                {!ok && <span className="text-[12px] text-ink-muted">· not allowed</span>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function ConnectedAccounts() {
  const { message } = App.useApp();
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch("/api/accounts"));
    } catch (err) {
      message.error(err.message);
    }
  }, [message]);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) return <Skeleton active paragraph={{ rows: 6 }} />;
  return (
    <div className="flex flex-col gap-5">
      <AccountCard kind="google" account={data.google} onChanged={load} />
      <AccountCard kind="facebook" account={data.facebook} onChanged={load} />
      <p className="m-0 text-[12.5px] text-ink-muted">
        Oyklane only reads what each app needs, and never posts or spends anything you didn&apos;t ask for. You can also remove Oyklane from your Google or
        Facebook account settings at any time.
      </p>
    </div>
  );
}

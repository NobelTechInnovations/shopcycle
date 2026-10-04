"use client";

import { useCallback, useEffect, useState } from "react";
import { App, Alert, Button, Card, Skeleton, Tag } from "antd";
import { RefreshCw, Unlink, ExternalLink, Globe } from "lucide-react";
import { PageHeader, useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { AppNotInstalled } from "@/components/apps/AppPanelParts";
import { AccountSignIn, AccountLine, needsAccount } from "@/components/accounts/AccountConnect";
import { ProductsHealth, ManualFeedCard, VerificationCard } from "@/components/channels/ChannelParts";

const when = (iso) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");

const MANUAL_STEPS = [
  "Open merchants.google.com and sign in (create a free account for India if you don't have one).",
  "Add your business details, shipping and return policy under Settings — Google asks for them before listing products.",
  "Go to Products ▸ Add products ▸ Add products from a file ▸ “Enter a link to your file”.",
  "Paste the feed link above, choose a daily fetch, and save. Google reads your products from it every day.",
];

/** The Merchant Center accounts on the store's Google account — pick one. */
function ChooseMerchant({ onConnected, onNeedsAccount, onUnavailable }) {
  const { message } = App.useApp();
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  // Merchant Center can't be reached through the sign-in yet: the feed link
  // steps open by themselves.
  const [manual, setManual] = useState(false);

  useEffect(() => {
    apiFetch("/api/channels/google/accounts")
      .then((d) => setList(d.accounts))
      .catch((err) => {
        if (needsAccount(err)) return onNeedsAccount();
        setError(err.message);
        onUnavailable?.();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function choose(id) {
    setBusy(id);
    try {
      onConnected(await apiFetch("/api/channels/google/choose", { method: "POST", body: { accountId: id } }));
      message.success("Merchant Center connected — Google is reading your products");
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  if (error) return <Alert type="warning" showIcon message={error} />;
  if (!list) return <Skeleton active paragraph={{ rows: 2 }} title={false} />;
  if (!list.length) {
    return (
      <Alert
        type="info"
        showIcon
        message="No Merchant Center account on this Google account yet"
        description={
          <>
            Create one free (choose India), then come back here.{" "}
            <a href="https://merchants.google.com/mc/merchantsignup" target="_blank" rel="noopener noreferrer">
              Create Merchant Center account
            </a>
          </>
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {list.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-app-border px-3 py-2.5">
          <span className="text-[14px] text-ink">
            {a.name} <span className="text-ink-muted text-[12.5px]">· ID {a.id}</span>
          </span>
          <Button type="primary" loading={busy === a.id} onClick={() => choose(a.id)}>
            Use this account
          </Button>
        </div>
      ))}
    </div>
  );
}

/** Apps ▸ Google & YouTube: products on Google through Merchant Center. */
export default function GoogleShoppingPage() {
  const { message } = App.useApp();
  const { confirmDialog } = useConfirmDialog();
  const [data, setData] = useState(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch("/api/channels/google"));
      setMissing(false);
    } catch (err) {
      if (err.status === 402) setMissing(true);
      else message.error(err.message);
    }
  }, [message]);

  useEffect(() => {
    load();
    const reload = () => load();
    window.addEventListener("oy:apps-changed", reload);
    return () => window.removeEventListener("oy:apps-changed", reload);
  }, [load]);

  async function run(key, fn, done) {
    setBusy(key);
    try {
      const out = await fn();
      if (out && typeof out === "object" && "products" in out) setData(out);
      if (done) message.success(typeof done === "function" ? done(out) : done);
      return out;
    } catch (err) {
      message.error(err.message);
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    const ok = await confirmDialog({
      title: "Disconnect Merchant Center?",
      content: "Oyklane stops managing the connection. The data source stays in your Merchant Center — delete it there to remove your products from Google.",
      okText: "Disconnect",
      danger: true,
    });
    if (!ok) return;
    await apiFetch("/api/channels/google", { method: "DELETE" });
    load();
  }

  if (missing) return <AppNotInstalled appKey="google-shopping" title="Sell on Google" description="Your products on Google Shopping, Search, Images, YouTube and Maps — free listings through Google Merchant Center." />;
  if (!data) return <Skeleton active paragraph={{ rows: 8 }} />;

  const lastRead = data.lastFetch;
  return (
    <div>
      <PageHeader title="Google & YouTube" backHref="/admin/apps" subtitle="Your products on Google Shopping, Search, Images, YouTube and Maps — free listings, kept in sync by themselves." />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6">
          {!data.connected ? (
            data.account?.connected && data.account.access?.merchant ? (
              <Card title="Choose your Merchant Center account">
                <AccountLine kind="google" account={data.account} />
                <p className="m-0 mb-3 text-[13px] text-ink-muted">We add your product feed to it — Google then reads your products every day, and again whenever you press Sync.</p>
                <ChooseMerchant onConnected={setData} onNeedsAccount={load} onUnavailable={() => setManual(true)} />
              </Card>
            ) : (
              <AccountSignIn
                kind="google"
                account={data.account}
                access="merchant"
                title="Sign in with Google"
                description="Use the Google account that has your Merchant Center (or will). Then pick the account — your products go to Google and stay in sync by themselves."
              />
            )
          ) : (
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <AccountLine kind="google" account={data.account} />
                  <p className="m-0 text-[16px] font-semibold text-ink">{data.merchant.name}</p>
                  <p className="m-0 text-[12.5px] text-ink-muted">Merchant Center ID {data.merchant.id}</p>
                  <a href={`https://merchants.google.com/mc/products?a=${data.merchant.id}`} target="_blank" rel="noopener noreferrer" className="text-[12.5px] inline-flex items-center gap-1 mt-1">
                    Open Merchant Center <ExternalLink size={11} aria-hidden="true" />
                  </a>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button icon={<RefreshCw size={14} aria-hidden="true" />} loading={busy === "sync"} onClick={() => run("sync", () => apiFetch("/api/channels/google/sync", { method: "POST" }), "Google is reading your products again")}>
                    Sync now
                  </Button>
                  <Button danger icon={<Unlink size={14} aria-hidden="true" />} onClick={disconnect}>
                    Disconnect
                  </Button>
                </div>
              </div>
              {data.error && <Alert className="mt-3" type="warning" showIcon message={data.error} />}
              <div className="mt-4 rounded-[10px] bg-app-bg px-3 py-2.5 text-[13px] text-ink">
                {!lastRead || lastRead.error ? (
                  <span className="text-ink-muted">{lastRead?.error ? `Couldn't read Google's status: ${lastRead.error}` : "Google hasn't read your feed yet — it usually starts within an hour."}</span>
                ) : (
                  <span>
                    Last read by Google {when(lastRead.at)} · <b>{lastRead.total}</b> listings
                    {lastRead.state && <Tag className="ml-2">{String(lastRead.state).toLowerCase().replace(/_/g, " ")}</Tag>}
                  </span>
                )}
                {lastRead?.issues?.length > 0 && (
                  <ul className="m-0 mt-2 pl-5 text-[12.5px] text-ink-muted">
                    {lastRead.issues.map((i, k) => (
                      <li key={k}>
                        {i.title}
                        {i.count ? ` (${i.count})` : ""}
                        {i.description ? ` — ${i.description}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
                <Globe size={14} className="text-ink-muted" aria-hidden="true" />
                <span className="text-ink">Website: {data.merchant.website || data.website}</span>
                {data.merchant.claimed ? (
                  <Tag color="green" className="m-0">Claimed</Tag>
                ) : (
                  <Button
                    size="small"
                    loading={busy === "claim"}
                    onClick={() =>
                      run("claim", () => apiFetch("/api/channels/google/claim-website", { method: "POST" }), (r) => (r?.claimed ? "Website claimed" : "Website set — add the verification code below, then claim again")).then(load)
                    }
                  >
                    Claim website
                  </Button>
                )}
              </div>
            </Card>
          )}

          <ProductsHealth products={data.products} channelName="Google" />
        </div>

        <div className="flex flex-col gap-6">
          <ManualFeedCard url={data.products.feedUrl} title="Feed link for Merchant Center" steps={MANUAL_STEPS} open={(!data.signIn || manual) && !data.connected} />
          <VerificationCard
            which="google"
            title="Verify your website"
            help="Merchant Center ▸ Settings ▸ Business info ▸ Website ▸ “Add an HTML tag”: paste the tag here, save, then press Verify there."
          />
          <Card size="small" title="Good to know">
            <ul className="m-0 pl-4 text-[12.5px] text-ink-muted flex flex-col gap-1.5">
              <li>Free listings cost nothing; Shopping ads are optional and billed by Google.</li>
              <li>Hide a product from Google on its page (Sales channels), and pick its Google category there for better matches.</li>
              <li>Rented products aren't listed — Google needs a single price.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

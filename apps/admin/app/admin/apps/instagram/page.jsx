"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { App, Alert, Button, Card, Input, Skeleton, Collapse } from "antd";
import { RefreshCw, Unlink, Heart, Play, ExternalLink, KeyRound } from "lucide-react";
import { PageHeader, useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { AppNotInstalled, AddToStoreCard } from "@/components/apps/AppPanelParts";
import { BrandGlyph } from "@/components/apps/AppTile";

const when = (iso) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");

function TokenForm({ onConnected }) {
  const { message } = App.useApp();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      onConnected(await apiFetch("/api/social/instagram/token", { method: "POST", body: { accessToken: token.trim() } }));
      message.success("Instagram connected");
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <ol className="m-0 pl-5 text-[13px] text-ink-muted flex flex-col gap-1">
        <li>Go to developers.facebook.com ▸ your app ▸ Instagram ▸ <b>API setup with Instagram login</b>.</li>
        <li>Under “Generate access tokens”, add your Instagram account and click <b>Generate token</b>.</li>
        <li>Copy the token and paste it here.</li>
      </ol>
      <div className="flex gap-2">
        <Input.Password value={token} onChange={(e) => setToken(e.target.value)} placeholder="IGAA…" autoComplete="off" />
        <Button type="primary" loading={busy} disabled={token.trim().length < 20} onClick={submit}>
          Connect
        </Button>
      </div>
    </div>
  );
}

/** Apps ▸ Instagram Feed: connect the account, see the posts, add the section. */
export default function InstagramPage() {
  // useSearchParams (Instagram's ?code= return) needs a Suspense boundary.
  return (
    <Suspense fallback={<Skeleton active paragraph={{ rows: 8 }} />}>
      <InstagramPanel />
    </Suspense>
  );
}

function InstagramPanel() {
  const router = useRouter();
  const params = useSearchParams();
  const { message } = App.useApp();
  const { confirmDialog } = useConfirmDialog();
  const [data, setData] = useState(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(null);
  const handled = useRef(false);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch("/api/social/instagram"));
      setMissing(false);
    } catch (err) {
      if (err.status === 402) setMissing(true);
      else message.error(err.message);
    }
  }, [message]);

  // Back from Instagram's sign-in with ?code=…&state=…
  useEffect(() => {
    const code = params.get("code");
    const state = params.get("state");
    if (handled.current) return;
    handled.current = true;
    if (code && state) {
      setBusy("connect");
      apiFetch("/api/social/instagram/callback", { method: "POST", body: { code, state } })
        .then((d) => {
          setData(d);
          message.success("Instagram connected");
        })
        .catch((err) => {
          message.error(err.message);
          load();
        })
        .finally(() => {
          setBusy(null);
          router.replace("/admin/apps/instagram");
        });
    } else if (params.get("error")) {
      message.error(params.get("error_description") || "Instagram sign-in was cancelled.");
      router.replace("/admin/apps/instagram");
      load();
    } else {
      load();
    }
  }, [params, router, message, load]);

  useEffect(() => {
    const reload = () => load();
    window.addEventListener("oy:apps-changed", reload);
    return () => window.removeEventListener("oy:apps-changed", reload);
  }, [load]);

  async function connect() {
    setBusy("connect");
    try {
      const { url } = await apiFetch("/api/social/instagram/connect-url", { method: "POST" });
      window.location.href = url;
    } catch (err) {
      message.error(err.message);
      setBusy(null);
    }
  }

  /** Continue with Facebook: back through the admin's Facebook callback page. */
  async function connectFacebook() {
    setBusy("facebook");
    try {
      const { url } = await apiFetch("/api/social/instagram/facebook-url", { method: "POST" });
      sessionStorage.setItem("meta-connect-endpoint", "/api/social/instagram/facebook");
      sessionStorage.setItem("meta-connect-return-to", "/admin/apps/instagram");
      window.location.href = url;
    } catch (err) {
      message.error(err.message);
      setBusy(null);
    }
  }

  async function choose(igUserId) {
    setBusy(`choose:${igUserId}`);
    try {
      setData(await apiFetch("/api/social/instagram/choose", { method: "POST", body: { igUserId } }));
      message.success("Instagram connected");
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function refresh() {
    setBusy("refresh");
    try {
      setData(await apiFetch("/api/social/instagram/refresh", { method: "POST" }));
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    const ok = await confirmDialog({ title: "Disconnect Instagram?", content: "Your feed disappears from your store until you connect again.", okText: "Disconnect", danger: true });
    if (!ok) return;
    await apiFetch("/api/social/instagram", { method: "DELETE" });
    load();
  }

  if (missing) return <AppNotInstalled appKey="instagram-feed" title="Show your Instagram on your store" description="Your latest posts in a scrolling row or a grid — new posts appear by themselves. Free." />;
  if (!data) return <Skeleton active paragraph={{ rows: 8 }} />;

  const p = data.profile;
  const choosing = data.choose?.length ? (
    <Card className="mb-6" title="Which Instagram account?">
      <p className="m-0 mb-3 text-[13px] text-ink-muted">Your Facebook Pages have more than one Instagram account linked. Pick the one to show on your store.</p>
      <div className="flex flex-col gap-2">
        {data.choose.map((a) => (
          <div key={a.igUserId} className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-app-border px-3 py-2.5">
            <div className="flex items-center gap-3 min-w-0">
              {a.picture ? <img src={a.picture} alt="" width={36} height={36} className="rounded-full" referrerPolicy="no-referrer" /> : <span className="w-9 h-9 rounded-full bg-app-bg" />}
              <div className="min-w-0">
                <p className="m-0 text-[14px] font-medium text-ink">@{a.username}</p>
                <p className="m-0 text-[12.5px] text-ink-muted">Facebook Page: {a.pageName}</p>
              </div>
            </div>
            <Button type="primary" loading={busy === `choose:${a.igUserId}`} onClick={() => choose(a.igUserId)}>
              Use this account
            </Button>
          </div>
        ))}
      </div>
    </Card>
  ) : null;
  return (
    <div>
      <PageHeader title="Instagram Feed" backHref="/admin/apps" subtitle="Your latest Instagram posts on your store, kept up to date by themselves." />
      {choosing}

      {!data.connected ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <div className="flex items-start gap-4">
              <span className="w-12 h-12 rounded-[14px] bg-white border border-app-border flex items-center justify-center shrink-0">
                <BrandGlyph app={{ key: "instagram-feed" }} size={24} />
              </span>
              <div className="min-w-0">
                <h2 className="m-0 text-[17px] font-semibold text-ink">Connect your Instagram</h2>
                <p className="m-0 mt-1 text-[13.5px] text-ink-muted">
                  Works with <b>Business</b> or <b>Creator</b> accounts (free to switch in the Instagram app: Settings ▸ Account type). We only read your posts — we never post or message.
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-4">
              {(data.facebook || data.oauth) && (
                <div className="flex flex-wrap gap-2">
                  {data.facebook && (
                    <Button type="primary" size="large" loading={busy === "facebook"} onClick={connectFacebook} icon={<BrandGlyph app={{ key: "meta-ads" }} size={16} white />}>
                      Continue with Facebook
                    </Button>
                  )}
                  {data.oauth && (
                    <Button type={data.facebook ? "default" : "primary"} size="large" loading={busy === "connect"} onClick={connect}>
                      {data.facebook ? "Sign in with Instagram instead" : "Connect Instagram"}
                    </Button>
                  )}
                </div>
              )}
              {data.facebook && (
                <p className="m-0 -mt-2 text-[12.5px] text-ink-muted">
                  With Facebook, we use the Instagram account linked to your Facebook Page — the connection stays on until you remove it.
                </p>
              )}
              <Collapse
                ghost={data.oauth || data.facebook}
                defaultActiveKey={data.oauth || data.facebook ? [] : ["token"]}
                items={[
                  {
                    key: "token",
                    label: (
                      <span className="inline-flex items-center gap-1.5 text-[13px]">
                        <KeyRound size={13} aria-hidden="true" /> {data.oauth || data.facebook ? "Or connect with an access token" : "Connect with an access token"}
                      </span>
                    ),
                    children: <TokenForm onConnected={setData} />,
                  },
                ]}
              />
            </div>
          </Card>
          <AddToStoreCard sectionName="Instagram feed" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6">
            {data.error && <Alert type="warning" showIcon message="The last refresh didn't work" description={data.error} />}
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-14 h-14 rounded-full p-[2px] bg-[linear-gradient(45deg,#f9ce34,#ee2a7b,#6228d7)] shrink-0">
                    {p.picture ? (
                      <img src={p.picture} alt="" className="w-full h-full rounded-full object-cover border-2 border-white" />
                    ) : (
                      <span className="w-full h-full rounded-full bg-white flex items-center justify-center font-semibold">{p.username[0]?.toUpperCase()}</span>
                    )}
                  </span>
                  <div className="min-w-0">
                    <a href={`https://www.instagram.com/${p.username}/`} target="_blank" rel="noopener noreferrer" className="text-[16px] font-semibold text-ink hover:underline inline-flex items-center gap-1">
                      @{p.username} <ExternalLink size={13} aria-hidden="true" />
                    </a>
                    <p className="m-0 text-[13px] text-ink-muted">
                      {[p.name, p.followers != null && `${p.followers.toLocaleString("en-IN")} followers`, p.posts != null && `${p.posts} posts`].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button icon={<RefreshCw size={14} aria-hidden="true" />} loading={busy === "refresh"} onClick={refresh}>
                    Refresh now
                  </Button>
                  <Button danger icon={<Unlink size={14} aria-hidden="true" />} onClick={disconnect}>
                    Disconnect
                  </Button>
                </div>
              </div>
              <p className="m-0 mt-3 text-[12px] text-ink-muted">
                Updated {when(data.fetchedAt)} · refreshes every few hours by itself
                {data.via === "facebook"
                  ? ` · connected through your Facebook Page${data.pageName ? ` “${data.pageName}”` : ""} — stays on until you remove it`
                  : data.expiresAt
                    ? ` · connection renews automatically (current one until ${new Date(data.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })})`
                    : ""}
              </p>
            </Card>
            <Card size="small" title={`Latest posts (${data.posts.length})`}>
              {data.posts.length === 0 ? (
                <p className="m-0 text-[13px] text-ink-muted">No posts yet — once you post on Instagram, they show here and on your store.</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {data.posts.map((post) => (
                    <a key={post.id} href={post.url} target="_blank" rel="noopener noreferrer" className="relative block aspect-square rounded-lg overflow-hidden bg-app-bg group">
                      <img src={post.image} alt={post.caption?.slice(0, 80) || "Instagram post"} className="w-full h-full object-cover" loading="lazy" />
                      {post.type === "VIDEO" && (
                        <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center">
                          <Play size={10} aria-hidden="true" />
                        </span>
                      )}
                      {post.likes != null && (
                        <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 text-[11px] text-white bg-black/45 rounded-full px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Heart size={10} aria-hidden="true" /> {post.likes}
                        </span>
                      )}
                    </a>
                  ))}
                </div>
              )}
            </Card>
          </div>
          <AddToStoreCard sectionName="Instagram feed" />
        </div>
      )}
    </div>
  );
}

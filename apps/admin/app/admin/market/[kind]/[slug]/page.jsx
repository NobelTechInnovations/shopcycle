"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { App, Alert, Button, Card, Skeleton, Tag } from "antd";
import { ExternalLink, ShieldCheck, Store } from "lucide-react";
import { formatCurrency } from "@shopcycle/utils";
import { PageHeader } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { openCheckout } from "@/lib/billing";

const MARKET = process.env.NEXT_PUBLIC_MARKET_ORIGIN || "https://oyklanestore.com";
const inr = (n) => formatCurrency(Number(n || 0), "INR");

/**
 * Get something from the Oyklane Store (oyklanestore.com sends sellers
 * here — they're signed in to their store here). Free: install. Paid
 * theme: pay with Razorpay (the API checks the payment with Razorpay
 * before the licence exists), then install. Apps install from here too.
 */
export default function MarketGetPage({ params }) {
  const { kind, slug } = use(params);
  const router = useRouter();
  const { message } = App.useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [done, setDone] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch(`/api/market/store/${encodeURIComponent(kind)}/${encodeURIComponent(slug)}`));
    } catch (err) {
      setError(err.message);
    }
  }, [kind, slug]);
  useEffect(() => {
    load();
  }, [load]);

  async function run(key, fn) {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      if (!err.cancelled) message.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  const installTheme = () =>
    run("install", async () => {
      const out = data.official
        ? (await apiFetch("/api/themes/install", { method: "POST", body: { handle: slug } })).theme
        : await apiFetch(`/api/market/store/themes/${encodeURIComponent(slug)}/install`, { method: "POST", body: {} });
      setDone({ themeId: out.themeId || out.id });
      message.success(`${data.item.name} added to your themes`);
    });

  const buy = () =>
    run("buy", async () => {
      const started = await apiFetch(`/api/market/store/themes/${encodeURIComponent(slug)}/buy`, { method: "POST", body: {} });
      if (!started.owned) {
        const paid = await openCheckout(started.checkout);
        const verified = await apiFetch("/api/market/store/verify", { method: "POST", body: paid });
        if (!verified.owned) {
          message.info("Your payment is being confirmed — this page updates in a moment.");
          setTimeout(load, 5000);
          return;
        }
      }
      message.success("Paid — it's yours. Installing…");
      await load();
      const out = await apiFetch(`/api/market/store/themes/${encodeURIComponent(slug)}/install`, { method: "POST", body: {} });
      setDone({ themeId: out.themeId });
    });

  const installApp = () =>
    run("install", async () => {
      await apiFetch(`/api/apps/${encodeURIComponent(data.official ? slug : `mkt-${slug}`)}/install`, { method: "POST", body: { settings: {} } });
      message.success(`${data.item.name} installed`);
      router.push(data.official ? `/admin/apps/details/${slug}` : "/admin/apps");
    });

  if (error)
    return (
      <div>
        <PageHeader title="Oyklane Store" backHref="/admin/online-store/themes" />
        <Alert type="error" showIcon message={error} action={<a href={MARKET}>Browse the Oyklane Store</a>} />
      </div>
    );
  if (!data) return <Skeleton active paragraph={{ rows: 6 }} />;

  const { item, price } = data;
  const theme = kind === "theme";
  const paid = !item.free && !data.official;
  return (
    <div>
      <PageHeader title={item.name} subtitle={item.tagline} backHref={theme ? "/admin/online-store/themes" : "/admin/apps"} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6 min-w-0">
          {item.screenshots?.[0] && (
            <Card styles={{ body: { padding: 0 } }} className="overflow-hidden">
              <img src={item.screenshots[0]} alt="" className="w-full aspect-[16/10] object-cover object-top" />
            </Card>
          )}
          {item.description && (
            <Card size="small" title="About">
              <p className="m-0 whitespace-pre-line text-[14px] text-ink-muted">{item.description}</p>
            </Card>
          )}
          {!theme && item.scopeLabels?.length > 0 && (
            <Card size="small" title="It will be able to">
              <ul className="m-0 pl-5 text-[14px] text-ink-muted">
                {item.scopeLabels.map((s) => (
                  <li key={s}>{s}</li>
                ))}
                {item.embeds && <li>Add a script to your store's pages (not checkout)</li>}
              </ul>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <div className="flex items-center gap-2 mb-1">
              <Store size={15} className="text-ink-muted" aria-hidden="true" />
              <span className="text-[12.5px] text-ink-muted">Oyklane Store · {data.official ? "by Oyklane" : `by ${item.by?.name || "a developer"}`}</span>
            </div>
            {done ? (
              <>
                <Alert type="success" showIcon message={`${item.name} is in your themes`} description="Customise it, preview it on your store, and publish when you're ready." className="mb-3" />
                <div className="flex flex-wrap gap-2">
                  <Button type="primary" onClick={() => router.push(`/theme-editor/${done.themeId}`)}>
                    Customize
                  </Button>
                  <Button onClick={() => router.push("/admin/online-store/themes")}>Go to Themes</Button>
                </div>
              </>
            ) : (
              <>
                <p className="m-0 text-[26px] font-semibold tabular-nums">{item.free || data.official ? "Free" : inr(price?.amount)}</p>
                {paid && (
                  <p className="m-0 mt-1 text-[12.5px] text-ink-muted">
                    {price.monthly ? "a month, billed with your plan" : "one-time, for this store"} · + {price.rate}% GST ({inr(price.gst)}) = <b>{inr(price.total)}</b>
                  </p>
                )}
                <div className="flex flex-col gap-2 mt-4">
                  {theme ? (
                    data.installed && data.official ? (
                      <Button block onClick={() => router.push("/admin/online-store/themes")}>
                        Already in your themes — open Themes
                      </Button>
                    ) : paid && !data.owned ? (
                      <Button type="primary" size="large" block loading={busy === "buy"} disabled={data.payments === "unconfigured"} onClick={buy}>
                        Buy for {inr(price.total)}
                      </Button>
                    ) : (
                      <Button type="primary" size="large" block loading={busy === "install"} onClick={installTheme}>
                        {data.installed ? "Install again (latest version)" : "Add to my themes"}
                      </Button>
                    )
                  ) : data.installed ? (
                    <Button block onClick={() => router.push("/admin/apps")}>
                      Installed — open Apps
                    </Button>
                  ) : (
                    <Button type="primary" size="large" block loading={busy === "install"} onClick={installApp}>
                      {paid ? `Install — ${inr(price.amount)}/month` : "Install"}
                    </Button>
                  )}
                  {theme && data.preview && (
                    <a href={`${MARKET}/themes/${encodeURIComponent(slug)}/preview`} target="_blank" rel="noopener noreferrer">
                      <Button block icon={<ExternalLink size={14} aria-hidden="true" />}>
                        Preview every page
                      </Button>
                    </a>
                  )}
                </div>
                {theme && data.owned && paid && <Tag color="green" className="mt-3">Bought — this store's licence</Tag>}
                {data.payments === "unconfigured" && paid && !data.owned && <p className="m-0 mt-3 text-[12.5px] text-[#B45309]">Payments aren't available right now — try again later.</p>}
              </>
            )}
          </Card>
          {paid && theme && (
            <Card size="small">
              <p className="m-0 text-[12.5px] text-ink-muted flex gap-2">
                <ShieldCheck size={15} className="shrink-0 mt-0.5 text-[#047857]" aria-hidden="true" />
                Paid through Oyklane with Razorpay. The theme is licensed to this store; its code is locked, and you customise it in the editor like any theme.
              </p>
            </Card>
          )}
          <Link href={MARKET} className="text-[13px] text-ink-muted" target="_blank">
            Browse more on the Oyklane Store ↗
          </Link>
        </div>
      </div>
    </div>
  );
}

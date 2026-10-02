"use client";

import { useCallback, useEffect, useState } from "react";
import { App, Alert, Button, Card, Radio, Skeleton } from "antd";
import { RefreshCw, Unlink, ExternalLink, Plus } from "lucide-react";
import { PageHeader, useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { AppNotInstalled } from "@/components/apps/AppPanelParts";
import { BrandGlyph } from "@/components/apps/AppTile";
import { ProductsHealth, ManualFeedCard, VerificationCard } from "@/components/channels/ChannelParts";

const when = (iso) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");

const MANUAL_STEPS = [
  "Open business.facebook.com/commerce and create a catalogue (type: E-commerce) if you don't have one.",
  "In the catalogue, go to Data sources ▸ Add items ▸ Data feed ▸ “Use a URL”.",
  "Paste the feed link above and choose an hourly schedule. Currency: INR.",
  "Meta reads your products from it every hour. Then set up your shop or tag products on Instagram.",
];

/** Choose (or create) the catalog after "Continue with Facebook". */
function ChooseCatalog({ businesses, onDone }) {
  const { message } = App.useApp();
  const [choice, setChoice] = useState(() => {
    const b = businesses[0];
    return b.catalogs[0] ? `${b.id}:${b.catalogs[0].id}` : `${b.id}:new`;
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    const [businessId, catalogId] = choice.split(":");
    setBusy(true);
    try {
      onDone(await apiFetch("/api/channels/facebook/catalog", { method: "POST", body: catalogId === "new" ? { businessId, create: true } : { businessId, catalogId } }));
      message.success("Catalogue connected — Meta is reading your products");
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Where should your products go?">
      <Radio.Group value={choice} onChange={(e) => setChoice(e.target.value)} className="flex flex-col gap-4 w-full">
        {businesses.map((b) => (
          <div key={b.id} className="flex flex-col gap-1.5">
            <p className="m-0 text-[13px] font-medium text-ink">{b.name}</p>
            {b.catalogs.map((c) => (
              <Radio key={c.id} value={`${b.id}:${c.id}`}>
                {c.name} <span className="text-ink-muted text-[12.5px]">· {c.products} items</span>
              </Radio>
            ))}
            <Radio value={`${b.id}:new`}>
              <span className="inline-flex items-center gap-1">
                <Plus size={13} aria-hidden="true" /> A new catalogue for this store
              </span>
            </Radio>
          </div>
        ))}
      </Radio.Group>
      <Button type="primary" className="mt-5" loading={busy} onClick={save}>
        Use this catalogue
      </Button>
    </Card>
  );
}

/** Apps ▸ Facebook & Instagram: the product catalog on Meta. */
export default function FacebookShopPage() {
  const { message } = App.useApp();
  const { confirmDialog } = useConfirmDialog();
  const [data, setData] = useState(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch("/api/channels/facebook"));
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

  async function connect() {
    setBusy("connect");
    try {
      const { url } = await apiFetch("/api/channels/facebook/facebook-url", { method: "POST" });
      sessionStorage.setItem("meta-connect-endpoint", "/api/channels/facebook/connect");
      sessionStorage.setItem("meta-connect-return-to", "/admin/apps/facebook-shop");
      window.location.href = url;
    } catch (err) {
      message.error(err.message);
      setBusy(null);
    }
  }

  async function sync() {
    setBusy("sync");
    try {
      setData(await apiFetch("/api/channels/facebook/sync", { method: "POST" }));
      message.success("Meta is reading your products again");
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    const ok = await confirmDialog({
      title: "Disconnect the catalogue?",
      content: "Oyklane stops managing the connection. The catalogue keeps its hourly feed — delete the data source in Commerce Manager to stop it.",
      okText: "Disconnect",
      danger: true,
    });
    if (!ok) return;
    await apiFetch("/api/channels/facebook", { method: "DELETE" });
    load();
  }

  if (missing) return <AppNotInstalled appKey="facebook-shop" title="Sell on Facebook & Instagram" description="Your products in a Meta catalogue — a shop on your Page and profile, product tags in posts and reels, and catalogue ads." />;
  if (!data) return <Skeleton active paragraph={{ rows: 8 }} />;

  const last = data.lastFetch;
  const expiresSoon = data.tokenExpiresAt && new Date(data.tokenExpiresAt) - Date.now() < 10 * 86400000;

  return (
    <div>
      <PageHeader title="Facebook & Instagram" backHref="/admin/apps" subtitle="Your products in a Meta catalogue — shop on your Page and profile, product tags in posts and reels, catalogue ads." />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6">
          {data.choose?.length > 0 && !data.connected && <ChooseCatalog businesses={data.choose} onDone={setData} />}

          {!data.connected && !data.choose?.length && (
            <Card>
              <div className="flex items-start gap-4">
                <span className="w-12 h-12 rounded-[14px] bg-white border border-app-border flex items-center justify-center shrink-0">
                  <BrandGlyph app={{ key: "facebook-shop" }} size={24} />
                </span>
                <div className="min-w-0">
                  <h2 className="m-0 text-[17px] font-semibold text-ink">Connect your Meta catalogue</h2>
                  <p className="m-0 mt-1 text-[13.5px] text-ink-muted">
                    Continue with the Facebook account that runs your business. You pick a catalogue (or we make one), and Meta reads your products from your store every hour — for good.
                  </p>
                </div>
              </div>
              {data.signIn ? (
                <Button type="primary" size="large" className="mt-5" loading={busy === "connect"} onClick={connect} icon={<BrandGlyph app={{ key: "facebook-shop" }} size={16} white />}>
                  Continue with Facebook
                </Button>
              ) : (
                <Alert className="mt-5" type="info" showIcon message="One-click connect is being set up" description="Meanwhile, add your feed link in Commerce Manager yourself — it takes two minutes (steps on the right)." />
              )}
            </Card>
          )}

          {data.connected && (
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="m-0 text-[16px] font-semibold text-ink">{data.catalog.catalogName}</p>
                  <p className="m-0 text-[12.5px] text-ink-muted">{data.catalog.businessName} · catalogue {data.catalog.catalogId}</p>
                  <a href={`https://business.facebook.com/commerce/catalogs/${data.catalog.catalogId}/products`} target="_blank" rel="noopener noreferrer" className="text-[12.5px] inline-flex items-center gap-1 mt-1">
                    Open in Commerce Manager <ExternalLink size={11} aria-hidden="true" />
                  </a>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button icon={<RefreshCw size={14} aria-hidden="true" />} loading={busy === "sync"} onClick={sync}>
                    Sync now
                  </Button>
                  <Button danger icon={<Unlink size={14} aria-hidden="true" />} onClick={disconnect}>
                    Disconnect
                  </Button>
                </div>
              </div>
              {data.error && <Alert className="mt-3" type="warning" showIcon message={data.error} action={<Button size="small" onClick={connect}>Reconnect</Button>} />}
              <div className="mt-4 rounded-[10px] bg-app-bg px-3 py-2.5 text-[13px] text-ink">
                {!last || last.error ? (
                  <span className="text-ink-muted">{last?.error ? last.error : "Meta hasn't read your feed yet — it starts within the hour."}</span>
                ) : last.state === "waiting" ? (
                  <span className="text-ink-muted">Meta will read your feed within the hour.</span>
                ) : (
                  <span>
                    Last read by Meta {when(last.at)} · <b>{last.saved}</b> of {last.total} items saved
                    {last.errors > 0 ? ` · ${last.errors} errors` : ""}
                    {last.warnings > 0 ? ` · ${last.warnings} warnings (see Commerce Manager)` : ""}
                  </span>
                )}
              </div>
              <p className="m-0 mt-2 text-[12px] text-ink-muted">
                Meta reads your products every hour by itself — even if this connection expires.
                {expiresSoon ? " Reconnect soon to keep Sync now and this status working." : ""}
              </p>
            </Card>
          )}

          <ProductsHealth products={data.products} channelName="Meta" />
        </div>

        <div className="flex flex-col gap-6">
          <ManualFeedCard url={data.products.feedUrl} title="Feed link for Commerce Manager" steps={MANUAL_STEPS} open={!data.signIn && !data.connected} />
          <VerificationCard
            which="facebook"
            title="Verify your domain"
            help="Business settings ▸ Brand safety ▸ Domains ▸ Add ▸ “Meta-tag verification”: paste the tag here, save, then press Verify there."
          />
          <Card size="small" title="Good to know">
            <ul className="m-0 pl-4 text-[12.5px] text-ink-muted flex flex-col gap-1.5">
              <li>Shoppers buy on your store — product tags and the shop link here.</li>
              <li>Hide a product from Facebook & Instagram on its page (Sales channels).</li>
              <li>Facebook Marketplace listings for businesses aren't open to new shops; your catalogue covers Facebook Shop, Instagram Shopping and ads.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

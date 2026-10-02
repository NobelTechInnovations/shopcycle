"use client";

import { useCallback, useEffect, useState } from "react";
import { App, Alert, Button, Card, Input, Select, Skeleton, Tag } from "antd";
import { RefreshCw, Unlink, Search, Star, MapPin, ExternalLink, EyeOff } from "lucide-react";
import { PageHeader, useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { useApps } from "@/lib/apps";
import { useAppActions } from "@/components/apps/useAppActions";
import { AppNotInstalled, AddToStoreCard } from "@/components/apps/AppPanelParts";
import { BrandGlyph } from "@/components/apps/AppTile";

const when = (iso) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");

function Stars({ value, size = 14 }) {
  return (
    <span className="inline-flex gap-[1px]" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} aria-hidden="true" className={value >= i - 0.25 ? "fill-[#FBBC04] text-[#FBBC04]" : value >= i - 0.75 ? "fill-[#FBBC04]/50 text-[#FBBC04]" : "fill-app-border text-app-border"} />
      ))}
    </span>
  );
}

/** Find the business on Google Maps by name, then pick it. */
function FindBusiness({ onConnected, onCancel }) {
  const { message } = App.useApp();
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState(null);
  const [busy, setBusy] = useState(null);

  async function search() {
    setBusy("search");
    try {
      setPlaces((await apiFetch("/api/social/google-reviews/search", { method: "POST", body: { query } })).places);
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function pick(place) {
    setBusy(place.id);
    try {
      onConnected(await apiFetch("/api/social/google-reviews/connect", { method: "POST", body: { placeId: place.id } }));
      message.success(`Connected ${place.name}`);
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          size="large"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onPressEnter={() => query.trim().length >= 3 && search()}
          placeholder="Your business name and city, e.g. Loomwear Pune"
          prefix={<Search size={15} className="text-ink-subtle" aria-hidden="true" />}
        />
        <Button size="large" type="primary" loading={busy === "search"} disabled={query.trim().length < 3} onClick={search}>
          Search
        </Button>
      </div>
      {places && places.length === 0 && <p className="m-0 text-[13px] text-ink-muted">Nothing found. Try the exact name shown on Google Maps, with your city.</p>}
      {places?.map((pl) => (
        <div key={pl.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-app-border px-3 py-2.5">
          <div className="min-w-0">
            <p className="m-0 text-[14px] font-medium text-ink">{pl.name}</p>
            <p className="m-0 text-[12.5px] text-ink-muted flex items-center gap-1">
              <MapPin size={12} aria-hidden="true" /> {pl.address}
            </p>
            {pl.rating != null && (
              <p className="m-0 mt-0.5 text-[12.5px] text-ink flex items-center gap-1.5">
                <b>{pl.rating.toFixed(1)}</b> <Stars value={pl.rating} size={12} /> <span className="text-ink-muted">{pl.total} reviews</span>
              </p>
            )}
          </div>
          <Button type="primary" loading={busy === pl.id} onClick={() => pick(pl)}>
            This is my business
          </Button>
        </div>
      ))}
      {onCancel && (
        <Button type="link" className="self-start !px-0" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  );
}

/** Apps ▸ Google Reviews: pick the business, choose which reviews show, add the section. */
export default function GoogleReviewsPage() {
  const { message } = App.useApp();
  const { confirmDialog } = useConfirmDialog();
  const { apps } = useApps();
  const { install } = useAppActions();
  const [data, setData] = useState(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(null);
  const [changing, setChanging] = useState(false);
  const app = (apps || []).find((a) => a.key === "google-reviews");
  const minRating = Number(app?.settings?.minRating || 4);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch("/api/social/google-reviews"));
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

  async function refresh() {
    setBusy("refresh");
    try {
      setData(await apiFetch("/api/social/google-reviews/refresh", { method: "POST" }));
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function signIn() {
    setBusy("google");
    try {
      const { url } = await apiFetch("/api/social/google-reviews/google-url", { method: "POST" });
      window.location.href = url;
    } catch (err) {
      message.error(err.message);
      setBusy(null);
    }
  }

  async function choose(location) {
    setBusy(`choose:${location}`);
    try {
      setData(await apiFetch("/api/social/google-reviews/choose", { method: "POST", body: { location } }));
      setChanging(false);
      message.success("Business connected");
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    const ok = await confirmDialog({ title: "Disconnect Google reviews?", content: "Your reviews disappear from your store until you connect again.", okText: "Disconnect", danger: true });
    if (!ok) return;
    await apiFetch("/api/social/google-reviews", { method: "DELETE" });
    load();
  }

  if (missing) return <AppNotInstalled appKey="google-reviews" title="Show your Google reviews on your store" description="Your Google rating and your best reviews, with a link to write one. Free." />;
  if (!data) return <Skeleton active paragraph={{ rows: 8 }} />;

  const p = data.profile;
  const reviews = data.reviews || [];
  return (
    <div>
      <PageHeader title="Google Reviews" backHref="/admin/apps" subtitle="Your Google rating and reviews on your store — refreshed every day." />
      {!data.ready && !data.business && (
        <Alert className="mb-6" type="info" showIcon message="Google reviews is almost ready" description="Oyklane's Google connection is still being set up. You'll be able to connect your business here soon." />
      )}
      {data.choose?.length > 0 && (
        <Card className="mb-6" title="Which business?">
          <p className="m-0 mb-3 text-[13px] text-ink-muted">Your Google account manages more than one business. Pick the one whose reviews show on your store.</p>
          <div className="flex flex-col gap-2">
            {data.choose.map((l) => (
              <div key={l.location} className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-app-border px-3 py-2.5">
                <div className="min-w-0">
                  <p className="m-0 text-[14px] font-medium text-ink">{l.name}</p>
                  {l.address && (
                    <p className="m-0 text-[12.5px] text-ink-muted flex items-center gap-1">
                      <MapPin size={12} aria-hidden="true" /> {l.address}
                    </p>
                  )}
                </div>
                <Button type="primary" loading={busy === `choose:${l.location}`} onClick={() => choose(l.location)}>
                  Use this business
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {!data.connected || changing ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <div className="flex items-start gap-4 mb-5">
              <span className="w-12 h-12 rounded-[14px] bg-white border border-app-border flex items-center justify-center shrink-0">
                <BrandGlyph app={{ key: "google-reviews" }} size={22} />
              </span>
              <div>
                <h2 className="m-0 text-[17px] font-semibold text-ink">Connect your business on Google</h2>
                <p className="m-0 mt-1 text-[13.5px] text-ink-muted">
                  {data.business
                    ? "Sign in with the Google account that manages your Business Profile — every review shows, and the connection stays on until you remove it."
                    : "The listing customers review on Google Maps. No Google login needed."}
                </p>
              </div>
            </div>
            {data.business && (
              <div className="mb-5 flex flex-col gap-2">
                <Button type="primary" size="large" className="self-start" loading={busy === "google"} onClick={signIn} icon={<BrandGlyph app={{ key: "google-reviews" }} size={16} white />}>
                  Sign in with Google
                </Button>
                {data.ready && <p className="m-0 text-[12.5px] text-ink-muted">Or find your business by name (shows five reviews):</p>}
              </div>
            )}
            {data.ready && <FindBusiness
              onConnected={(d) => {
                setData(d);
                setChanging(false);
              }}
              onCancel={changing ? () => setChanging(false) : null}
            />}
          </Card>
          <AddToStoreCard sectionName="Google reviews" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6">
            {data.error && <Alert type="warning" showIcon message="The last refresh didn't work" description={data.error} />}
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="m-0 text-[16px] font-semibold text-ink">{p.name}</p>
                  <p className="m-0 text-[12.5px] text-ink-muted flex items-center gap-1">
                    <MapPin size={12} aria-hidden="true" /> {p.address}
                  </p>
                  <p className="m-0 mt-2 flex items-center gap-2 text-[14px]">
                    <b className="text-[22px] leading-none">{p.rating != null ? Number(p.rating).toFixed(1) : "—"}</b>
                    <Stars value={p.rating || 0} size={16} />
                    <span className="text-ink-muted">{p.total} reviews</span>
                    {p.url && (
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-[12.5px] inline-flex items-center gap-1">
                        On Google Maps <ExternalLink size={11} aria-hidden="true" />
                      </a>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button icon={<RefreshCw size={14} aria-hidden="true" />} loading={busy === "refresh"} onClick={refresh}>
                    Refresh now
                  </Button>
                  <Button onClick={() => setChanging(true)}>Change business</Button>
                  <Button danger icon={<Unlink size={14} aria-hidden="true" />} onClick={disconnect}>
                    Disconnect
                  </Button>
                </div>
              </div>
              <p className="m-0 mt-3 text-[12px] text-ink-muted">
                Updated {when(data.fetchedAt)} ·{" "}
                {data.via === "google"
                  ? `connected with your Google account — ${reviews.length} recent reviews, refreshed every day.`
                  : "Google shares the five most relevant reviews; they refresh every day."}
                {data.via !== "google" && data.business ? " Sign in with Google (Change business) to show all your reviews." : ""}
              </p>
            </Card>

            <Card
              size="small"
              title="Reviews on your store"
              extra={
                <span className="flex items-center gap-2 text-[12.5px] text-ink-muted">
                  Show
                  <Select
                    size="small"
                    value={String(minRating)}
                    className="w-[120px]"
                    onChange={(v) => app && install(app, { ...(app.settings || {}), minRating: v })}
                    options={[
                      { value: "5", label: "5 stars only" },
                      { value: "4", label: "4 stars & up" },
                      { value: "3", label: "3 stars & up" },
                      { value: "1", label: "All reviews" },
                    ]}
                  />
                </span>
              }
            >
              {reviews.length === 0 ? (
                <p className="m-0 text-[13px] text-ink-muted">Google hasn't shared any written reviews for this business yet. Your rating still shows.</p>
              ) : (
                <div className="flex flex-col">
                  {reviews.map((r, i) => {
                    const hidden = r.rating < minRating || !r.text?.trim();
                    return (
                      <div key={i} className={`py-3 border-t border-app-border first:border-t-0 ${hidden ? "opacity-55" : ""}`}>
                        <div className="flex items-center gap-2.5">
                          {r.photo ? (
                            <img src={r.photo} alt="" width={32} height={32} className="rounded-full" referrerPolicy="no-referrer" />
                          ) : (
                            <span className="w-8 h-8 rounded-full bg-accent-soft text-accent flex items-center justify-center text-[13px] font-semibold">{r.author[0]}</span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="m-0 text-[13.5px] font-medium text-ink">{r.author}</p>
                            <p className="m-0 text-[12px] text-ink-muted flex items-center gap-1.5">
                              <Stars value={r.rating} size={11} /> {r.when}
                            </p>
                          </div>
                          {hidden && (
                            <Tag icon={<EyeOff size={11} className="inline mr-1" aria-hidden="true" />} className="m-0">
                              Not shown
                            </Tag>
                          )}
                        </div>
                        {r.text && <p className="m-0 mt-2 text-[13px] text-ink leading-relaxed line-clamp-4">{r.text}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
          <AddToStoreCard sectionName="Google reviews" />
        </div>
      )}
    </div>
  );
}

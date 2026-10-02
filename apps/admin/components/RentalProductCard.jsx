"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import Link from "next/link";
import { Button, Card, InputNumber, Switch } from "antd";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

const BLANK = { enabled: false, pricePerDay: null, tiers: [], minDays: 1, maxDays: 7, deposit: 0, units: 1, bufferDays: 1, leadDays: 1 };
const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function rateFor(cfg, days) {
  let rate = Number(cfg.pricePerDay) || 0;
  for (const t of [...cfg.tiers].sort((a, b) => a.days - b.days)) if (days >= t.days && t.price) rate = Number(t.price);
  return rate;
}

/**
 * Rentals app, on a product's page: rent it by the day instead of selling
 * it. Saved with the product (the form calls `save(productId)`).
 */
export const RentalProductCard = forwardRef(function RentalProductCard({ productId, onChange, onEnabled }, ref) {
  const [cfg, setCfg] = useState(BLANK);
  const [loaded, setLoaded] = useState(!productId);
  const [touched, setTouched] = useState(false);
  const [existed, setExisted] = useState(false);

  useEffect(() => {
    if (!productId) return;
    apiFetch(`/api/rentals/products/${productId}`)
      .then(({ rental }) => {
        if (rental) {
          setCfg({ ...BLANK, ...rental });
          setExisted(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [productId]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#rental") {
      document.getElementById("rental")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [loaded]);

  useEffect(() => {
    onEnabled?.(cfg.enabled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.enabled]);

  const update = (patch) => {
    setCfg((c) => ({ ...c, ...patch }));
    setTouched(true);
    onChange?.(patch);
  };

  useImperativeHandle(ref, () => ({
    enabled: cfg.enabled,
    /** Problems to fix before saving, or null. */
    problem() {
      if (!cfg.enabled) return null;
      if (!(Number(cfg.pricePerDay) > 0)) return "Set the rent per day.";
      if (cfg.maxDays < cfg.minDays) return "The longest rental can't be shorter than the shortest.";
      const bad = cfg.tiers.find((t) => !(t.days >= 2) || !(Number(t.price) > 0) || Number(t.price) >= Number(cfg.pricePerDay));
      if (bad) return "Longer-rental rates need a number of days (2 or more) and a daily rent lower than the normal one.";
      return null;
    },
    async save(id) {
      if (!touched) return;
      if (!cfg.enabled && existed) {
        await apiFetch(`/api/rentals/products/${id}`, { method: "PUT", body: { ...cfg, enabled: false, pricePerDay: Number(cfg.pricePerDay) || 0 } });
      } else if (cfg.enabled) {
        await apiFetch(`/api/rentals/products/${id}`, { method: "PUT", body: { ...cfg, tiers: cfg.tiers.filter((t) => t.days && t.price) } });
        setExisted(true);
      }
      setTouched(false);
    },
  }));

  if (!loaded) return null;
  const example = Math.max(cfg.minDays, 3);
  const sampleRate = rateFor(cfg, example);

  return (
    <Card
      id="rental"
      size="small"
      title={
        <span className="flex items-center gap-2">
          <CalendarDays size={15} className="text-accent" aria-hidden="true" /> Rent this product
        </span>
      }
      extra={<Switch checked={cfg.enabled} onChange={(enabled) => update({ enabled })} aria-label="Rent this product" />}
    >
      {!cfg.enabled ? (
        <p className="m-0 text-[13px] text-ink-muted">
          Rent it out by the day instead of selling it — shoppers pick dates on a calendar and you track it under{" "}
          <Link href="/admin/apps/rentals">Apps ▸ Rentals</Link>.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="m-0 text-[12.5px] text-ink-muted">
            Its page shows the daily rent and a booking calendar instead of the price and Add to cart. The selling price above isn&apos;t used — it can be 0.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="flex flex-col gap-1 text-[13px] text-ink">
              Rent per day
              <InputNumber min={1} prefix="₹" value={cfg.pricePerDay} onChange={(pricePerDay) => update({ pricePerDay })} placeholder="1,000" className="w-full" status={cfg.pricePerDay > 0 ? undefined : "warning"} />
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-ink">
              Refundable deposit
              <InputNumber min={0} prefix="₹" value={cfg.deposit} onChange={(deposit) => update({ deposit: deposit || 0 })} className="w-full" />
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-ink">
              Pieces of each size
              <InputNumber min={1} max={999} value={cfg.units} onChange={(units) => update({ units: units || 1 })} className="w-full" />
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[13px] text-ink">Cheaper for longer rentals (optional)</span>
            {cfg.tiers.map((t, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
                From
                <InputNumber min={2} max={365} value={t.days} onChange={(days) => update({ tiers: cfg.tiers.map((x, k) => (k === i ? { ...x, days } : x)) })} className="w-[80px]" />
                days, each day
                <InputNumber min={1} prefix="₹" value={t.price} onChange={(price) => update({ tiers: cfg.tiers.map((x, k) => (k === i ? { ...x, price } : x)) })} className="w-[130px]" />
                <Button size="small" type="text" danger icon={<Trash2 size={13} aria-hidden="true" />} aria-label="Remove" onClick={() => update({ tiers: cfg.tiers.filter((_, k) => k !== i) })} />
              </div>
            ))}
            {cfg.tiers.length < 4 && (
              <Button
                size="small"
                className="self-start"
                icon={<Plus size={13} aria-hidden="true" />}
                onClick={() => update({ tiers: [...cfg.tiers, { days: (cfg.tiers[cfg.tiers.length - 1]?.days || 2) + 1, price: null }] })}
              >
                Add a rate
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="flex flex-col gap-1 text-[13px] text-ink">
              Shortest
              <InputNumber min={1} max={365} value={cfg.minDays} onChange={(minDays) => update({ minDays: minDays || 1 })} addonAfter="days" className="w-full" />
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-ink">
              Longest
              <InputNumber min={1} max={365} value={cfg.maxDays} onChange={(maxDays) => update({ maxDays: maxDays || 1 })} addonAfter="days" className="w-full" />
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-ink" title="Days kept free after each rental, for cleaning and delivery">
              Gap after each
              <InputNumber min={0} max={30} value={cfg.bufferDays} onChange={(bufferDays) => update({ bufferDays: bufferDays ?? 0 })} addonAfter="days" className="w-full" />
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-ink" title="How many days ahead a booking must start">
              Notice
              <InputNumber min={0} max={60} value={cfg.leadDays} onChange={(leadDays) => update({ leadDays: leadDays ?? 0 })} addonAfter="days" className="w-full" />
            </label>
          </div>

          {cfg.pricePerDay > 0 && (
            <p className="m-0 rounded-[10px] bg-app-bg px-3 py-2 text-[13px] text-ink">
              Example: {example} days = <b>{rupees(sampleRate * example)}</b>
              {cfg.deposit > 0 ? ` + ${rupees(cfg.deposit)} deposit (given back)` : ""}. Delivery, deposit and booking options are in{" "}
              <Link href="/admin/apps/rentals?tab=settings">Rentals ▸ Settings</Link>.
            </p>
          )}
        </div>
      )}
    </Card>
  );
});

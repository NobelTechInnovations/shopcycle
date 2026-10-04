"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Button, Empty, Skeleton } from "antd";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { todayDay } from "./shared";

const BAR = {
  requested: "bg-[#FEF0C7] text-[#93370D] border-[#FEC84B]",
  confirmed: "bg-[#D1E9FF] text-[#194185] border-[#84CAFF]",
  out: "bg-[#EBE9FE] text-[#3E1C96] border-[#BDB4FE]",
  late: "bg-[#FEE4E2] text-[#912018] border-[#FDA29B]",
  returned: "bg-[#D1FADF] text-[#05603A] border-[#6CE9A6]",
  blocked: "bg-app-bg text-ink-muted border-app-border border-dashed",
};

const monthName = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const shift = (m, n) => {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};

/** Bookings that overlap, in separate lanes so none hide another. */
function lanes(bookings) {
  const out = [];
  for (const b of [...bookings].sort((a, c) => a.startDate.localeCompare(c.startDate))) {
    const lane = out.find((l) => l[l.length - 1].endDate < b.startDate);
    if (lane) lane.push(b);
    else out.push([b]);
  }
  return out.length ? out : [[]];
}

/** A month at a glance: one row per product (and size), a bar per booking. */
export function RentalCalendar({ version, onOpen }) {
  const { message } = App.useApp();
  const today = todayDay();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    apiFetch(`/api/rentals/calendar?month=${month}`)
      .then(setData)
      .catch((err) => message.error(err.message));
  }, [month, version, message]);

  const rows = useMemo(() => {
    if (!data) return [];
    const out = [];
    for (const p of data.products) {
      const variants = p.variants.length > 1 ? p.variants : [{ id: p.variants[0]?.id || null, title: null }];
      for (const v of variants) {
        const mine = data.bookings.filter((b) => b.productId === p.productId && (!b.variantId || variants.length === 1 || b.variantId === v.id));
        out.push({ key: `${p.productId}:${v.id}`, title: p.title, size: v.title, units: p.units, lanes: lanes(mine) });
      }
    }
    return out;
  }, [data]);

  const cols = data ? `minmax(150px, 190px) repeat(${data.days.length}, minmax(28px, 1fr))` : "";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button size="small" icon={<ChevronLeft size={14} aria-hidden="true" />} onClick={() => setMonth(shift(month, -1))} aria-label="Previous month" />
        <span className="text-[15px] font-semibold text-ink min-w-[150px] text-center">{monthName(month)}</span>
        <Button size="small" icon={<ChevronRight size={14} aria-hidden="true" />} onClick={() => setMonth(shift(month, 1))} aria-label="Next month" />
        {month !== today.slice(0, 7) && (
          <Button size="small" type="link" onClick={() => setMonth(today.slice(0, 7))}>
            This month
          </Button>
        )}
      </div>

      {!data ? (
        <Skeleton active />
      ) : rows.length === 0 ? (
        <Empty description="No products are rented out yet." />
      ) : (
        <div className="overflow-x-auto border border-app-border rounded-[10px] bg-app-surface">
          <div className="min-w-[980px]">
            <div className="grid sticky top-0 bg-app-surface border-b border-app-border z-[1]" style={{ gridTemplateColumns: cols }}>
              <span className="px-3 py-2 text-[12px] text-ink-muted">Product</span>
              {data.days.map((d) => {
                const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
                return (
                  <span key={d} className={`py-1.5 text-center text-[11px] leading-tight ${d === today ? "bg-accent text-white font-semibold rounded-md" : dow === 0 || dow === 6 ? "text-ink" : "text-ink-muted"}`}>
                    {"SMTWTFS"[dow]}
                    <br />
                    {Number(d.slice(8))}
                  </span>
                );
              })}
            </div>
            {rows.map((row) => (
              <div key={row.key} className="grid border-b border-app-border last:border-b-0" style={{ gridTemplateColumns: cols, gridTemplateRows: `repeat(${row.lanes.length}, 30px)` }}>
                <div className="px-3 py-1.5 flex flex-col justify-center min-w-0" style={{ gridRow: `1 / span ${row.lanes.length}` }}>
                  <span className="text-[12.5px] font-medium text-ink truncate">{row.title}</span>
                  <span className="text-[11.5px] text-ink-muted truncate">
                    {row.size ? `${row.size} · ` : ""}
                    {row.units} piece{row.units === 1 ? "" : "s"}
                  </span>
                </div>
                {row.lanes.map((lane, li) =>
                  lane.map((b) => {
                    const from = Math.max(0, data.days.indexOf(b.startDate < data.first ? data.first : b.startDate));
                    const to = data.days.indexOf(b.endDate > data.last ? data.last : b.endDate);
                    const tone = BAR[b.late ? "late" : b.status] || BAR.confirmed;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => onOpen(b.id)}
                        title={`${b.title} · ${b.range}${b.customerName ? ` · ${b.customerName}` : ""}`}
                        className={`m-[3px] px-1.5 rounded-md border text-[11px] font-medium truncate text-left cursor-pointer ${tone}`}
                        style={{ gridRow: li + 1, gridColumn: `${from + 2} / ${to + 3}` }}
                      >
                        {b.status === "blocked" ? "Blocked" : b.customerName || "Booked"}
                      </button>
                    );
                  })
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-3 text-[12px] text-ink-muted">
        {[
          ["requested", "Request"],
          ["confirmed", "Booked"],
          ["out", "With customer"],
          ["late", "Late"],
          ["returned", "Returned"],
          ["blocked", "Blocked"],
        ].map(([k, label]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded-sm border ${BAR[k]}`} /> {label}
          </span>
        ))}
      </div>
    </div>
  );
}

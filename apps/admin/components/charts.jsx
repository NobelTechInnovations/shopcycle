"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

/**
 * Small, dependency-free charts for the admin (SVG + a hover layer).
 * One data hue (a validated blue), thin marks, a 10% area wash, hairline
 * gridlines and text in ink tokens — the data is the only loud thing.
 */
export const SERIES = "#2a78d6";
const GRID = "#eeeef1";
const INK_MUTED = "#6b6b76";

const inrFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat("en-IN");

/** 1,284 / 12.9K / 4.2L (Indian compact), or ₹ amounts. */
export function formatValue(n, kind = "number", { compact = false } = {}) {
  const v = Number(n) || 0;
  if (kind === "percent") return `${v.toFixed(v >= 10 ? 1 : 2)}%`;
  if (compact && Math.abs(v) >= 1000) {
    const c = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(v);
    return kind === "currency" ? `₹${c}` : c;
  }
  return kind === "currency" ? inrFmt.format(v) : numFmt.format(Math.round(v));
}

/** Four even, round steps from 0 that cover `max` (whole numbers for
 * counts): 42 → 0/20/40/60, 8,300 → 0/2.5K/5K/7.5K/10K. */
function niceTicks(max, integer) {
  if (max <= 0) return [0, 1, 2, 3, 4];
  const raw = max / 4;
  const exp = 10 ** Math.floor(Math.log10(raw));
  const f = raw / exp;
  let step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
  if (integer) step = Math.max(1, Math.ceil(step));
  const n = Math.ceil(max / step);
  return Array.from({ length: n + 1 }, (_, i) => i * step);
}

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

const shortDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const longDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

/**
 * A single-series area chart over days. `points`: [{ date: "YYYY-MM-DD",
 * value }]. Hovering shows a crosshair and the day's value.
 */
export function AreaChart({ points, kind = "number", height = 220, label = "Value" }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const pad = { top: 12, right: 12, bottom: 26, left: kind === "currency" ? 56 : 40 };
  const w = Math.max(0, width - pad.left - pad.right);
  const h = height - pad.top - pad.bottom;
  const ticks = niceTicks(Math.max(0, ...points.map((p) => p.value)), kind === "number");
  const max = ticks[ticks.length - 1];
  const x = (i) => (points.length <= 1 ? w / 2 : (i / (points.length - 1)) * w);
  const y = (v) => h - (v / max) * h;

  const { line, area } = useMemo(() => {
    if (!points.length || !w) return { line: "", area: "" };
    const pts = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`);
    return { line: `M${pts.join("L")}`, area: `M${x(0).toFixed(1)},${h}L${pts.join("L")}L${x(points.length - 1).toFixed(1)},${h}Z` };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, w, h, max]);

  // X labels: at most ~7, always including the first and last day.
  const every = Math.max(1, Math.ceil(points.length / 7));
  const xLabels = points.map((p, i) => i).filter((i) => i % every === 0 || i === points.length - 1);

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left - pad.left;
    const i = points.length <= 1 ? 0 : Math.round((px / w) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  }

  const hp = hover != null ? points[hover] : null;
  const allZero = points.every((p) => !p.value);
  return (
    <div ref={ref} className="relative select-none" style={{ height }}>
      {allZero && (
        <p className="pointer-events-none absolute inset-x-0 m-0 text-center text-[13px] text-ink-muted" style={{ top: pad.top + h / 2 - 20 }}>
          No data for this period
        </p>
      )}
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`${label} per day`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          <g transform={`translate(${pad.left},${pad.top})`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={0} x2={w} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
                <text x={-8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={INK_MUTED} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatValue(t, kind, { compact: true })}
                </text>
              </g>
            ))}
            {xLabels.map((i) => (
              <text key={i} x={x(i)} y={h + 18} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} fontSize={11} fill={INK_MUTED}>
                {shortDate(points[i].date)}
              </text>
            ))}
            <path d={area} fill={SERIES} fillOpacity={0.1} />
            <path d={line} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {points.length === 1 && <circle cx={x(0)} cy={y(points[0].value)} r={4} fill={SERIES} stroke="#fff" strokeWidth={2} />}
            {hp && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={0} y2={h} stroke="#c9c9d1" strokeWidth={1} />
                <circle cx={x(hover)} cy={y(hp.value)} r={4.5} fill={SERIES} stroke="#fff" strokeWidth={2} />
              </g>
            )}
            <rect x={0} y={0} width={w} height={h} fill="transparent" />
          </g>
        </svg>
      )}
      {hp && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-app-border bg-app-surface px-3 py-2 shadow-raised text-xs"
          style={{ left: Math.min(Math.max(pad.left + x(hover) - 70, 0), Math.max(0, width - 150)), top: 0 }}
        >
          <p className="m-0 text-ink-muted">{longDate(hp.date)}</p>
          <p className="m-0 mt-0.5 flex items-center gap-1.5 font-semibold text-ink">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: SERIES }} aria-hidden="true" />
            {formatValue(hp.value, kind)}
          </p>
        </div>
      )}
    </div>
  );
}

/** A tiny trend line for stat tiles — no axes, no hover. */
export function Sparkline({ values, width = 96, height = 28 }) {
  if (!values?.length) return null;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${((i / Math.max(1, values.length - 1)) * width).toFixed(1)},${(height - 2 - (v / max) * (height - 4)).toFixed(1)}`);
  return (
    <svg width={width} height={height} aria-hidden="true" className="shrink-0">
      <path d={`M${pts.join("L")}`} fill="none" stroke={SERIES} strokeOpacity={0.55} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** % change vs the previous period; up is green unless `upIsGood` is false. */
export function Delta({ current, previous, upIsGood = true, periodLabel }) {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  if (!p && !c) return <span className="text-xs text-ink-subtle">No change</span>;
  if (!p) return <span className="text-xs text-ink-muted">New this period</span>;
  const pct = ((c - p) / p) * 100;
  const flat = Math.abs(pct) < 0.5;
  const good = flat ? null : pct > 0 === upIsGood;
  const Icon = flat ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${good == null ? "text-ink-muted" : good ? "text-status-success" : "text-status-danger"}`} title={periodLabel ? `vs ${periodLabel}` : undefined}>
      <Icon size={13} aria-hidden="true" />
      {flat ? "0%" : `${Math.abs(pct).toFixed(pct >= 100 ? 0 : 1)}%`}
      <span className="sr-only">{pct > 0 ? "up" : "down"} vs {periodLabel || "the previous period"}</span>
    </span>
  );
}

export function StatTile({ label, value, kind = "number", previous, spark, periodLabel, upIsGood = true }) {
  return (
    <div className="rounded-[14px] border border-app-border bg-app-surface shadow-card px-4 py-3.5 min-w-0">
      <p className="m-0 text-[13px] text-ink-muted truncate">{label}</p>
      <p className="m-0 mt-1 text-[22px] leading-7 font-semibold tracking-tight text-ink whitespace-nowrap" style={{ fontVariantNumeric: "tabular-nums" }}>
        {value == null ? "—" : formatValue(value, kind)}
      </p>
      <div className="mt-1.5 flex items-center justify-between gap-2 min-h-[24px]">
        {previous !== undefined && value != null ? <Delta current={value} previous={previous} upIsGood={upIsGood} periodLabel={periodLabel} /> : <span />}
        <Sparkline values={spark} width={64} height={24} />
      </div>
    </div>
  );
}

/** "Top X" breakdown: label and value on one line, a thin bar under it. */
export function BarList({ items, labelKey = "label", valueKey = "count", renderLabel, kind = "number", empty = "No data yet." }) {
  if (!items?.length) return <p className="text-sm text-ink-muted m-0 py-6 text-center">{empty}</p>;
  const max = Math.max(1, ...items.map((i) => Number(i[valueKey]) || 0));
  const total = items.reduce((s, i) => s + (Number(i[valueKey]) || 0), 0);
  return (
    <ul className="m-0 p-0 list-none flex flex-col gap-3">
      {items.map((item, i) => {
        const v = Number(item[valueKey]) || 0;
        return (
          <li key={i}>
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="truncate text-ink" title={String(item[labelKey])}>
                {renderLabel ? renderLabel(item) : item[labelKey]}
              </span>
              <span className="shrink-0 text-ink font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>
                {formatValue(v, kind)}
                {kind === "number" && total > 0 && <span className="text-ink-subtle font-normal ml-1.5">{Math.round((v / total) * 100)}%</span>}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-[#f0f0f3] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.max(2, (v / max) * 100)}%`, background: SERIES }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

"use client";

import { Tag } from "antd";
import { Phone, MessageCircle } from "lucide-react";

export const STATUS = {
  requested: { label: "Request", color: "gold" },
  confirmed: { label: "Booked", color: "blue" },
  out: { label: "With customer", color: "purple" },
  late: { label: "Late", color: "red" },
  returned: { label: "Returned", color: "green" },
  cancelled: { label: "Cancelled", color: "default" },
  blocked: { label: "Blocked", color: "default" },
};

export const HANDOVER = { delivery: "We deliver", store_pickup: "Customer picks up" };
export const RETURNS = { collect: "We collect it back", drop_off: "Customer drops it back" };
export const DEPOSIT = { none: "No deposit", due: "Collect on handover", held: "Holding", refunded: "Given back", kept: "Kept" };

export const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10-12" → "12 Oct". */
export function dayLabel(day, withWeekday = false) {
  if (!day) return "—";
  const d = new Date(`${day}T00:00:00Z`);
  const text = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return withWeekday ? `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()]}, ${text}` : text;
}

/** Today in India, "YYYY-MM-DD". */
export function todayDay() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Days from a to b ("YYYY-MM-DD"): 12 → 14 Oct is 2. */
export function daysBetween(a, b) {
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
}

export function addDays(day, n) {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
}

export function StatusTag({ booking }) {
  const s = booking.late ? STATUS.late : STATUS[booking.status] || { label: booking.status, color: "default" };
  return (
    <Tag color={s.color} className="m-0">
      {s.label}
      {booking.late ? ` · ${booking.lateDays} day${booking.lateDays === 1 ? "" : "s"}` : ""}
    </Tag>
  );
}

/** Call / WhatsApp links for a customer's number. */
export function ContactLinks({ phone }) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  const wa = digits.length === 10 ? `91${digits}` : digits;
  return (
    <span className="inline-flex items-center gap-2">
      <a href={`tel:${phone}`} className="inline-flex items-center gap-1 text-[12.5px] no-underline" onClick={(e) => e.stopPropagation()}>
        <Phone size={12} aria-hidden="true" /> {phone}
      </a>
      <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12.5px] no-underline text-[#128C7E]" onClick={(e) => e.stopPropagation()} aria-label="WhatsApp">
        <MessageCircle size={12} aria-hidden="true" /> WhatsApp
      </a>
    </span>
  );
}

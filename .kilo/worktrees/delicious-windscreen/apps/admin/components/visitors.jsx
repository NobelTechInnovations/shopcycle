"use client";

import { useState } from "react";
import Link from "next/link";
import { Tag, Tooltip } from "antd";
import { Monitor, Smartphone, Tablet, Phone, MessageCircle, Mail, ChevronDown, ChevronUp, ShoppingBag, ShoppingCart, CreditCard, Package, LayoutGrid, Home, Search, User, FileText } from "lucide-react";

export const DEVICE_ICON = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
  unknown: Monitor,
};

const KIND_ICON = { product: Package, collection: LayoutGrid, home: Home, cart: ShoppingCart, checkout: CreditCard, search: Search, account: User };

export function timeAgo(iso) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export const when = (iso) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** "9876543210" / "+91 98765 43210" → digits for wa.me (India by default). */
function waNumber(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  return d.length === 10 ? `91${d}` : d;
}

/** Call / WhatsApp / email buttons for a shopper we know. */
export function ContactButtons({ phone, email, compact = false }) {
  const cls = `inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-app-border bg-app-surface text-[12.5px] text-ink no-underline hover:border-accent hover:text-accent transition-colors`;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {phone && (
        <a href={`tel:${phone}`} className={cls}>
          <Phone size={13} aria-hidden="true" /> {compact ? "Call" : phone}
        </a>
      )}
      {phone && (
        <a href={`https://wa.me/${waNumber(phone)}`} target="_blank" rel="noopener noreferrer" className={cls}>
          <MessageCircle size={13} aria-hidden="true" /> WhatsApp
        </a>
      )}
      {email && !compact && (
        <a href={`mailto:${email}`} className={cls}>
          <Mail size={13} aria-hidden="true" /> Email
        </a>
      )}
    </div>
  );
}

function Trail({ views }) {
  return (
    <ol className="list-none m-0 p-0 mt-2 border-l border-app-border ml-[7px] flex flex-col gap-1.5">
      {views.map((v, i) => {
        const Icon = KIND_ICON[v.kind] || FileText;
        return (
          <li key={i} className="relative pl-4 text-[12.5px] flex items-start justify-between gap-3">
            <span className="absolute -left-[5px] top-[6px] w-[9px] h-[9px] rounded-full bg-app-surface border border-app-border" aria-hidden="true" />
            <span className="min-w-0 flex items-center gap-1.5 text-ink">
              <Icon size={12} className="text-ink-subtle shrink-0" aria-hidden="true" />
              <span className="truncate">{v.label}</span>
            </span>
            <span className="text-ink-subtle tabular-nums shrink-0">{new Date(v.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** One past visit: who, when, what they looked at, how far they got. */
export function VisitRow({ visit, showCustomer = true }) {
  const [open, setOpen] = useState(false);
  const Device = DEVICE_ICON[visit.deviceType] || Monitor;
  const minutes = Math.max(1, Math.round((new Date(visit.lastSeenAt) - new Date(visit.firstSeenAt)) / 60000));
  const outcome = visit.orders.length
    ? { text: `Ordered #${visit.orders.map((o) => o.orderNumber).join(", #")}`, color: "green" }
    : visit.reachedCheckout
      ? { text: "Reached checkout, didn't buy", color: "orange" }
      : visit.reachedCart
        ? { text: "Added to cart", color: "gold" }
        : null;

  return (
    <div className="py-3 border-t border-app-border first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex items-start gap-3">
          <span className="w-8 h-8 rounded-full bg-app-bg flex items-center justify-center text-ink-muted shrink-0">
            <Device size={15} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            {showCustomer && (
              <p className="m-0 text-sm font-medium text-ink">
                {visit.customer ? (
                  <Link href={`/admin/customers/${visit.customer.id}`} className="text-ink hover:underline">
                    {visit.customer.name || visit.customer.phone || visit.customer.email}
                  </Link>
                ) : (
                  "Visitor (not signed in)"
                )}
              </p>
            )}
            <p className="m-0 text-[12.5px] text-ink-muted">
              {when(visit.firstSeenAt)} · {minutes} min · {visit.views.length} page{visit.views.length === 1 ? "" : "s"}
              {visit.source ? ` · from ${visit.source}` : ""}
            </p>
            {visit.productsViewed.length > 0 && (
              <p className="m-0 mt-1 text-[12.5px] text-ink">
                <ShoppingBag size={12} className="inline -mt-0.5 mr-1 text-ink-subtle" aria-hidden="true" />
                Looked at {visit.productsViewed.slice(0, 3).join(", ")}
                {visit.productsViewed.length > 3 ? ` +${visit.productsViewed.length - 3} more` : ""}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {outcome && <Tag color={outcome.color} className="m-0">{outcome.text}</Tag>}
          {showCustomer && visit.customer && <ContactButtons phone={visit.customer.phone} email={visit.customer.email} compact />}
        </div>
      </div>
      {visit.views.length > 0 && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1.5 ml-11 inline-flex items-center gap-1 text-[12px] text-accent bg-transparent border-0 p-0 cursor-pointer">
          {open ? <ChevronUp size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />}
          {open ? "Hide pages" : "Pages they visited"}
        </button>
      )}
      {open && (
        <div className="ml-11">
          <Trail views={visit.views} />
        </div>
      )}
    </div>
  );
}

export function CountryTag({ country }) {
  return (
    <Tooltip title="Country">
      <Tag className="m-0">{country || "Unknown"}</Tag>
    </Tooltip>
  );
}

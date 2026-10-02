"use client";

import { useState } from "react";
import { App, Button, Card, Empty } from "antd";
import { Truck, PackageCheck, AlarmClock, Inbox, CalendarDays, Shirt } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { StatusTag, ContactLinks, HANDOVER, RETURNS, rupees, dayLabel } from "./shared";

function Row({ b, today, onOpen, action }) {
  const when = b.status === "out" ? b.endDate : b.startDate;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(b.id)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(b.id)}
      className="flex flex-wrap items-center gap-3 py-3 border-t border-app-border first:border-t-0 cursor-pointer hover:bg-app-bg -mx-3 px-3 rounded-md"
    >
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[13.5px] font-medium text-ink truncate">
          {b.title}
          {b.quantity > 1 && <span className="text-ink-muted"> × {b.quantity}</span>}
        </p>
        <p className="m-0 text-[12.5px] text-ink-muted">
          {b.customerName || "—"} · {dayLabel(b.startDate)} → {dayLabel(b.endDate)}
          {when === today ? " · today" : ""}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
          <ContactLinks phone={b.phone} />
          <span className="text-[12px] text-ink-subtle">{b.status === "out" ? RETURNS[b.returnMethod] : HANDOVER[b.handover]}</span>
          {b.order && <span className="text-[12px] text-ink-subtle">Order #{b.order.orderNumber}</span>}
        </div>
        {b.address && (b.status === "out" ? b.returnMethod === "collect" : b.handover === "delivery") && <p className="m-0 mt-0.5 text-[12px] text-ink-muted line-clamp-1">{b.address}</p>}
      </div>
      <StatusTag booking={b} />
      {action}
    </div>
  );
}

function Section({ icon: Icon, title, hint, items, children, tone = "text-accent" }) {
  return (
    <Card
      size="small"
      title={
        <span className="flex items-center gap-2">
          <Icon size={15} className={tone} aria-hidden="true" />
          {title}
          <span className="text-ink-muted font-normal">· {items.length}</span>
        </span>
      }
    >
      {items.length === 0 ? <p className="m-0 py-2 text-[13px] text-ink-muted">{hint}</p> : children}
    </Card>
  );
}

/** The day's work: requests to answer, pieces going out, coming back, late. */
export function TodayBoard({ data, onOpen, onChanged, onSetUp }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(null);

  async function quick(b, action, body, done) {
    setBusy(`${b.id}:${action}`);
    try {
      await apiFetch(`/api/rentals/bookings/${b.id}/${action}`, { method: "POST", body });
      message.success(done);
      onChanged();
    } catch (err) {
      message.error(err.message || "That didn't work");
    } finally {
      setBusy(null);
    }
  }

  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };

  if (!data.products) {
    return (
      <Card>
        <Empty
          image={<Shirt size={40} className="text-ink-subtle mx-auto" aria-hidden="true" />}
          description={
            <span className="text-[13.5px]">
              No products are rented out yet. Open a product, turn on <b>Rent this product</b> and set the rent per day.
            </span>
          }
        >
          <Button type="primary" onClick={onSetUp}>
            Set up a product
          </Button>
        </Empty>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <Section icon={Inbox} title="Booking requests" hint="No requests waiting." items={data.requests} tone="text-[#B54708]">
        {data.requests.map((b) => (
          <Row
            key={b.id}
            b={b}
            today={data.today}
            onOpen={onOpen}
            action={
              <Button size="small" type="primary" loading={busy === `${b.id}:confirm`} onClick={stop(() => quick(b, "confirm", {}, "Booking confirmed"))}>
                Confirm
              </Button>
            }
          />
        ))}
      </Section>

      <Section icon={AlarmClock} title="Late returns" hint="Nothing is late. 🎉" items={data.late} tone="text-[#B42318]">
        {data.late.map((b) => (
          <Row key={b.id} b={b} today={data.today} onOpen={onOpen} action={<Button size="small" onClick={stop(() => onOpen(b.id))}>Returned…</Button>} />
        ))}
      </Section>

      <Section icon={Truck} title="Going out today & tomorrow" hint="Nothing to hand over today or tomorrow." items={data.goingOut}>
        {data.goingOut.map((b) => (
          <Row
            key={b.id}
            b={b}
            today={data.today}
            onOpen={onOpen}
            action={
              <Button size="small" loading={busy === `${b.id}:out`} onClick={stop(() => quick(b, "out", { depositCollected: true }, "Marked as handed over"))}>
                Handed over
              </Button>
            }
          />
        ))}
      </Section>

      <Section icon={PackageCheck} title="Coming back today & tomorrow" hint="Nothing due back today or tomorrow." items={data.comingBack}>
        {data.comingBack.map((b) => (
          <Row
            key={b.id}
            b={b}
            today={data.today}
            onOpen={onOpen}
            action={
              <Button size="small" loading={busy === `${b.id}:returned`} onClick={stop(() => quick(b, "returned", {}, "Marked as returned"))}>
                Returned
              </Button>
            }
          />
        ))}
      </Section>

      <p className="xl:col-span-2 m-0 text-[12.5px] text-ink-muted flex items-center gap-1.5">
        <CalendarDays size={13} aria-hidden="true" /> {data.upcoming} more booking{data.upcoming === 1 ? "" : "s"} coming up · {data.products} product{data.products === 1 ? "" : "s"} for rent
        {data.goingOut.some((b) => b.deposit > 0 && b.depositStatus === "due") ? ` · collect deposits on handover (${rupees(data.goingOut.filter((b) => b.depositStatus === "due").reduce((n, b) => n + b.deposit, 0))})` : ""}
      </p>
    </div>
  );
}

"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { App, Badge, Button, Skeleton, Tabs } from "antd";
import { CalendarPlus, Ban } from "lucide-react";
import { PageHeader } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { useApps } from "@/lib/apps";
import { AppNotInstalled } from "@/components/apps/AppPanelParts";
import { BookingDrawer } from "./BookingDrawer";
import { TodayBoard } from "./TodayBoard";
import { BookingsList } from "./BookingsList";
import { RentalCalendar } from "./RentalCalendar";
import { RentalProducts } from "./RentalProducts";
import { RentalSettings } from "./RentalSettings";
import { NewBookingModal } from "./NewBookingModal";

const TABS = ["today", "bookings", "calendar", "products", "settings"];

/**
 * Apps ▸ Rentals: what goes out and comes back today, every booking, a
 * month calendar, the products rented out, and the app's settings.
 */
function RentalsPanel() {
  const router = useRouter();
  const params = useSearchParams();
  const { message } = App.useApp();
  const tab = TABS.includes(params.get("tab")) ? params.get("tab") : "today";
  const bookingId = params.get("booking");
  const [overview, setOverview] = useState(null);
  const [settings, setSettings] = useState(null);
  const [version, setVersion] = useState(0);
  const [creating, setCreating] = useState(null);

  const go = useCallback(
    (next) => {
      const q = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) (v == null ? q.delete(k) : q.set(k, v));
      router.replace(`/admin/apps/rentals?${q}`, { scroll: false });
    },
    [params, router]
  );

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    apiFetch("/api/rentals/overview").then(setOverview).catch((err) => message.error(err.message));
  }, [version, message]);
  useEffect(() => {
    apiFetch("/api/rentals/settings").then((d) => setSettings(d.settings)).catch(() => {});
  }, []);

  const open = (id) => go({ booking: id });
  const waiting = overview ? overview.requests.length + overview.late.length : 0;

  return (
    <div>
      <PageHeader
        title="Rentals"
        backHref="/admin/apps"
        subtitle="Products you rent out by the day — bookings, handovers, returns and deposits."
        actions={
          <div className="flex gap-2">
            <Button icon={<Ban size={14} aria-hidden="true" />} onClick={() => setCreating("block")}>
              Block dates
            </Button>
            <Button type="primary" icon={<CalendarPlus size={14} aria-hidden="true" />} onClick={() => setCreating("booking")}>
              Add booking
            </Button>
          </div>
        }
      />

      <Tabs
        activeKey={tab}
        onChange={(t) => go({ tab: t })}
        items={[
          { key: "today", label: <Badge count={waiting} size="small" offset={[8, -2]}>Today</Badge>, children: overview ? <TodayBoard data={overview} onOpen={open} onChanged={reload} onSetUp={() => go({ tab: "products" })} /> : <Skeleton active /> },
          { key: "bookings", label: "Bookings", children: <BookingsList version={version} onOpen={open} /> },
          { key: "calendar", label: "Calendar", children: <RentalCalendar version={version} onOpen={open} /> },
          { key: "products", label: "Products", children: <RentalProducts /> },
          { key: "settings", label: "Settings", children: <RentalSettings settings={settings} onSaved={setSettings} /> },
        ]}
      />

      <BookingDrawer bookingId={bookingId} settings={settings} onClose={() => go({ booking: null })} onChanged={reload} />
      <NewBookingModal
        kind={creating}
        onClose={() => setCreating(null)}
        onCreated={(b) => {
          setCreating(null);
          reload();
          message.success(b.status === "blocked" ? "Dates blocked" : "Booking added");
        }}
      />
    </div>
  );
}

export default function RentalsPage() {
  const { apps } = useApps();
  const app = (apps || []).find((a) => a.key === "rentals");
  if (!apps) return <Skeleton active paragraph={{ rows: 8 }} />;
  if (!app?.installed) {
    return (
      <AppNotInstalled
        appKey="rentals"
        title="Rent your products out by the day"
        description="Shoppers pick dates on a calendar that greys out booked days. You set the daily rent, a deposit and delivery or pickup — and track every booking here."
      />
    );
  }
  return (
    <Suspense fallback={<Skeleton active />}>
      <RentalsPanel />
    </Suspense>
  );
}

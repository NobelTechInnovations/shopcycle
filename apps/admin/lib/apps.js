"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

/**
 * Apps with a full panel of their own. Every app also has a details page
 * (/admin/apps/details/[key]) — what it does, its settings, uninstall —
 * which is where apps without a panel open.
 */
export const APP_PANELS = {
  flow: "/admin/apps/flow",
  "instagram-feed": "/admin/apps/instagram",
  "google-reviews": "/admin/apps/google-reviews",
  "meta-ads": "/admin/apps/meta-ads",
  whatsapp: "/admin/apps/whatsapp",
  "product-reviews": "/admin/apps/reviews",
  rentals: "/admin/apps/rentals",
  "google-shopping": "/admin/apps/google-shopping",
  "facebook-shop": "/admin/apps/facebook-shop",
};

export const detailsHref = (app) => `/admin/apps/details/${app.key}`;
export const appHref = (app) => APP_PANELS[app.key] || detailsHref(app);

export const APP_CATEGORIES = {
  sales_channel: "Sales channels",
  selling: "Selling",
  automation: "Automation",
  checkout: "Checkout",
  customers: "Customers",
  marketing: "Marketing",
  analytics: "Analytics",
  utility: "Utilities",
  other: "Other",
};

/** "₹299", not "₹299.00" — app prices are whole rupees. */
export const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const EVENT = "oy:apps-changed";

/** Tell every open list (the sidebar, the Apps page) to reload. */
export function announceAppsChanged() {
  window.dispatchEvent(new Event(EVENT));
}

/** The catalog with install state, kept fresh across the admin. */
export function useApps() {
  const [apps, setApps] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch("/api/apps");
      setApps(data.apps);
      setError(null);
    } catch (err) {
      setError(err);
      setApps((prev) => prev || []);
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(EVENT, load);
    return () => window.removeEventListener(EVENT, load);
  }, [load]);

  return { apps, installed: (apps || []).filter((a) => a.installed), loading: apps === null, error, reload: load };
}

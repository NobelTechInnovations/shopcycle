"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Form, Skeleton, Tag } from "antd";
import { Check, Crown, ExternalLink, LifeBuoy, Lock, Trash2 } from "lucide-react";
import { PageHeader, EmptyState } from "@shopcycle/ui";
import { useApps, appHref, APP_PANELS, APP_CATEGORIES, rupees } from "@/lib/apps";
import { useAppActions } from "@/components/apps/useAppActions";
import { AppSettingsFields } from "@/components/apps/AppSettingsForm";
import { AppTile } from "@/components/apps/AppTile";

// What each app does, in a few lines — shown on its page.
const HIGHLIGHTS = {
  flow: [
    "Eight ready-made recipes: thank-yous, review requests, win-back, COD confirmation, abandoned-checkout follow-ups",
    "Triggers for orders placed, shipped, delivered, cancelled and refunded, new customers and abandoned checkouts",
    "Waits, conditions and personal emails with the customer's name, order and a discount code",
    "Send yourself a test, then watch every run in the flow's activity",
  ],
  "one-click-checkout": [
    "Checkout in a popup from the cart — no page loads",
    "Mobile number and a one-time code; saved addresses filled in",
    "Every payment method your gateways offer, plus cash on delivery",
    "A cancelled payment brings the shopper back to the popup, not a blank page",
  ],
  "phone-login": [
    "Shoppers sign in with their mobile number and a code — no passwords",
    "Codes by SMS or WhatsApp",
    "Orders placed with the same number show up in their account",
    "Coming soon: order and delivery updates on WhatsApp, included",
  ],
  "product-reviews": ["Star ratings on product pages and cards", "Verified-buyer badges", "Reply, hide or feature reviews", "Import reviews from a CSV"],
  "facebook-pixel": ["Continue with Facebook and pick your pixel", "Page views, add to cart, checkout and purchase sent automatically", "Better ads from real sales data"],
  "google-analytics": ["Paste your G- measurement ID", "Every page view and purchase tracked in GA4"],
  "meta-ads": ["Connect your Facebook ad account", "See and manage campaigns from your admin"],
  whatsapp: ["Connect WhatsApp Business", "Message customers from your admin"],
};

const HELP = { flow: "flow-automation", "one-click-checkout": "one-click-checkout", "phone-login": "customers", "product-reviews": "product-reviews", "facebook-pixel": "meta-pixel-analytics", "google-analytics": "meta-pixel-analytics" };

function Panel({ title, children, className = "" }) {
  return (
    <section className={`bg-app-surface border border-app-border rounded-[14px] shadow-card p-5 ${className}`}>
      {title && <h2 className="text-[15px] font-semibold text-ink m-0 mb-3">{title}</h2>}
      {children}
    </section>
  );
}

export default function AppDetailsPage({ params }) {
  const { key } = use(params);
  const router = useRouter();
  const { apps, loading } = useApps();
  const { install, uninstall } = useAppActions();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const app = (apps || []).find((a) => a.key === key);
  const hasSettings = app && ((app.settingsSchema || []).length > 0 || app.key === "facebook-pixel");

  useEffect(() => {
    if (app) form.setFieldsValue(app.settings || {});
  }, [app, form]);

  if (loading) return <Skeleton active avatar paragraph={{ rows: 6 }} />;
  if (!app) return <EmptyState title="App not found" description="It may have been removed from the catalog." actionLabel="Back to Apps" onAction={() => router.push("/admin/apps")} />;

  async function save(values) {
    setSaving(true);
    const ok = await install(app, values);
    setSaving(false);
    if (ok && !app.installed && APP_PANELS[app.key]) router.push(appHref(app));
  }

  const highlights = HIGHLIGHTS[app.key] || [];
  const actions = app.installed ? (
    <>
      {APP_PANELS[app.key] && (
        <Button type="primary" icon={<ExternalLink size={14} aria-hidden="true" />} onClick={() => router.push(appHref(app))}>
          Open app
        </Button>
      )}
      <Button danger icon={<Trash2 size={14} aria-hidden="true" />} onClick={() => uninstall(app)}>
        Uninstall
      </Button>
    </>
  ) : app.locked ? (
    <Button type="primary" icon={<Lock size={14} aria-hidden="true" />} onClick={() => router.push("/admin/settings/billing")}>
      Upgrade to install
    </Button>
  ) : hasSettings ? null : (
    <Button type="primary" onClick={async () => (await install(app)) && APP_PANELS[app.key] && router.push(appHref(app))}>
      Install{app.priceMonthly ? ` · ${rupees(app.priceMonthly)}/mo` : ""}
    </Button>
  );

  return (
    <div>
      <PageHeader
        backHref="/admin/apps"
        title={app.name}
        meta={app.installed ? <Tag color="success" className="!m-0">Installed</Tag> : null}
        subtitle={`${APP_CATEGORIES[app.category] || "App"} · ${app.priceMonthly ? `${rupees(app.priceMonthly)}/month + GST` : "Free"}`}
        actions={actions}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start">
        <div className="flex flex-col gap-5">
          <Panel>
            <div className="flex items-start gap-4">
              <AppTile app={app} size={56} />
              <p className="text-[14px] leading-relaxed text-ink m-0">{app.description}</p>
            </div>
            {highlights.length > 0 && (
              <ul className="list-none p-0 mt-5 mb-0 grid gap-2.5 sm:grid-cols-2">
                {highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2 text-[13px] text-ink-muted leading-snug">
                    <span className="mt-0.5 w-4 h-4 rounded-full bg-accent-soft text-accent flex items-center justify-center shrink-0">
                      <Check size={11} aria-hidden="true" />
                    </span>
                    {h}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {hasSettings && (
            <Panel title={app.installed ? "Settings" : "Set up and install"}>
              {app.locked && !app.installed ? (
                <p className="text-[13px] text-ink-muted m-0">This app comes with the Growth and Pro plans.</p>
              ) : (
                <Form layout="vertical" form={form} onFinish={save} requiredMark={false}>
                  <AppSettingsFields app={app} form={form} />
                  <div className="flex justify-end pt-1">
                    <Button type="primary" htmlType="submit" loading={saving}>
                      {app.installed ? "Save settings" : `Install${app.priceMonthly ? ` · ${rupees(app.priceMonthly)}/mo` : ""}`}
                    </Button>
                  </div>
                </Form>
              )}
            </Panel>
          )}

          {app.installed && !hasSettings && !APP_PANELS[app.key] && (
            <Panel title="Settings">
              <p className="text-[13px] text-ink-muted m-0">
                Nothing to set up — {app.name} is working on your store. {app.key === "one-click-checkout" ? "Choose which fields checkout asks for in Settings ▸ Checkout." : ""}
              </p>
            </Panel>
          )}
        </div>

        <div className="flex flex-col gap-5">
          <Panel title="Pricing">
            <p className="text-[22px] font-semibold text-ink m-0" style={{ letterSpacing: "-0.02em" }}>
              {app.priceMonthly ? rupees(app.priceMonthly) : "Free"}
              {app.priceMonthly && <span className="text-[13px] font-normal text-ink-muted"> /month + GST</span>}
            </p>
            <p className="text-[13px] text-ink-muted mt-1.5 mb-0">
              {app.priceMonthly ? "Added to your plan's bill for each billing period it's installed. Uninstall anytime to stop future charges." : "No charge to install or use."}
            </p>
            {app.premium && (
              <p className="text-[13px] text-accent mt-3 mb-0 inline-flex items-center gap-1.5">
                <Crown size={13} aria-hidden="true" /> Included with Growth and Pro
              </p>
            )}
          </Panel>
          <Panel title="Need help?">
            <div className="flex flex-col gap-2 text-[13px]">
              {HELP[app.key] && (
                <Link href={`/admin/support/articles/${HELP[app.key]}`} className="text-ink font-medium">
                  How to use {app.name} →
                </Link>
              )}
              <Link href="/admin/support" className="text-ink-muted inline-flex items-center gap-1.5">
                <LifeBuoy size={13} aria-hidden="true" /> Ask the Help assistant
              </Link>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, Alert, Card, Tag, Button, App, Popconfirm, Skeleton } from "antd";
import { Megaphone, LineChart, Images, Bot, ShieldCheck, FileClock } from "lucide-react";
import { PageHeader } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { MetaConnectPanel } from "@/components/MetaConnectPanel";
import { CapsProvider, useCaps } from "./ads-ui";
import Campaigns from "./Campaigns";
import Insights from "./Insights";
import MediaLibrary from "./Media";
import Automation from "./Automation";
import Wizard from "./Wizard";

const TABS = ["campaigns", "insights", "media", "automation", "setup"];

/** Problems with the account (no payment method, no Pixel, missing
 * permission) — shown on every tab until they're fixed. */
function Problems({ compact }) {
  const { caps, error, reload } = useCaps();
  if (error) return <Alert type="error" showIcon message="Couldn't read your ad account" description={error.message} action={<Button size="small" onClick={reload}>Retry</Button>} />;
  if (!caps) return compact ? null : <Skeleton active />;
  if (!caps.problems.length) return compact ? null : <Alert type="success" showIcon message="Your ad account is ready" />;
  return (
    <Alert
      type="warning"
      showIcon
      message={compact ? `${caps.problems.length} thing${caps.problems.length === 1 ? "" : "s"} to fix in your ad account` : "Before your ads can run well"}
      description={
        <ul className="m-0 pl-4">
          {caps.problems.map((p, i) => (
            <li key={i}>
              {p.text}
              {p.fix && <span className="block text-xs text-ink-muted">{p.fix}</span>}
            </li>
          ))}
        </ul>
      }
    />
  );
}

function Setup() {
  const { caps } = useCaps();
  if (!caps) return <Skeleton active />;
  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      <div className="flex flex-col gap-4">
        <Problems />
        <Card size="small" title="Ad account">
          {caps.adAccount ? (
            <ul className="text-sm m-0 pl-4">
              <li>{caps.adAccount.name} ({caps.adAccount.currency}, {caps.adAccount.timezone})</li>
              <li>Status: {caps.adAccount.status.replace(/_/g, " ")}</li>
              <li>Spent all time: ₹{Math.round(caps.adAccount.amountSpent).toLocaleString("en-IN")}</li>
              <li>Payment method: {caps.adAccount.hasPaymentMethod ? "added" : "missing"}</li>
            </ul>
          ) : (
            "—"
          )}
          <p className="text-xs text-ink-muted mt-2 mb-0">Meta bills your ad spend directly to this account&apos;s payment method. Oyklane never charges for ad spend.</p>
        </Card>
      </div>
      <div className="flex flex-col gap-4">
        <Card size="small" title="Permissions Oyklane has">
          <div className="flex flex-wrap gap-1">
            {["ads_management", "ads_read", "business_management", "pages_show_list", "pages_read_engagement"].map((p) => (
              <Tag key={p} color={caps.permissions.includes(p) ? "green" : "default"}>
                {p}
                {caps.permissions.includes(p) ? "" : " — missing"}
              </Tag>
            ))}
          </div>
          <p className="text-xs text-ink-muted mt-2 mb-0">
            A missing permission means you didn&apos;t allow it when connecting, or Meta hasn&apos;t approved it for Oyklane yet (App Review). Reconnect Facebook to grant it.
          </p>
        </Card>
        <Card size="small" title="Pages, Pixel and audiences">
          <p className="text-sm m-0">
            Pages: {caps.pages.map((p) => `${p.name}${p.instagram ? ` (+ @${p.instagram.username})` : ""}`).join(", ") || "none"}
          </p>
          <p className="text-sm m-0 mt-1">Pixels: {caps.pixels.map((p) => `${p.name}${p.active ? " ✓" : " (quiet)"}`).join(", ") || "none"}</p>
          <p className="text-sm m-0 mt-1">Custom audiences: {caps.audiences.length}</p>
        </Card>
      </div>
    </div>
  );
}

function Drafts({ onOpen, refreshKey }) {
  const [drafts, setDrafts] = useState([]);
  const load = useCallback(() => apiFetch("/api/meta-ads/drafts").then((d) => setDrafts(d.drafts)).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load, refreshKey]);
  if (!drafts.length) return null;
  return (
    <Card size="small" title={<span className="flex items-center gap-1.5"><FileClock size={14} aria-hidden="true" /> Unfinished campaigns</span>}>
      <div className="flex flex-col gap-1">
        {drafts.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate">
              {d.name} {d.status === "failed" && <Tag color="red">Publishing stopped</Tag>}
              <span className="text-xs text-ink-muted"> · saved {new Date(d.updatedAt).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
              {d.error && <span className="block text-xs text-status-danger">{d.error}</span>}
            </span>
            <span className="flex gap-1 shrink-0">
              <Button size="small" onClick={() => onOpen(d.id)}>Continue</Button>
              <Popconfirm title="Delete this draft?" onConfirm={() => apiFetch(`/api/meta-ads/drafts/${d.id}`, { method: "DELETE" }).then(load)}>
                <Button size="small" type="text" danger>Delete</Button>
              </Popconfirm>
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Suite() {
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState(TABS.includes(params.get("tab")) ? params.get("tab") : "campaigns");
  const [range, setRange] = useState({ preset: "last_7d" });
  const [wizard, setWizard] = useState({ open: false });
  const [store, setStore] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    apiFetch("/api/store")
      .then(setStore)
      .catch(() => setStore({ role: "staff" }));
  }, []);
  const canEdit = store && store.role !== "staff";
  const label = (Icon, text) => (
    <span className="inline-flex items-center gap-1.5">
      <Icon size={14} aria-hidden="true" />
      {text}
    </span>
  );
  return (
    <div className="flex flex-col gap-3">
      <Problems compact />
      <Tabs
        activeKey={tab}
        onChange={(k) => {
          setTab(k);
          router.replace(`/admin/apps/meta-ads?tab=${k}`, { scroll: false });
        }}
        items={[
          {
            key: "campaigns",
            label: label(Megaphone, "Campaigns"),
            children: (
              <div className="flex flex-col gap-3">
                <Drafts refreshKey={refreshKey} onOpen={(id) => setWizard({ open: true, draftId: id })} />
                <Campaigns key={refreshKey} canEdit={canEdit} range={range} setRange={setRange} onCreate={() => setWizard({ open: true })} />
              </div>
            ),
          },
          { key: "insights", label: label(LineChart, "Insights"), children: <Insights range={range} setRange={setRange} canEdit={canEdit} /> },
          { key: "media", label: label(Images, "Media library"), children: <MediaLibrary /> },
          { key: "automation", label: label(Bot, "Automation & activity"), children: <Automation canEdit={canEdit} /> },
          { key: "setup", label: label(ShieldCheck, "Account check"), children: <Setup /> },
        ]}
        destroyOnHidden
      />
      <Wizard
        open={wizard.open}
        draftId={wizard.draftId}
        storeUrl={store?.store?.publicUrl}
        onClose={() => {
          setWizard({ open: false });
          setRefreshKey((k) => k + 1);
        }}
        onPublished={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}

export default function MetaAdsPage() {
  return (
    <div>
      <PageHeader
        title="Meta Ads"
        subtitle="Create and manage Facebook and Instagram ads, see what's working, and get suggestions — all from your store."
        actions={
          <>
            <Link href="/admin/analytics"><Button>Store analytics</Button></Link>
            <Link href="/admin/apps/whatsapp"><Button>WhatsApp</Button></Link>
          </>
        }
      />
      <MetaConnectPanel focus="ads">
        <CapsProvider>
          <Suspense fallback={null}>
            <Suite />
          </Suspense>
        </CapsProvider>
      </MetaConnectPanel>
    </div>
  );
}

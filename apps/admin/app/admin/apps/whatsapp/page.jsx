"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Alert, Button, Skeleton, Tabs } from "antd";
import { MessagesSquare, FileText, Megaphone, Zap, Settings } from "lucide-react";
import { PageHeader } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { MetaConnectPanel } from "@/components/MetaConnectPanel";
import { HealthCard } from "./wa-ui";
import Inbox from "./Inbox";
import Templates from "./Templates";
import Broadcasts from "./Broadcasts";
import Automations from "./Automations";
import WaSettings from "./WaSettings";

const TABS = ["inbox", "templates", "broadcasts", "automations", "settings"];

/** `shared`: the store has no number of its own and sends from Oyklane's
 * (order updates and sign-in codes) — its inbox, Oyklane's templates
 * (read-only) and settings; broadcasts and automations need its own. */
function Suite({ shared = false }) {
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState(TABS.includes(params.get("tab")) ? params.get("tab") : "inbox");
  const [role, setRole] = useState(null);
  useEffect(() => {
    apiFetch("/api/store")
      .then((d) => setRole(d.role))
      .catch(() => setRole("staff"));
  }, []);
  const canEdit = role && role !== "staff";
  const label = (Icon, text) => (
    <span className="inline-flex items-center gap-1.5">
      <Icon size={14} aria-hidden="true" />
      {text}
    </span>
  );
  return (
    <div className="flex flex-col gap-3">
      {!shared && <HealthCard compact />}
      <Tabs
        activeKey={shared && ["broadcasts", "automations"].includes(tab) ? "inbox" : tab}
        onChange={(k) => {
          setTab(k);
          router.replace(`/admin/apps/whatsapp?tab=${k}`, { scroll: false });
        }}
        items={[
          { key: "inbox", label: label(MessagesSquare, "Inbox"), children: <Inbox /> },
          { key: "templates", label: label(FileText, "Templates"), children: <Templates canEdit={canEdit} /> },
          !shared && { key: "broadcasts", label: label(Megaphone, "Broadcasts"), children: <Broadcasts canEdit={canEdit} /> },
          !shared && { key: "automations", label: label(Zap, "Automations"), children: <Automations /> },
          { key: "settings", label: label(Settings, "Settings"), children: <WaSettings canEdit={canEdit} /> },
        ].filter(Boolean)}
        destroyOnHidden
      />
    </div>
  );
}

export default function WhatsappPage() {
  const [mode, setMode] = useState(null);
  const loadMode = useCallback(() => {
    apiFetch("/api/whatsapp/mode")
      .then(setMode)
      .catch(() => setMode({ own: true }));
  }, []);
  useEffect(() => {
    loadMode();
  }, [loadMode]);

  return (
    <div>
      <PageHeader
        title="WhatsApp"
        subtitle="Your customers' conversations, templates, broadcasts and automatic messages — on the official WhatsApp Business Platform."
        actions={
          <>
            <Link href="/admin/customers"><Button>Customers</Button></Link>
            <Link href="/admin/apps/meta-ads"><Button>Meta Ads</Button></Link>
          </>
        }
      />
      {!mode ? (
        <Skeleton active />
      ) : mode.own ? (
        <MetaConnectPanel focus="whatsapp" onChange={loadMode}>
          <Suspense fallback={null}>
            <Suite />
          </Suspense>
        </MetaConnectPanel>
      ) : (
        <div className="flex flex-col gap-4">
          <Alert
            type="info"
            showIcon
            message={mode.platform?.ready ? `Your store sends from Oyklane's WhatsApp number${mode.platform.number ? ` — ${mode.platform.number}` : ""}` : "Oyklane's WhatsApp number is being set up"}
            description={
              mode.platform?.ready
                ? "Order updates and sign-in codes go out from it with your store's name, and customers' replies land in your Inbox below. Oyklane manages its templates. Connect your own number to send broadcasts and automations and to create your own templates."
                : "Order updates on WhatsApp start once it's ready — nothing for you to do. Or connect your own number below to message customers now."
            }
          />
          <MetaConnectPanel focus="whatsapp" onChange={loadMode} />
          <Suspense fallback={null}>
            <Suite shared />
          </Suspense>
        </div>
      )}
    </div>
  );
}

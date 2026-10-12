"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs } from "antd";
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

function Suite() {
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
      <HealthCard compact />
      <Tabs
        activeKey={tab}
        onChange={(k) => {
          setTab(k);
          router.replace(`/admin/apps/whatsapp?tab=${k}`, { scroll: false });
        }}
        items={[
          { key: "inbox", label: label(MessagesSquare, "Inbox"), children: <Inbox /> },
          { key: "templates", label: label(FileText, "Templates"), children: <Templates canEdit={canEdit} /> },
          { key: "broadcasts", label: label(Megaphone, "Broadcasts"), children: <Broadcasts canEdit={canEdit} /> },
          { key: "automations", label: label(Zap, "Automations"), children: <Automations /> },
          { key: "settings", label: label(Settings, "Settings"), children: <WaSettings canEdit={canEdit} /> },
        ]}
        destroyOnHidden
      />
    </div>
  );
}

export default function WhatsappPage() {
  return (
    <div>
      <PageHeader title="WhatsApp" subtitle="Your customers' conversations, templates, broadcasts and automatic messages — on the official WhatsApp Business Platform." />
      <MetaConnectPanel focus="whatsapp">
        <Suspense fallback={null}>
          <Suite />
        </Suspense>
      </MetaConnectPanel>
    </div>
  );
}

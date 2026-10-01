"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card } from "antd";
import { Paintbrush, Plus, MousePointerClick } from "lucide-react";
import { EmptyState } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { useApps } from "@/lib/apps";
import { useAppActions } from "@/components/apps/useAppActions";
import { AppTile } from "@/components/apps/AppTile";

/** An app's panel when the app isn't installed: what it is, Install. */
export function AppNotInstalled({ appKey, title, description }) {
  const router = useRouter();
  const { apps } = useApps();
  const { install } = useAppActions();
  const app = (apps || []).find((a) => a.key === appKey);
  return (
    <EmptyState
      icon={app ? <AppTile app={app} size={48} /> : null}
      title={title}
      description={description}
      actionLabel={app ? `Install ${app.name}` : undefined}
      onAction={async () => app && (await install(app)) && router.refresh()}
      secondary={<Link href={`/admin/apps/details/${appKey}`}>What it does</Link>}
    />
  );
}

/** "Now add it to your store": the three steps in the theme editor. */
export function AddToStoreCard({ sectionName }) {
  const [themeId, setThemeId] = useState(null);
  useEffect(() => {
    apiFetch("/api/themes")
      .then((d) => setThemeId(d.themes.find((t) => t.isActive)?.id || null))
      .catch(() => {});
  }, []);
  const steps = [
    { icon: Paintbrush, text: <>Open <b>Customize</b> for your theme.</> },
    { icon: Plus, text: <>Click <b>Add section</b> on the page you want — home, or a product page.</> },
    { icon: MousePointerClick, text: <>Pick <b>{sectionName}</b> under <b>Apps</b>, drag it into place and save.</> },
  ];
  return (
    <Card size="small" title="Show it on your store">
      <ol className="list-none m-0 p-0 flex flex-col gap-2.5">
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <li key={i} className="flex items-start gap-2.5 text-[13px] text-ink">
              <span className="w-6 h-6 rounded-full bg-accent-soft text-accent flex items-center justify-center shrink-0">
                <Icon size={13} aria-hidden="true" />
              </span>
              <span className="pt-0.5">{s.text}</span>
            </li>
          );
        })}
      </ol>
      <Button type="primary" className="mt-4" href={themeId ? `/theme-editor/${themeId}` : "/admin/online-store/themes"} icon={<Paintbrush size={14} aria-hidden="true" />}>
        Open Customize
      </Button>
    </Card>
  );
}

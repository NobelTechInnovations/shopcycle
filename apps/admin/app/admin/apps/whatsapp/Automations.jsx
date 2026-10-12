"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Button, Tag, App, Alert, Empty, Skeleton } from "antd";
import { Zap, ArrowRight } from "lucide-react";
import { apiFetch } from "@/lib/api";

/**
 * WhatsApp automations are Flows (Apps ▸ Flow) with WhatsApp steps: the
 * same engine runs email and WhatsApp, with waits, conditions, quiet
 * hours, frequency limits, test mode and a log of every run.
 */
export default function Automations() {
  const { message } = App.useApp();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    apiFetch("/api/flows")
      .then(setData)
      .catch((err) => setError(err));
  }, []);

  async function use(key) {
    setBusy(key);
    try {
      const { flow } = await apiFetch("/api/flows", { method: "POST", body: { recipe: key } });
      router.push(`/admin/apps/flow/${flow.id}`);
    } catch (err) {
      message.error(err.message);
      setBusy(null);
    }
  }

  if (error) {
    return (
      <Alert
        type="info"
        showIcon
        message="WhatsApp automations run on the Flow app"
        description={
          <span>
            Install Flow from <Link href="/admin/apps">Apps</Link> to send order confirmations, shipping updates, payment and cart reminders on WhatsApp automatically.
          </span>
        }
      />
    );
  }
  if (!data) return <Skeleton active paragraph={{ rows: 6 }} />;
  const recipes = data.catalog.recipes.filter((r) => r.channel === "whatsapp");
  const mine = data.flows.filter((f) => (f.steps || []).some((s) => s.type === "send_whatsapp"));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-[15px] font-semibold mt-0 mb-2">Your WhatsApp flows</h3>
        {mine.length ? (
          <div className="grid md:grid-cols-2 gap-3">
            {mine.map((f) => (
              <Link key={f.id} href={`/admin/apps/flow/${f.id}`} className="block">
                <Card size="small" hoverable>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink">{f.name}</span>
                    <Tag color={f.enabled ? "green" : "default"}>{f.enabled ? "On" : "Off"}</Tag>
                  </div>
                  <p className="text-xs text-ink-muted m-0 mt-1">
                    {f.runsCount} runs · {f.whatsappSent || 0} WhatsApp sent{f.settings?.testMode ? " · test mode" : ""}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="None yet — start from one below." />
        )}
      </div>
      <div>
        <h3 className="text-[15px] font-semibold mt-0 mb-1">Ready to use</h3>
        <p className="text-sm text-ink-muted mt-0">
          Each uses a template with the name shown — create it first in the Templates tab (there&apos;s a ready-made version of each). Flows start off; check them, then turn them on.
        </p>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {recipes.map((r) => (
            <Card key={r.key} size="small">
              <div className="flex items-start gap-2">
                <Zap size={16} className="text-emerald-600 mt-0.5 shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="font-medium m-0">{r.name}</p>
                  <p className="text-xs text-ink-muted mt-1 mb-2">{r.description}</p>
                  <Button size="small" icon={<ArrowRight size={13} aria-hidden="true" />} loading={busy === r.key} onClick={() => use(r.key)}>
                    Use this
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

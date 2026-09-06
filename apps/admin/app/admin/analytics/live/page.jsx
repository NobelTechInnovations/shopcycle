"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Tag, Badge } from "antd";
import { Monitor, Smartphone, Tablet, Radio } from "lucide-react";
import { PageHeader, EmptyState } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

const POLL_MS = 5000;

const DEVICE_ICON = {
  desktop: <Monitor size={14} aria-hidden="true" />,
  mobile: <Smartphone size={14} aria-hidden="true" />,
  tablet: <Tablet size={14} aria-hidden="true" />,
  unknown: <Monitor size={14} aria-hidden="true" />,
};

function timeAgo(iso) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

export default function LiveViewPage() {
  const [visitors, setVisitors] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch("/api/analytics/live");
      setVisitors(data.visitors);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Live view"
        actions={
          <Badge status={visitors.length > 0 ? "success" : "default"} text={`${visitors.length} active now`} />
        }
      />

      <Card size="small" loading={loading}>
        {!loading && visitors.length === 0 && (
          <EmptyState
            icon={<Radio size={32} strokeWidth={1.5} aria-hidden="true" />}
            title="No one's browsing right now"
            description="This updates automatically every few seconds while your storefront gets traffic."
          />
        )}
        {visitors.map((v) => (
          <div
            key={v.sessionId}
            className="flex items-center justify-between py-3 border-t border-app-border first:border-t-0"
          >
            <div className="flex items-center gap-3">
              <span className="text-ink-muted">{DEVICE_ICON[v.deviceType] || DEVICE_ICON.unknown}</span>
              <div>
                <p className="text-sm m-0 font-medium">{v.customerName || "Anonymous visitor"}</p>
                <p className="text-xs text-ink-muted m-0">{v.path}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Tag>{v.country || "Unknown"}</Tag>
              <span className="text-xs text-ink-muted w-16 text-right">{timeAgo(v.updatedAt)}</span>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

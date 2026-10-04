"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Table, Button, Tag, Select } from "antd";
import { ScrollText } from "lucide-react";
import { PageHeader, EmptyState } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

// Plain-language labels for the action codes the API records. Anything
// not listed shows its raw code, so a new action is never hidden.
const ACTION_LABELS = {
  "auth.platform_sign_in": "Signed in to the platform console",
  "auth.2fa_enabled": "Turned on two-step verification",
  "auth.2fa_disabled": "Turned off two-step verification",
  "auth.2fa_failed": "Entered a wrong verification code",
  "auth.sign_out_everywhere": "Signed out everywhere",
  "store.status_change": "Changed a store's status",
  "plan.create": "Created a plan",
  "plan.update": "Edited a plan",
  "plan.delete": "Deleted a plan",
  "app.create": "Added an app to the catalog",
  "app.update": "Edited an app",
  "app.delete": "Removed an app from the catalog",
};

// Colour encodes risk at a glance: red for lockout-relevant events,
// orange for changes to stores/plans, neutral for routine sign-ins.
function toneFor(action) {
  if (action === "auth.2fa_failed" || action === "auth.2fa_disabled") return "error";
  if (action.startsWith("store.") || action.startsWith("plan.") || action.startsWith("app.")) return "warning";
  return "default";
}

const FILTERS = [
  { value: "", label: "All activity" },
  { value: "auth.", label: "Sign-ins & security" },
  { value: "store.", label: "Store changes" },
  { value: "plan.", label: "Plan changes" },
  { value: "app.", label: "App catalog changes" },
];

function describe(entry) {
  const m = entry.metadata || {};
  if (entry.action === "store.status_change" && m.body?.status) return `Set to ${m.body.status}`;
  if (m.body?.name) return m.body.name;
  if (m.twoFactor) return "With two-step verification";
  return "";
}

const columns = [
  {
    title: "When",
    dataIndex: "createdAt",
    width: 170,
    render: (d) => (
      <span className="tabular-nums text-ink-muted text-[13px]">
        {new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
      </span>
    ),
  },
  {
    title: "Activity",
    dataIndex: "action",
    render: (action, row) => (
      <div>
        <Tag color={toneFor(action)} className="!mr-0">
          {ACTION_LABELS[action] || action}
        </Tag>
        {describe(row) && <div className="text-xs text-ink-muted mt-1">{describe(row)}</div>}
      </div>
    ),
  },
  { title: "By", dataIndex: "actorEmail", render: (e) => e || "—" },
  {
    title: "IP address",
    dataIndex: "ip",
    width: 140,
    render: (ip) => <span className="font-mono text-xs text-ink-muted">{ip || "—"}</span>,
  },
];

export default function AuditLogPage() {
  const [entries, setEntries] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const load = useCallback(async (reset, action, after) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ limit: "50", ...(action && { action }), ...(after && { cursor: after }) });
      const data = await apiFetch(`/api/super-admin/audit-logs?${qs}`);
      setEntries((prev) => (reset ? data.entries : [...prev, ...data.entries]));
      setCursor(data.nextCursor);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true, filter);
  }, [load, filter]);

  return (
    <div>
      <PageHeader
        title="Audit log"
        actions={<Select value={filter} onChange={setFilter} options={FILTERS} style={{ width: 200 }} aria-label="Filter activity" />}
      />
      <p className="text-sm text-ink-muted -mt-3 mb-5">
        Every change made in this console and every sign-in, newest first. Entries can't be edited or deleted.
      </p>
      <Card size="small" className="!shadow-card">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={entries}
          loading={loading && entries.length === 0}
          pagination={false}
          locale={{
            emptyText: (
              <EmptyState
                icon={<ScrollText size={32} strokeWidth={1.5} />}
                title="No activity yet"
                description="Sign-ins and changes made in this console will appear here."
              />
            ),
          }}
        />
        {cursor && (
          <div className="flex justify-center pt-4">
            <Button loading={loading} onClick={() => load(false, filter, cursor)}>
              Load older activity
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

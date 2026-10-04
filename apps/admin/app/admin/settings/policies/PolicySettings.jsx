"use client";

import { useState } from "react";
import Link from "next/link";
import { App, Button, Card } from "antd";
import { ExternalLink, FileText, Plus } from "lucide-react";
import { StatusBadge } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { storefrontUrlFor } from "@/lib/storefront";

/**
 * Settings ▸ Policies: refund, shipping, privacy and terms. Each is a page
 * at a fixed address, linked in the footer of every theme once published.
 * "Create" starts it from a template with the store's name and contact.
 */
export function PolicySettings({ initial, store }) {
  const { message } = App.useApp();
  const [policies, setPolicies] = useState(initial);
  const [busy, setBusy] = useState(null);
  const base = storefrontUrlFor(store).replace(/\/$/, "");

  async function create(key) {
    setBusy(key);
    try {
      const { page } = await apiFetch(`/api/pages/policies/${key}`, { method: "POST" });
      setPolicies((list) => list.map((p) => (p.key === key ? { ...p, page } : p)));
      message.success("Policy created and published — review it and make it yours.");
    } catch (err) {
      message.error(err.message);
    }
    setBusy(null);
  }

  return (
    <Card
      size="small"
      className="!shadow-card"
      title="Policies"
      styles={{ body: { padding: 0 } }}
      extra={<span className="text-xs text-ink-muted">Linked in your store&apos;s footer</span>}
    >
      <p className="text-[13px] text-ink-muted m-0 px-5 pt-4 pb-2">
        Shoppers and payment gateways look for these. Each starts from a template with your store&apos;s name and contact details — read it and change
        anything that doesn&apos;t match how you work. They&apos;re a starting point, not legal advice.
      </p>
      <ul className="list-none m-0 p-0">
        {policies.map((p) => (
          <li key={p.key} className="flex flex-wrap items-center gap-3 px-5 py-4 border-t border-app-border first:border-t-0">
            <span className="w-9 h-9 rounded-lg bg-app-bg text-ink-muted flex items-center justify-center shrink-0">
              <FileText size={17} aria-hidden="true" />
            </span>
            <div className="flex-1 min-w-[180px]">
              <p className="m-0 text-sm font-medium text-ink">{p.title}</p>
              <p className="m-0 text-[13px] text-ink-muted">{p.hint}</p>
            </div>
            {p.page ? (
              <div className="flex items-center gap-2">
                <StatusBadge status={p.page.status === "active" ? "active" : "draft"} />
                {p.page.status === "active" && (
                  <Button size="small" href={`${base}/pages/${p.slug}`} target="_blank" icon={<ExternalLink size={13} aria-hidden="true" />}>
                    View
                  </Button>
                )}
                <Link href={`/admin/content/pages/${p.page.id}`}>
                  <Button size="small" type="primary">
                    Edit
                  </Button>
                </Link>
              </div>
            ) : (
              <Button size="small" icon={<Plus size={13} aria-hidden="true" />} loading={busy === p.key} onClick={() => create(p.key)}>
                Create from template
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { App, Button, Card, Input, Modal, Segmented, Skeleton, Table, Tag } from "antd";
import { ExternalLink, Check, X } from "lucide-react";
import { formatCurrency } from "@shopcycle/utils";
import { PageHeader, useHasMounted } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

const inr = (n) => formatCurrency(Number(n || 0), "INR");
const day = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
const STATUS = { draft: ["Draft", "default"], in_review: ["In review", "gold"], approved: ["Listed", "green"], rejected: ["Changes needed", "red"], suspended: ["Taken down", "red"] };

/**
 * Oyklane Store (oyklanestore.com): review developers' themes and apps
 * (click through a theme on the demo store before approving), take a
 * listing down, and record payouts to developers.
 */
export default function MarketAdminPage() {
  const mounted = useHasMounted();
  const { message, modal } = App.useApp();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("review");
  const [busy, setBusy] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await apiFetch("/api/super-admin/market"));
    } catch (err) {
      message.error(err.message);
    }
  }, [message]);
  useEffect(() => {
    load();
  }, [load]);

  async function run(key, fn, ok) {
    setBusy(key);
    try {
      await fn();
      if (ok) message.success(ok);
      await load();
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  if (!mounted || !data) return <Skeleton active paragraph={{ rows: 8 }} />;

  const previewLinks = (preview) =>
    preview ? (
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px]">
        {data.pages.map((p) => (
          <a key={p.key} href={`${preview.base}${p.path}${p.path.includes("?") ? "&" : "?"}themeId=${preview.themeId}`} target="_blank" rel="noopener noreferrer">
            {p.label}
          </a>
        ))}
      </div>
    ) : null;

  return (
    <div>
      <PageHeader title="Oyklane Store" subtitle="Developers' themes and apps — review, listings and payouts." />
      <Segmented
        className="mb-5"
        value={tab}
        onChange={setTab}
        options={[
          { value: "review", label: `To review (${data.queue.length})` },
          { value: "listings", label: `Listings (${data.listings.length})` },
          { value: "partners", label: `Developers (${data.partners.length})` },
        ]}
      />

      {tab === "review" && (
        <div className="flex flex-col gap-4">
          {data.queue.length === 0 && <Card>Nothing to review.</Card>}
          {data.queue.map((v) => (
            <Card key={v.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 max-w-2xl">
                  <p className="m-0 text-[16px] font-semibold">
                    {v.listing.name} <span className="text-ink-muted font-normal">· {v.listing.kind} · v{v.version}</span>
                  </p>
                  <p className="m-0 text-[13px] text-ink-muted">
                    by {v.listing.partner.name} ({v.listing.partner.email}) · {v.listing.free ? "Free" : `${inr(v.listing.price)}${v.listing.kind === "app" ? "/mo" : ""}`} · sent {day(v.createdAt)}
                  </p>
                  {v.listing.tagline && <p className="m-0 mt-2 text-[14px]">{v.listing.tagline}</p>}
                  {v.changelog && <p className="m-0 mt-1 text-[13px] text-ink-muted">What's new: {v.changelog}</p>}
                  {v.listing.kind === "theme" && <div className="mt-2">{previewLinks(v.preview)}</div>}
                  {v.listing.kind === "app" && (
                    <div className="mt-2 text-[12.5px] text-ink-muted flex flex-col gap-0.5">
                      <span>App link: {v.listing.appUrl || "—"}</span>
                      <span>Webhook: {v.listing.installWebhook || "—"}</span>
                      <span>Storefront script: {v.listing.embedScriptUrl || "none"}</span>
                      <span>Permissions: {(v.listing.scopeLabels || []).join(", ") || "none"}</span>
                    </div>
                  )}
                  {v.listing.screenshots?.length > 0 && (
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {v.listing.screenshots.map((s) => (
                        <a key={s} href={s} target="_blank" rel="noopener noreferrer">
                          <img src={s} alt="" className="w-28 h-18 object-cover rounded border border-app-border" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="primary"
                    icon={<Check size={15} aria-hidden="true" />}
                    loading={busy === `ok-${v.id}`}
                    onClick={() =>
                      modal.confirm({
                        title: `Approve ${v.listing.name} v${v.version}?`,
                        content: "It goes live on the Oyklane Store (or replaces the live version) straight away.",
                        okText: "Approve",
                        onOk: () => run(`ok-${v.id}`, () => apiFetch(`/api/super-admin/market/versions/${v.id}/decide`, { method: "POST", body: { approve: true } }), "Approved"),
                      })
                    }
                  >
                    Approve
                  </Button>
                  <Button danger icon={<X size={15} aria-hidden="true" />} onClick={() => (setRejecting(v), setNote(""))}>
                    Needs changes
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "listings" && (
        <Card styles={{ body: { padding: 0 } }}>
          <Table
            rowKey="id"
            dataSource={data.listings}
            scroll={{ x: "max-content" }}
            pagination={{ pageSize: 25, hideOnSinglePage: true }}
            columns={[
              { title: "Name", render: (_, l) => <b className="font-medium">{l.name}</b> },
              { title: "Type", dataIndex: "kind" },
              { title: "By", render: (_, l) => l.partner.name },
              { title: "Price", render: (_, l) => (l.free ? "Free" : `${inr(l.price)}${l.kind === "app" ? "/mo" : ""}`) },
              { title: "Status", render: (_, l) => <Tag color={STATUS[l.status]?.[1]}>{STATUS[l.status]?.[0] || l.status}</Tag> },
              { title: "Installs", dataIndex: "installs" },
              {
                title: "",
                align: "right",
                render: (_, l) => (
                  <div className="flex gap-2 justify-end">
                    {l.status === "approved" && (
                      <a href={`${process.env.NEXT_PUBLIC_MARKET_ORIGIN || "https://oyklanestore.com"}/${l.kind}s/${l.slug}`} target="_blank" rel="noopener noreferrer">
                        <Button size="small" icon={<ExternalLink size={13} aria-hidden="true" />} />
                      </a>
                    )}
                    {l.status === "approved" ? (
                      <Button size="small" danger loading={busy === `s-${l.id}`} onClick={() => run(`s-${l.id}`, () => apiFetch(`/api/super-admin/market/listings/${l.id}/status`, { method: "POST", body: { status: "suspended" } }), "Taken down")}>
                        Take down
                      </Button>
                    ) : l.status === "suspended" ? (
                      <Button size="small" loading={busy === `s-${l.id}`} onClick={() => run(`s-${l.id}`, () => apiFetch(`/api/super-admin/market/listings/${l.id}/status`, { method: "POST", body: { status: "approved" } }), "Listed again")}>
                        List again
                      </Button>
                    ) : null}
                  </div>
                ),
              },
            ]}
          />
        </Card>
      )}

      {tab === "partners" && (
        <Card styles={{ body: { padding: 0 } }}>
          <Table
            rowKey="id"
            dataSource={data.partners}
            scroll={{ x: "max-content" }}
            pagination={{ pageSize: 25, hideOnSinglePage: true }}
            columns={[
              { title: "Developer", render: (_, p) => <div><b className="font-medium">{p.name}</b>{p.company ? ` · ${p.company}` : ""}<div className="text-[12px] text-ink-muted">{p.email}</div></div> },
              { title: "Listings", dataIndex: "listings" },
              { title: "Payout to", render: (_, p) => (p.payoutUpi ? `${p.payoutUpi}${p.payoutName ? ` (${p.payoutName})` : ""}` : <span className="text-ink-muted">not set</span>) },
              { title: "Owed", render: (_, p) => <b className="tabular-nums">{inr(p.owed)}</b> },
              { title: "Status", render: (_, p) => <Tag color={p.status === "active" ? "green" : "red"}>{p.status}</Tag> },
              {
                title: "",
                align: "right",
                render: (_, p) => (
                  <div className="flex gap-2 justify-end">
                    {p.owed > 0 && (
                      <Button
                        size="small"
                        type="primary"
                        onClick={() => {
                          let ref = "";
                          modal.confirm({
                            title: `Record ${inr(p.owed)} paid to ${p.name}?`,
                            content: (
                              <div>
                                <p className="mb-2 text-[13px]">Send it to {p.payoutUpi || "their UPI ID"} first, then record it here with the UPI reference.</p>
                                <Input placeholder="UPI reference (UTR)" onChange={(e) => (ref = e.target.value)} />
                              </div>
                            ),
                            okText: "Record payout",
                            onOk: () => run(`pay-${p.id}`, () => apiFetch(`/api/super-admin/market/partners/${p.id}/payout`, { method: "POST", body: { reference: ref } }), "Payout recorded"),
                          });
                        }}
                      >
                        Record payout
                      </Button>
                    )}
                    <Button size="small" danger={p.status === "active"} onClick={() => run(`st-${p.id}`, () => apiFetch(`/api/super-admin/market/partners/${p.id}/status`, { method: "POST", body: { status: p.status === "active" ? "suspended" : "active" } }), "Updated")}>
                      {p.status === "active" ? "Suspend" : "Reinstate"}
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </Card>
      )}

      <Modal
        open={Boolean(rejecting)}
        title={`What needs fixing in ${rejecting?.listing.name}?`}
        okText="Send to the developer"
        okButtonProps={{ danger: true, disabled: note.trim().length < 5 }}
        onCancel={() => setRejecting(null)}
        onOk={() =>
          run(`no-${rejecting.id}`, () => apiFetch(`/api/super-admin/market/versions/${rejecting.id}/decide`, { method: "POST", body: { approve: false, note } }), "Sent back").then(() => setRejecting(null))
        }
      >
        <Input.TextArea rows={5} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. The product page breaks on phones; the cart drawer script loads a tracker that isn't mentioned." />
      </Modal>
    </div>
  );
}

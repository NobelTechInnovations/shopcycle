"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Table, Button, Modal, Alert, Skeleton, App } from "antd";
import { Mail, Eye } from "lucide-react";
import { PageHeader, EmptyState, StatusBadge, SearchInput } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

function when(iso) {
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
}

/**
 * Every email the platform has sent — to sellers and to shoppers on
 * stores' behalf. Without an email provider (local development) nothing
 * actually leaves the machine: messages are kept here in full, which is
 * where password-reset links and sign-in codes can be read while testing.
 */
export default function EmailsPage() {
  const { message } = App.useApp();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [viewing, setViewing] = useState(null);
  const pageSize = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (q) params.set("q", q);
      const data = await apiFetch(`/api/email-log/platform?${params}`);
      setRows(data.emails);
      setTotal(data.total);
      setConfigured(data.providerConfigured);
    } finally {
      setLoading(false);
    }
  }, [page, q]);

  useEffect(() => {
    load();
  }, [load]);

  async function open(row) {
    setViewing({ ...row, loading: true });
    try {
      const { email } = await apiFetch(`/api/email-log/platform/${row.id}`);
      setViewing(email);
    } catch (err) {
      message.error(err.message);
      setViewing(null);
    }
  }

  const columns = [
    {
      title: "Email",
      render: (_, row) => (
        <div className="min-w-0">
          <div className="text-ink truncate max-w-[420px]">{row.subject}</div>
          <div className="text-xs text-ink-muted truncate">
            {row.template} · to {row.to}
          </div>
        </div>
      ),
    },
    {
      title: "Status",
      width: 150,
      render: (_, row) => (
        <span title={row.error || undefined}>
          <StatusBadge status={row.status} />
        </span>
      ),
    },
    {
      title: "When",
      responsive: ["md"],
      width: 190,
      render: (_, row) => <span className="text-[13px] text-ink-muted tabular-nums">{when(row.createdAt)}</span>,
    },
    {
      title: "",
      width: 80,
      align: "right",
      render: (_, row) =>
        row.status === "logged" ? (
          <Button size="small" type="text" icon={<Eye size={14} aria-hidden="true" />} onClick={() => open(row)} aria-label={`Open ${row.subject}`}>
            Open
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader title="Emails" subtitle={loading ? " " : `${total} email${total === 1 ? "" : "s"} sent by the platform`} />
      {!configured && (
        <Alert
          className="mb-5"
          type="info"
          showIcon
          message="No email provider is connected — emails are kept here instead of being sent."
          description="Set SMTP_HOST, SMTP_USER, SMTP_PASS and EMAIL_FROM in .env (Resend, Brevo, Amazon SES, Zoho or Gmail all work over SMTP) and restart the API to send for real."
        />
      )}
      <Card size="small" styles={{ body: { padding: 0 } }}>
        <div className="p-3 border-b border-app-border">
          <SearchInput
            placeholder="Recipient or subject"
            onSearch={(v) => {
              setPage(1);
              setQ(v);
            }}
          />
        </div>
        <Table
          rowKey="id"
          scroll={{ x: "max-content" }}
          loading={loading}
          columns={columns}
          dataSource={rows}
          pagination={total > pageSize && { current: page, pageSize, total, onChange: setPage, showSizeChanger: false }}
          locale={{ emptyText: <EmptyState icon={<Mail />} title="No emails yet" description="Sign-up, order and password emails appear here." /> }}
        />
      </Card>

      <Modal open={Boolean(viewing)} onCancel={() => setViewing(null)} footer={null} width={680} title={viewing?.subject} destroyOnHidden>
        {viewing?.loading ? (
          <Skeleton active />
        ) : (
          <>
            <p className="text-xs text-ink-muted mt-1">
              To {viewing?.to} · {viewing && when(viewing.createdAt)}
            </p>
            {/* sandbox="allow-popups": links open in a new tab; no scripts or forms run inside the preview. */}
            <iframe
              title="Email preview"
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              srcDoc={(viewing?.html || "").replace("<head>", '<head><base target="_blank">')}
              className="w-full h-[560px] border border-app-border rounded-lg bg-white"
            />
          </>
        )}
      </Modal>
    </div>
  );
}

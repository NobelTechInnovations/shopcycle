"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Input, Button, App, Alert, Skeleton } from "antd";
import { Globe, Copy, ExternalLink, CheckCircle2, Clock, RefreshCw, Trash2 } from "lucide-react";
import { StatusBadge, useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

function CopyButton({ value }) {
  const { message } = App.useApp();
  return (
    <Button
      size="small"
      type="text"
      icon={<Copy size={13} aria-hidden="true" />}
      aria-label={`Copy ${value}`}
      onClick={() =>
        navigator.clipboard.writeText(value).then(
          () => message.success("Copied"),
          () => message.info("Select the text and copy it")
        )
      }
    />
  );
}

const hrefFor = (address) => (address.startsWith("http") ? address : `https://${address}`);

export function DomainSettings({ canEdit = true }) {
  const { message } = App.useApp();
  const { confirmDialog } = useConfirmDialog();
  const [info, setInfo] = useState(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(null);

  const load = useCallback(async (quiet) => {
    if (!quiet) setBusy("check");
    try {
      setInfo(await apiFetch("/api/store/domain"));
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(null);
    }
  }, [message]);

  useEffect(() => {
    load(true);
  }, [load]);

  async function connect() {
    setBusy("connect");
    try {
      const next = await apiFetch("/api/store/domain", { method: "PUT", body: { domain: value } });
      setInfo(next);
      setValue("");
      message.success(`${next.domain} added — now update its DNS`);
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  function disconnect() {
    confirmDialog({
      title: `Disconnect ${info.domain}?`,
      description: `Visitors to ${info.domain} will stop seeing your store. Your free address ${info.defaultAddress} keeps working.`,
      okText: "Disconnect",
      danger: true,
      onConfirm: async () => {
        setInfo(await apiFetch("/api/store/domain", { method: "DELETE" }));
        message.success("Domain disconnected");
      },
    });
  }

  if (!info) {
    return (
      <Card size="small" className="max-w-2xl">
        <Skeleton active paragraph={{ rows: 3 }} />
      </Card>
    );
  }

  return (
    <div className="max-w-2xl flex flex-col gap-4">
      <Card size="small" title="Free Oyklane address">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-lg bg-accent-soft text-accent flex items-center justify-center shrink-0">
              <Globe size={17} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="m-0 text-sm font-medium text-ink truncate">{info.defaultAddress.replace(/^https?:\/\//, "")}</p>
              <p className="m-0 text-xs text-ink-muted">Always works, even after you connect your own domain.</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <CopyButton value={hrefFor(info.defaultAddress)} />
            <Button size="small" href={hrefFor(info.defaultAddress)} target="_blank" rel="noopener noreferrer" icon={<ExternalLink size={13} aria-hidden="true" />}>
              Open
            </Button>
          </div>
        </div>
      </Card>

      <Card
        size="small"
        title="Your own domain"
        extra={info.domain ? <StatusBadge status={info.connected ? "active" : "pending"} label={info.connected ? "Connected" : "Waiting for DNS"} /> : null}
      >
        {!info.domain ? (
          <>
            <p className="text-sm text-ink-muted mt-0">
              Use a domain you've bought (from GoDaddy, Hostinger, Namecheap…). Enter it here, then add the DNS records we show you at your domain provider.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                size="large"
                placeholder="example.com or shop.example.com"
                value={value}
                disabled={!canEdit}
                onChange={(e) => setValue(e.target.value)}
                onPressEnter={() => value.trim() && connect()}
              />
              <Button size="large" type="primary" loading={busy === "connect"} disabled={!canEdit || !value.trim()} onClick={connect}>
                Connect domain
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <a href={`https://${info.domain}`} target="_blank" rel="noopener noreferrer" className="text-[15px] font-semibold text-ink hover:underline">
                {info.domain}
              </a>
              <div className="flex gap-2">
                <Button size="small" icon={<RefreshCw size={13} aria-hidden="true" />} loading={busy === "check"} onClick={() => load(false)}>
                  Check again
                </Button>
                {canEdit && (
                  <Button size="small" danger icon={<Trash2 size={13} aria-hidden="true" />} onClick={disconnect}>
                    Disconnect
                  </Button>
                )}
              </div>
            </div>

            {info.connected ? (
              <Alert
                type="success"
                showIcon
                icon={<CheckCircle2 size={16} />}
                message={`Your store is live at ${info.domain}`}
                description={info.kind === "apex" ? `www.${info.domain} works too.` : undefined}
              />
            ) : (
              <Alert
                type="info"
                showIcon
                icon={<Clock size={16} />}
                message="Add these records at your domain provider"
                description="Open your provider's DNS settings, add each record below exactly as shown (delete any old A or CNAME record for the same name), and save. Changes usually show up within an hour, sometimes up to 48 hours."
              />
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-xs text-ink-muted">
                    <th className="font-medium py-2 pr-3">Type</th>
                    <th className="font-medium py-2 pr-3">Name / Host</th>
                    <th className="font-medium py-2 pr-3">Value / Points to</th>
                    <th className="font-medium py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {info.records.map((r) => (
                    <tr key={`${r.type}-${r.name}`} className="border-t border-app-border align-middle">
                      <td className="py-2.5 pr-3 font-semibold text-ink">{r.type}</td>
                      <td className="py-2.5 pr-3">
                        <span className="inline-flex items-center gap-1 font-mono text-[13px]">
                          {r.name}
                          <CopyButton value={r.name} />
                        </span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className="inline-flex items-center gap-1 font-mono text-[13px] break-all">
                          {r.value}
                          <CopyButton value={r.value} />
                        </span>
                      </td>
                      <td className="py-2.5">
                        {r.ok ? <StatusBadge status="active" label="Found" /> : <StatusBadge status="pending" label={r.found?.length ? "Wrong value" : "Not found yet"} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {info.records.some((r) => !r.ok && r.found?.length) && (
              <p className="text-xs text-ink-muted m-0">
                We currently see: {info.records.filter((r) => !r.ok && r.found?.length).map((r) => `${r.host} → ${r.found.join(", ")}`).join("; ")}
              </p>
            )}
            {!info.hosting.managed && (
              <p className="text-xs text-ink-muted m-0">
                Once DNS is in place, the Oyklane team activates the domain and its security certificate (HTTPS) — usually within a day.
              </p>
            )}
            {info.hosting.managed && info.dnsOk && info.hosting.verified === false && (
              <p className="text-xs text-ink-muted m-0">DNS looks right — the security certificate (HTTPS) is being issued. This takes a few minutes.</p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

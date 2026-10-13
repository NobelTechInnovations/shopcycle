"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Button, Select, App, Tag, Alert } from "antd";
import { Facebook, CheckCircle2, RefreshCw, ExternalLink } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { WhatsappSignupButton } from "@/components/WhatsappSignupButton";

// Where MetaConnectPanel sends the browser to authorize, and where it
// expects to land back — see apps/admin/app/admin/apps/meta/callback,
// which reads `returnTo` out of sessionStorage (set right before this
// redirect) so the merchant lands back on whichever of the two apps
// (Meta Ads or WhatsApp) they actually started from, even though both
// share one Facebook connection and one OAuth redirect_uri.
const RETURN_TO_KEY = "meta-connect-return-to";

/**
 * The Facebook connect + asset-picker UI shared by the Meta Ads and
 * WhatsApp app panels (see MetaConnection's doc comment in schema.prisma
 * for why one connection backs both). `focus` picks which assets this
 * particular app actually needs selected before its own panel renders:
 * "ads" needs an ad account + page, "whatsapp" needs a WABA + phone number.
 *
 * Renders `children` only once the connection is fully ready for `focus`
 * — every screen that uses this can assume its own API calls will work
 * rather than re-checking connection state itself.
 */
export function MetaConnectPanel({ focus, children, onChange }) {
  const { message } = App.useApp();
  const [status, setStatus] = useState(null); // { configured, connection }
  const [assets, setAssets] = useState(null);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [selection, setSelection] = useState({});
  const [saving, setSaving] = useState(false);
  // "Change" on a ready connection reopens the picker.
  const [changing, setChanging] = useState(false);

  const load = useCallback(async () => {
    const data = await apiFetch("/api/meta/status");
    setStatus(data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleConnect() {
    try {
      const { url } = await apiFetch("/api/meta/authorize-url");
      sessionStorage.setItem(RETURN_TO_KEY, window.location.pathname);
      window.location.href = url;
    } catch (err) {
      message.error(err.message);
    }
  }

  async function loadAssets() {
    setLoadingAssets(true);
    try {
      const data = await apiFetch("/api/meta/assets");
      setAssets(data);
    } catch (err) {
      message.error(err.message);
    } finally {
      setLoadingAssets(false);
    }
  }

  useEffect(() => {
    if (status?.connection && !assetsReady(status.connection, focus)) {
      loadAssets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function handleSaveSelection() {
    setSaving(true);
    try {
      const { connection } = await apiFetch("/api/meta/assets/select", { method: "POST", body: selection });
      setStatus((s) => ({ ...s, connection }));
      setChanging(false);
      message.success("Saved");
      onChange?.();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    await apiFetch("/api/meta/disconnect", { method: "POST" });
    setAssets(null);
    setSelection({});
    load();
    onChange?.();
  }

  if (!status) return null;

  if (!status.configured) {
    return (
      <Card size="small">
        <p className="text-sm text-ink-muted m-0">
          Meta integration isn't set up on this platform yet — ask the platform admin to add a Facebook app.
        </p>
      </Card>
    );
  }

  if (!status.connection) {
    return (
      <Card size="small">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium m-0">Connect Facebook</p>
            <p className="text-sm text-ink-muted mt-1 mb-0">
              Grants access to your ad accounts, Page, and WhatsApp Business number.
            </p>
          </div>
          <Button type="primary" icon={<Facebook size={14} aria-hidden="true" />} onClick={handleConnect}>
            Connect
          </Button>
        </div>
      </Card>
    );
  }

  const ready = assetsReady(status.connection, focus) && !changing;
  const waba = focus === "whatsapp" && assets ? assets.wabas.find((w) => w.id === selection.wabaId) : null;
  const number = waba?.phoneNumbers.find((n) => n.id === selection.phoneNumberId);

  return (
    <div className="flex flex-col gap-4">
      <Card size="small">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-status-success" aria-hidden="true" />
            <p className="text-sm m-0">
              Connected as <span className="font-medium">{status.connection.facebookUserName}</span>
            </p>
          </div>
          <Button size="small" danger onClick={handleDisconnect}>
            Disconnect
          </Button>
        </div>
      </Card>

      {!ready ? (
        <Card size="small" title={focus === "whatsapp" ? "Select your WhatsApp number" : "Select ad account & Page"} loading={loadingAssets}>
          {focus === "whatsapp" && status.connection.platformNumber && (
            <Alert
              className="mb-3"
              type="warning"
              showIcon
              message="That's Oyklane's shared number, not your store's"
              description="Every store already sends order updates and sign-in codes from Oyklane's number, and Oyklane manages its templates. Pick your own WhatsApp number here to send your own messages and create your own templates."
            />
          )}
          {assets && (
            <div className="flex flex-col gap-3 max-w-sm">
              {focus === "ads" && (
                <>
                  <Select
                    placeholder="Ad account"
                    options={assets.adAccounts.map((a) => ({ value: a.id, label: a.name }))}
                    onChange={(v, opt) => setSelection((s) => ({ ...s, adAccountId: v, adAccountName: opt.label }))}
                  />
                  <Select
                    placeholder="Facebook Page"
                    options={assets.pages.map((p) => ({ value: p.id, label: p.name }))}
                    onChange={(v, opt) => {
                      // The Page's own Instagram account is the natural pair.
                      const ig = (assets.instagramAccounts || []).find((i) => i.pageId === v);
                      setSelection((s) => ({ ...s, pageId: v, pageName: opt.label, instagramAccountId: ig?.id || null, instagramUsername: ig?.username || null }));
                    }}
                  />
                  <Select
                    placeholder="Instagram account"
                    allowClear
                    value={selection.instagramAccountId || undefined}
                    options={(assets.instagramAccounts || [])
                      .filter((i) => !selection.adAccountId || i.pageId === selection.pageId || (i.adAccountIds || []).includes(selection.adAccountId))
                      .map((i) => ({ value: i.id, label: `@${i.username || i.id}${i.pageId && i.pageId === selection.pageId ? " · linked to this Page" : ""}` }))}
                    onChange={(v, opt) => setSelection((s) => ({ ...s, instagramAccountId: v || null, instagramUsername: v ? String(opt?.label || "").replace(/^@/, "").split(" ·")[0] : null }))}
                    notFoundContent="No Instagram account linked — link it to your Facebook Page (Page settings ▸ Linked accounts), then reconnect."
                  />
                  <p className="text-xs text-ink-muted m-0 -mt-1">Ads on Instagram run from this account. Without one, Instagram placements show your Facebook Page&apos;s name and picture.</p>
                </>
              )}
              {focus === "whatsapp" && (
                <>
                  <Select
                    placeholder="WhatsApp Business account"
                    value={selection.wabaId}
                    options={assets.wabas.map((w) => ({
                      value: w.id,
                      disabled: Boolean(w.platform),
                      label: w.platform ? (
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate">{w.name}</span>
                          <Tag className="!m-0">Oyklane&apos;s shared number</Tag>
                        </span>
                      ) : (
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate">
                            {w.name}
                            {w.businessName && w.businessName !== w.name ? <span className="text-ink-muted"> · {w.businessName}</span> : null}
                          </span>
                          <Tag className="!m-0" color={w.phoneNumbers.some((n) => n.ready) ? "green" : w.phoneNumbers.length ? "gold" : "default"}>
                            {w.phoneNumbers.length ? `${w.phoneNumbers.length} number${w.phoneNumbers.length === 1 ? "" : "s"}` : "No number"}
                          </Tag>
                        </span>
                      ),
                    }))}
                    onChange={(v) => {
                      const w = assets.wabas.find((x) => x.id === v);
                      const only = w?.phoneNumbers.length === 1 ? w.phoneNumbers[0] : null;
                      setSelection((s) => ({ ...s, wabaId: v, wabaName: w?.name, phoneNumberId: only?.id, phoneNumberLabel: only?.label }));
                    }}
                  />
                  {waba?.problem && (
                    <Alert
                      type="warning"
                      showIcon
                      message={waba.problem}
                      description={
                        <div className="flex flex-wrap gap-2 mt-2">
                          <WhatsappSignupButton onDone={loadAssets} />
                          <Button size="small" icon={<ExternalLink size={13} aria-hidden="true" />} href={waba.manageUrl} target="_blank" rel="noreferrer">
                            Open WhatsApp Manager
                          </Button>
                          {!waba.granted && (
                            <Button size="small" icon={<Facebook size={13} aria-hidden="true" />} onClick={handleConnect}>
                              Reconnect Facebook
                            </Button>
                          )}
                          <Button size="small" icon={<RefreshCw size={13} aria-hidden="true" />} onClick={loadAssets}>
                            Refresh
                          </Button>
                        </div>
                      }
                    />
                  )}
                  {waba && waba.phoneNumbers.length > 0 && (
                    <Select
                      placeholder="Phone number"
                      value={selection.phoneNumberId}
                      options={waba.phoneNumbers.map((n) => ({
                        value: n.id,
                        label: (
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate">{n.label}</span>
                            <Tag className="!m-0" color={n.ready ? "green" : n.action === "activate" ? "blue" : "gold"}>
                              {n.ready ? "Live" : n.action === "activate" ? "Needs activating" : "Needs attention"}
                            </Tag>
                          </span>
                        ),
                      }))}
                      onChange={(v) => {
                        const n = waba.phoneNumbers.find((x) => x.id === v);
                        setSelection((s) => ({ ...s, phoneNumberId: v, phoneNumberLabel: n?.label }));
                      }}
                    />
                  )}
                  {number && !number.ready && (
                    <Alert
                      type={number.action === "activate" ? "info" : "warning"}
                      showIcon
                      message={
                        number.action === "activate"
                          ? "Save, then click “Activate number” on the next screen. You'll need the number's 6-digit two-step verification PIN."
                          : number.problems[0]
                      }
                    />
                  )}
                </>
              )}
              <div className="flex gap-2">
                <Button type="primary" loading={saving} onClick={handleSaveSelection} disabled={focus === "whatsapp" && !selection.phoneNumberId}>
                  Save
                </Button>
                {changing && <Button onClick={() => setChanging(false)}>Cancel</Button>}
              </div>
              {focus === "whatsapp" && assets.wabas.length === 0 && (
                <Alert
                  type="info"
                  showIcon
                  message="No WhatsApp Business account found on this Facebook login"
                  description={
                    <div className="flex flex-col gap-2 mt-1">
                      <span>
                        Create one and verify your number in Meta&apos;s window — it takes about two minutes. If you already have one, reconnect
                        Facebook and tick it under WhatsApp accounts.
                      </span>
                      <div className="flex flex-wrap gap-2">
                        <WhatsappSignupButton onDone={loadAssets} />
                        <WhatsappSignupButton coexistence type="default" onDone={loadAssets} />
                        <Button icon={<Facebook size={13} aria-hidden="true" />} onClick={handleConnect}>
                          Reconnect Facebook
                        </Button>
                      </div>
                    </div>
                  }
                />
              )}
            </div>
          )}
        </Card>
      ) : (
        <>
          <Card size="small" className="!py-0">
            <div className="flex items-center gap-2 flex-wrap">
              {focus === "ads" && (
                <>
                  <Tag>{status.connection.adAccountName}</Tag>
                  <Tag>{status.connection.pageName}</Tag>
                  {status.connection.instagramUsername ? <Tag>@{status.connection.instagramUsername}</Tag> : <Tag color="default">No Instagram</Tag>}
                </>
              )}
              {focus === "whatsapp" && <Tag>{status.connection.phoneNumberLabel}</Tag>}
              <Button
                size="small"
                type="link"
                onClick={() => {
                  setChanging(true);
                  setSelection({});
                  loadAssets();
                }}
              >
                Change
              </Button>
            </div>
          </Card>
          {children}
        </>
      )}
    </div>
  );
}

function assetsReady(connection, focus) {
  if (focus === "ads") return Boolean(connection.adAccountId && connection.pageId);
  if (focus === "whatsapp") return Boolean(connection.phoneNumberId) && !connection.platformNumber;
  return false;
}

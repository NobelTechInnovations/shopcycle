"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Button, Select, App, Tag } from "antd";
import { Facebook, CheckCircle2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

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
export function MetaConnectPanel({ focus, children }) {
  const { message } = App.useApp();
  const [status, setStatus] = useState(null); // { configured, connection }
  const [assets, setAssets] = useState(null);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [selection, setSelection] = useState({});
  const [saving, setSaving] = useState(false);

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
      message.success("Saved");
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

  const ready = assetsReady(status.connection, focus);

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
                    onChange={(v, opt) => setSelection((s) => ({ ...s, pageId: v, pageName: opt.label }))}
                  />
                </>
              )}
              {focus === "whatsapp" && (
                <>
                  <Select
                    placeholder="WhatsApp Business Account"
                    options={assets.wabas.map((w) => ({ value: w.id, label: `${w.pageName}` }))}
                    onChange={(v) => setSelection((s) => ({ ...s, wabaId: v, phoneNumberId: undefined }))}
                  />
                  {selection.wabaId && (
                    <Select
                      placeholder="Phone number"
                      options={(assets.wabas.find((w) => w.id === selection.wabaId)?.phoneNumbers || []).map((n) => ({
                        value: n.id,
                        label: n.label,
                      }))}
                      onChange={(v, opt) => setSelection((s) => ({ ...s, phoneNumberId: v, phoneNumberLabel: opt.label }))}
                    />
                  )}
                </>
              )}
              <Button type="primary" loading={saving} onClick={handleSaveSelection}>
                Save
              </Button>
              {focus === "whatsapp" && assets.wabas.length === 0 && (
                <p className="text-xs text-ink-muted m-0">
                  No WhatsApp Business number found on this Facebook account. Set one up in Meta Business Manager
                  first, then reconnect.
                </p>
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
                </>
              )}
              {focus === "whatsapp" && <Tag>{status.connection.phoneNumberLabel}</Tag>}
              <Button size="small" type="link" onClick={() => setAssets(null) || loadAssets()}>
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
  if (focus === "whatsapp") return Boolean(connection.phoneNumberId);
  return false;
}

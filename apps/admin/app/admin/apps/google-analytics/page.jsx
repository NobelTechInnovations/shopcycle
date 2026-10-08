"use client";

import { useCallback, useEffect, useState } from "react";
import { App, Alert, Button, Card, Collapse, Form, Input, Skeleton, Tag } from "antd";
import { CheckCircle2, ExternalLink, Plus } from "lucide-react";
import { PageHeader } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { AppNotInstalled } from "@/components/apps/AppPanelParts";
import { AccountSignIn, AccountLine, SignInButton, needsAccount } from "@/components/accounts/AccountConnect";

const BASE = "/api/channels/google-analytics";

/**
 * Apps ▸ Google Analytics & Tag Manager: sign in with Google once, then
 * pick (or let Oyklane make) the GA4 property, the Tag Manager container,
 * and link Google Ads — no IDs to copy. Typing IDs in still works.
 */
export default function GoogleAnalyticsPage() {
  const { message } = App.useApp();
  const [data, setData] = useState(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch(BASE));
    } catch (err) {
      if (err.status === 404) setMissing(true);
      else message.error(err.message);
    }
  }, [message]);

  useEffect(() => {
    load();
  }, [load]);

  if (missing) return <AppNotInstalled appKey="google-analytics" title="Google Analytics" description="See who visits your store and what they buy — GA4, Tag Manager and Google Ads conversions." />;
  if (!data) return <Skeleton active paragraph={{ rows: 8 }} />;

  const signedIn = data.account?.connected;
  return (
    <div>
      <PageHeader title="Google Analytics & Tag Manager" backHref="/admin/apps" subtitle="Visitors, sales and ad conversions from your store — connected through your Google account, no codes to copy." />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6 min-w-0">
          {!signedIn ? (
            <AccountSignIn
              kind="google"
              account={data.account}
              access="analytics"
              title="Sign in with Google"
              description="Use the Google account that has (or will have) your Google Analytics. Oyklane finds your properties and containers — or makes them for your store."
            />
          ) : (
            <>
              <AnalyticsCard data={data} onChange={setData} />
              <TagManagerCard data={data} onChange={setData} />
              <AdsCard data={data} onChange={setData} />
            </>
          )}
        </div>
        <div className="flex flex-col gap-6 min-w-0">
          <ManualCard data={data} onChange={setData} />
          <Card size="small" title="What gets tracked">
            <ul className="m-0 pl-4 text-[13px] text-ink-muted flex flex-col gap-1">
              <li>Page views on every page</li>
              <li>Product views, add to cart, checkout</li>
              <li>Purchases with value (once per order)</li>
              <li>Searches</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Runs a call; a missing Google permission shows "Allow access" instead of an error. */
function useRun(onChange) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(null);
  const [needs, setNeeds] = useState(null);
  async function run(key, fn, ok) {
    setBusy(key);
    try {
      const result = await fn();
      if (result && onChange && result.settings) onChange(result);
      if (ok) message.success(ok);
      return result;
    } catch (err) {
      if (needsAccount(err)) setNeeds(err.details?.access || true);
      else message.error(err.message);
      return null;
    } finally {
      setBusy(null);
    }
  }
  return { busy, needs, run };
}

function Done({ label, value, sub }) {
  return (
    <div className="flex items-start gap-2">
      <CheckCircle2 size={16} className="text-status-success mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="m-0 text-[14px] text-ink">
          {label} <code className="text-[13px]">{value}</code>
        </p>
        {sub && <p className="m-0 text-[12.5px] text-ink-muted">{sub}</p>}
      </div>
    </div>
  );
}

function AllowAccess({ what }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="m-0 text-[13px] text-ink">Your Google sign-in didn&apos;t include {what}. Sign in again and tick every box.</p>
      <SignInButton kind="google" rerequest size="middle">
        Allow access
      </SignInButton>
    </div>
  );
}

function AnalyticsCard({ data, onChange }) {
  const { busy, needs, run } = useRun(onChange);
  const [accounts, setAccounts] = useState(null);
  const [streams, setStreams] = useState({});
  const [changing, setChanging] = useState(!data.settings.measurementId);

  useEffect(() => {
    if (!changing) return;
    run("load", () => apiFetch(`${BASE}/accounts`)).then((r) => r && setAccounts(r.accounts));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changing]);

  async function openProperty(p) {
    const r = await run(`s:${p.property}`, () => apiFetch(`${BASE}/streams?property=${encodeURIComponent(p.property)}`));
    if (r) setStreams((s) => ({ ...s, [p.property]: r.streams }));
  }

  async function use(p, stream) {
    const r = await run(`u:${p.property}`, () => apiFetch(`${BASE}/use`, { method: "POST", body: { property: p.property, propertyName: p.name, measurementId: stream.measurementId } }), "Google Analytics connected");
    if (r) setChanging(false);
  }

  async function newStream(p) {
    const r = await run(`n:${p.property}`, () => apiFetch(`${BASE}/streams`, { method: "POST", body: { property: p.property } }));
    if (r?.stream) await use(p, r.stream);
  }

  return (
    <Card title="Google Analytics (GA4)">
      <AccountLine kind="google" account={data.account} />
      {needs ? (
        <AllowAccess what="Google Analytics" />
      ) : !changing ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Done label="Measuring with" value={data.settings.measurementId} sub={data.settings.propertyName ? `Property: ${data.settings.propertyName}` : "Your store sends visits and sales here."} />
          <Button size="small" onClick={() => setChanging(true)}>
            Change
          </Button>
        </div>
      ) : !accounts ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-start gap-2">
          <p className="m-0 text-[13px] text-ink">This Google account has no Analytics account yet. Make one — Google shows its terms, then brings you back here.</p>
          <Button type="primary" loading={busy === "signup"} onClick={() => run("signup", () => apiFetch(`${BASE}/signup`, { method: "POST" })).then((r) => r?.url && (window.location.href = r.url))}>
            Create Google Analytics account
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {accounts.map((a) => (
            <div key={a.account} className="rounded-xl border border-app-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <span className="text-[13.5px] font-semibold text-ink">{a.name}</span>
                <Button size="small" icon={<Plus size={13} aria-hidden="true" />} loading={busy === `p:${a.account}`} onClick={() => run(`p:${a.account}`, () => apiFetch(`${BASE}/properties`, { method: "POST", body: { account: a.account } }), "Property made for your store and connected").then((r) => r && setChanging(false))}>
                  New property for this store
                </Button>
              </div>
              {a.properties.length === 0 && <p className="m-0 text-[12.5px] text-ink-muted">No GA4 properties here yet.</p>}
              <div className="flex flex-col gap-2">
                {a.properties.map((p) => (
                  <div key={p.property} className="bg-app-bg rounded-lg px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[13px] text-ink">{p.name}</span>
                      {!streams[p.property] && (
                        <Button size="small" loading={busy === `s:${p.property}`} onClick={() => openProperty(p)}>
                          Use this property
                        </Button>
                      )}
                    </div>
                    {streams[p.property] && (
                      <div className="mt-2 flex flex-col gap-1.5">
                        {streams[p.property].map((st) => (
                          <div key={st.measurementId} className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                            <span className="text-ink-muted">
                              {st.name} · <code>{st.measurementId}</code>
                              {st.uri ? ` · ${st.uri}` : ""}
                            </span>
                            <Button size="small" type="primary" loading={busy === `u:${p.property}`} onClick={() => use(p, st)}>
                              Use
                            </Button>
                          </div>
                        ))}
                        <Button size="small" className="self-start" icon={<Plus size={13} aria-hidden="true" />} loading={busy === `n:${p.property}`} onClick={() => newStream(p)}>
                          New web stream for this store
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {data.settings.measurementId && (
            <Button size="small" className="self-start" onClick={() => setChanging(false)}>
              Keep {data.settings.measurementId}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function TagManagerCard({ data, onChange }) {
  const { busy, needs, run } = useRun(onChange);
  const [accounts, setAccounts] = useState(null);
  const [open, setOpen] = useState(false);

  async function load() {
    setOpen(true);
    const r = await run("load", () => apiFetch(`${BASE}/gtm`));
    if (r) setAccounts(r.accounts);
  }

  return (
    <Card title="Google Tag Manager" extra={<Tag>Optional</Tag>}>
      <p className="mt-0 text-[13px] text-ink-muted">For your own tags (heatmaps, extra ad pixels) without editing the theme. Analytics and Ads above work without it.</p>
      {needs ? (
        <AllowAccess what="Tag Manager" />
      ) : data.settings.gtmId && !open ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Done label="Container" value={data.settings.gtmId} sub={data.settings.gtmName || "Loaded on every page"} />
          <Button size="small" onClick={load}>
            Change
          </Button>
        </div>
      ) : !open ? (
        <Button onClick={load}>Pick or make a container</Button>
      ) : !accounts ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : accounts.length === 0 ? (
        <p className="m-0 text-[13px] text-ink">
          No Tag Manager account on this Google account. Google only lets you make one on its site:{" "}
          <a href="https://tagmanager.google.com/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1">
            tagmanager.google.com <ExternalLink size={11} aria-hidden="true" />
          </a>{" "}
          — then press <button type="button" className="underline bg-transparent border-0 p-0 cursor-pointer" onClick={load}>look again</button>.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {accounts.map((a) => (
            <div key={a.account} className="rounded-xl border border-app-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <span className="text-[13.5px] font-semibold text-ink">{a.name}</span>
                <Button size="small" icon={<Plus size={13} aria-hidden="true" />} loading={busy === `c:${a.account}`} onClick={() => run(`c:${a.account}`, () => apiFetch(`${BASE}/gtm/create`, { method: "POST", body: { account: a.account } }), "Container made and added to your store").then((r) => r && setOpen(false))}>
                  New container for this store
                </Button>
              </div>
              {a.containers.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-[13px] py-1">
                  <span>
                    {c.name} · <code>{c.id}</code>
                  </span>
                  <Button size="small" type="primary" loading={busy === `g:${c.id}`} onClick={() => run(`g:${c.id}`, () => apiFetch(`${BASE}/gtm/use`, { method: "POST", body: c }), "Tag Manager added to your store").then((r) => r && setOpen(false))}>
                    Use
                  </Button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function AdsCard({ data, onChange }) {
  const { busy, needs, run } = useRun(onChange);
  const [customerId, setCustomerId] = useState(data.settings.adsCustomerId || "");
  return (
    <Card title="Google Ads">
      <p className="mt-0 text-[13px] text-ink-muted">Link your Ads account to Analytics so sales and audiences flow into your campaigns. Your customer ID is at the top right of Google Ads.</p>
      {needs ? (
        <AllowAccess what="Google Analytics" />
      ) : !data.settings.measurementId ? (
        <Alert type="info" showIcon message="Connect Google Analytics above first." />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Input className="!w-48" placeholder="123-456-7890" value={customerId} onChange={(e) => setCustomerId(e.target.value)} />
          <Button type="primary" loading={busy === "ads"} disabled={!customerId} onClick={() => run("ads", () => apiFetch(`${BASE}/ads`, { method: "POST", body: { customerId } }), "Google Ads linked to Analytics")}>
            {data.settings.adsCustomerId ? "Link again" : "Link Google Ads"}
          </Button>
          {data.settings.adsCustomerId && <Tag color="green">Linked · {data.settings.adsCustomerId.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3")}</Tag>}
        </div>
      )}
      <p className="m-0 mt-3 text-[12px] text-ink-muted">
        No Google Ads account?{" "}
        <a href="https://ads.google.com/" target="_blank" rel="noopener noreferrer">
          Create one on Google
        </a>
        , then link it here. For purchase conversions in Ads, add the conversion ID and label under “Enter IDs yourself”.
      </p>
    </Card>
  );
}

function ManualCard({ data, onChange }) {
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  async function save(values) {
    setSaving(true);
    try {
      onChange(await apiFetch(`${BASE}/manual`, { method: "PUT", body: values }));
      message.success("Saved");
    } catch (err) {
      const field = err.details && Object.values(err.details).flat().find((m) => typeof m === "string");
      message.error(field || err.message);
    } finally {
      setSaving(false);
    }
  }
  const s = data.settings;
  return (
    <Collapse
      items={[
        {
          key: "manual",
          label: "Enter IDs yourself",
          children: (
            <Form layout="vertical" requiredMark={false} initialValues={s} onFinish={save}>
              <Form.Item name="measurementId" label="GA4 Measurement ID">
                <Input placeholder="G-XXXXXXXXXX" />
              </Form.Item>
              <Form.Item name="gtmId" label="Tag Manager container">
                <Input placeholder="GTM-XXXXXXX" />
              </Form.Item>
              <Form.Item name="adsConversionId" label="Google Ads conversion ID">
                <Input placeholder="AW-123456789" />
              </Form.Item>
              <Form.Item name="adsConversionLabel" label="Purchase conversion label" extra="Google Ads ▸ Goals ▸ Conversions ▸ your purchase action ▸ Tag setup.">
                <Input placeholder="AbCdEfGhIjk" />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={saving}>
                Save
              </Button>
            </Form>
          ),
        },
      ]}
    />
  );
}

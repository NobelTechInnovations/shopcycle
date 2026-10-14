"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, Alert, Card, Tag, Button, App, Skeleton, Select, Popconfirm, Form, Input } from "antd";
import { Megaphone, LineChart, Images, Bot, ShieldCheck, FileClock, CheckCircle2, AlertTriangle } from "lucide-react";
import { PageHeader } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { AccountSignIn, AccountLine } from "@/components/accounts/AccountConnect";
import GCampaigns from "./GCampaigns";
import GInsights from "./GInsights";
import GMedia from "./GMedia";
import GWizard from "./GWizard";
import Automation from "../meta-ads/Automation";

const TABS = ["campaigns", "insights", "media", "automation", "setup"];

const fmtId = (id) => String(id).replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");

/** A Google Ads account made from Oyklane, under Oyklane's manager account
 * (like Shopify does) — the seller accepts Google's emailed invite and adds
 * billing, then picks it above. */
function CreateAccount({ status, google, storeName, onDone }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState(status.createdAccount);
  if (!status.canCreate) {
    return (
      <Alert
        type="info"
        showIcon
        message="Create a Google Ads account"
        description={
          <span>
            Make one free at <a href="https://ads.google.com" target="_blank" rel="noreferrer">ads.google.com</a> with this Google login and add a payment method, then click Refresh. If your
            account belongs to someone else, ask them to add your email (Admin ▸ Access and security).
          </span>
        }
      />
    );
  }
  if (made) {
    return (
      <Alert
        type="success"
        showIcon
        message={`Google Ads account ${fmtId(made.customerId)} is ready for you`}
        description={
          <ol className="m-0 pl-4 text-sm">
            <li>Open the invitation Google emailed to <b>{made.email}</b> and accept it.</li>
            <li>In Google Ads ▸ Billing, add a payment method — Google charges your ad spend there, never Oyklane.</li>
            <li>Come back and click Refresh, then choose the account.</li>
          </ol>
        }
        action={<Button size="small" onClick={onDone}>Refresh</Button>}
      />
    );
  }
  return (
    <Card size="small" title="No Google Ads account? Create one here">
      <p className="text-sm text-ink-muted mt-0">Oyklane makes the account and invites you as its admin — it&apos;s yours, billed by Google to your own payment method.</p>
      <Form
        layout="vertical"
        requiredMark={false}
        initialValues={{ name: storeName, email: google?.email || "" }}
        onFinish={async (values) => {
          setBusy(true);
          try {
            setMade(await apiFetch("/api/google-ads/accounts/create", { method: "POST", body: values }));
            message.success("Account created — check your email for Google's invitation");
          } catch (err) {
            message.error(err.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="grid sm:grid-cols-2 gap-x-3">
          <Form.Item name="name" label="Account name" rules={[{ required: true, min: 2, message: "Enter a name" }]}>
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="email" label="Your email (Google sends the invitation here)" rules={[{ required: true, type: "email", message: "Enter a valid email" }]}>
            <Input />
          </Form.Item>
        </div>
        <Button type="primary" htmlType="submit" loading={busy}>
          Create my Google Ads account
        </Button>
        <p className="text-xs text-ink-muted mt-2 mb-0">Currency and time zone follow your store&apos;s settings — Google doesn&apos;t let you change them later.</p>
      </Form>
    </Card>
  );
}

/** Pick which Google Ads account this store manages. */
function ChooseAccount({ onChosen, status, google, storeName }) {
  const { message } = App.useApp();
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [pick, setPick] = useState(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    setList(null);
    apiFetch("/api/google-ads/accounts")
      .then((d) => setList(d.accounts))
      .catch((err) => setError(err.message));
  }, [n]);
  if (error) return <Alert type="error" showIcon message="Couldn't list your Google Ads accounts" description={error} />;
  if (!list) return <Card><Skeleton active /></Card>;
  const usable = list.filter((a) => !a.error);
  const blocked = list.filter((a) => a.error);
  return (
    <Card title="Choose your Google Ads account" extra={<Button size="small" onClick={() => setN((x) => x + 1)}>Refresh</Button>}>
      {blocked.length > 0 && (
        <Alert
          className="!mb-3"
          type="warning"
          showIcon
          message={blocked.length === 1 ? `Account ${fmtId(blocked[0].customerId)} can't be used yet` : `${blocked.length} accounts can't be used yet`}
          description={
            <ul className="m-0 pl-4 text-sm">
              {blocked.map((a) => (
                <li key={a.customerId}>
                  <b>{fmtId(a.customerId)}</b>: {a.error}
                </li>
              ))}
            </ul>
          }
        />
      )}
      {!usable.length ? (
        <CreateAccount status={status} google={google} storeName={storeName} onDone={() => setN((x) => x + 1)} />
      ) : (
        <div className="flex flex-col gap-3 max-w-md">
          <Select
            placeholder="Google Ads account"
            value={pick?.customerId}
            onChange={(v) => setPick(list.find((a) => a.customerId === v))}
            options={usable.map((a) => ({ value: a.customerId, label: `${a.name} · ${fmtId(a.customerId)}${a.via ? ` · via ${a.via}` : ""}${a.test ? " · TEST" : ""}` }))}
          />
          <Button
            type="primary"
            disabled={!pick}
            onClick={async () => {
              try {
                await apiFetch("/api/google-ads/accounts/select", { method: "POST", body: { customerId: pick.customerId, loginCustomerId: pick.loginCustomerId } });
                onChosen();
              } catch (err) {
                message.error(err.message);
              }
            }}
          >
            Use this account
          </Button>
        </div>
      )}
    </Card>
  );
}

function Setup({ caps, reload, canEdit }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  if (!caps) return <Skeleton active />;
  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      <Card size="small" title="Account check">
        {caps.problems.length ? (
          <ul className="list-none p-0 m-0 flex flex-col gap-2">
            {caps.problems.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <AlertTriangle size={16} className="text-status-warning shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  {p.text}
                  {p.fix && <span className="block text-xs text-ink-muted">{p.fix}</span>}
                  {p.action === "setup_conversions" && canEdit && (
                    <Button
                      size="small"
                      type="primary"
                      className="mt-1"
                      loading={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const r = await apiFetch("/api/google-ads/conversions/setup", { method: "POST" });
                          message.success(`Purchase tracking on (${r.tagId}) — your store sends each order to Google`);
                          reload();
                        } catch (err) {
                          message.error(err.message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Set up purchase tracking
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm m-0 flex items-center gap-2"><CheckCircle2 size={16} className="text-status-success" aria-hidden="true" /> Everything&apos;s ready.</p>
        )}
      </Card>
      <Card size="small" title="Account">
        <ul className="text-sm m-0 pl-4">
          <li>{caps.account.name} ({caps.account.id.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3")}){caps.account.test ? " — test account" : ""}</li>
          <li>{caps.account.currency} · {caps.account.timeZone}</li>
          <li>Purchase tracking: {caps.purchaseTracking ? "on" : "off"}</li>
          <li>Merchant Center: {caps.merchants.length ? caps.merchants.join(", ") : "not linked"}</li>
          <li>Conversions: {caps.conversions.map((c) => c.name).join(", ") || "none"}</li>
        </ul>
        <p className="text-xs text-ink-muted mt-2 mb-0">Google bills your ad spend to this account&apos;s payment method — never through Oyklane.</p>
      </Card>
    </div>
  );
}

function Drafts({ onOpen, refreshKey }) {
  const [drafts, setDrafts] = useState([]);
  const load = useCallback(() => apiFetch("/api/google-ads/drafts").then((d) => setDrafts(d.drafts)).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load, refreshKey]);
  if (!drafts.length) return null;
  return (
    <Card size="small" title={<span className="flex items-center gap-1.5"><FileClock size={14} aria-hidden="true" /> Unfinished campaigns</span>}>
      {drafts.map((d) => (
        <div key={d.id} className="flex items-center justify-between gap-2 text-sm py-0.5">
          <span className="truncate">{d.name} {d.status === "failed" && <Tag color="red">Not created</Tag>}{d.error && <span className="block text-xs text-status-danger">{d.error}</span>}</span>
          <span className="flex gap-1 shrink-0">
            <Button size="small" onClick={() => onOpen(d.id)}>Continue</Button>
            <Popconfirm title="Delete this draft?" onConfirm={() => apiFetch(`/api/google-ads/drafts/${d.id}`, { method: "DELETE" }).then(load)}>
              <Button size="small" type="text" danger>Delete</Button>
            </Popconfirm>
          </span>
        </div>
      ))}
    </Card>
  );
}

function Suite({ storeInfo }) {
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState(TABS.includes(params.get("tab")) ? params.get("tab") : "campaigns");
  const [range, setRange] = useState({ preset: "last_7d" });
  const [caps, setCaps] = useState(null);
  const [capsError, setCapsError] = useState(null);
  const [wizard, setWizard] = useState({ open: false });
  const [refreshKey, setRefreshKey] = useState(0);
  const canEdit = storeInfo.role !== "staff";
  const loadCaps = useCallback(() => apiFetch("/api/google-ads/capabilities").then(setCaps).catch((err) => setCapsError(err.message)), []);
  useEffect(() => {
    loadCaps();
  }, [loadCaps]);
  const label = (Icon, text) => (
    <span className="inline-flex items-center gap-1.5">
      <Icon size={14} aria-hidden="true" />
      {text}
    </span>
  );
  return (
    <div className="flex flex-col gap-3">
      {capsError && <Alert type="error" showIcon message="Couldn't read your Google Ads account" description={capsError} />}
      {caps?.problems?.length > 0 && tab !== "setup" && <Alert type="warning" showIcon message={`${caps.problems.length} thing${caps.problems.length === 1 ? "" : "s"} to fix in your Google Ads account`} action={<Button size="small" onClick={() => setTab("setup")}>See</Button>} />}
      <Tabs
        activeKey={tab}
        onChange={(k) => {
          setTab(k);
          router.replace(`/admin/apps/google-ads?tab=${k}`, { scroll: false });
        }}
        destroyOnHidden
        items={[
          { key: "campaigns", label: label(Megaphone, "Campaigns"), children: <div className="flex flex-col gap-3"><Drafts refreshKey={refreshKey} onOpen={(id) => setWizard({ open: true, draftId: id })} /><GCampaigns key={refreshKey} canEdit={canEdit} range={range} setRange={setRange} onCreate={() => setWizard({ open: true })} /></div> },
          { key: "insights", label: label(LineChart, "Insights"), children: <GInsights range={range} setRange={setRange} canEdit={canEdit} /> },
          { key: "media", label: label(Images, "Images"), children: <GMedia /> },
          { key: "automation", label: label(Bot, "Automation & activity"), children: <Automation canEdit={canEdit} base="/api/google-ads" unit="campaigns" /> },
          { key: "setup", label: label(ShieldCheck, "Account check"), children: <Setup caps={caps} reload={loadCaps} canEdit={canEdit} /> },
        ]}
      />
      {caps && (
        <GWizard
          open={wizard.open}
          draftId={wizard.draftId}
          caps={caps}
          storeUrl={storeInfo.store?.publicUrl}
          storeName={storeInfo.store?.name}
          onClose={() => {
            setWizard({ open: false });
            setRefreshKey((k) => k + 1);
          }}
          onPublished={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
}

export default function GoogleAdsPage() {
  const { message } = App.useApp();
  const [accounts, setAccounts] = useState(null);
  const [status, setStatus] = useState(null);
  const [storeInfo, setStoreInfo] = useState(null);
  const load = useCallback(async () => {
    try {
      const [a, s, st] = await Promise.all([apiFetch("/api/accounts"), apiFetch("/api/google-ads/status"), apiFetch("/api/store")]);
      setAccounts(a);
      setStatus(s);
      setStoreInfo(st);
    } catch (err) {
      message.error(err.message);
    }
  }, [message]);
  useEffect(() => {
    load();
  }, [load]);

  const google = accounts?.google;
  const ready = google?.connected && google.access?.ads !== false;
  return (
    <div>
      <PageHeader
        title="Google Ads"
        subtitle="Search, Shopping, Performance Max and Display campaigns — set up, results and suggestions in one place."
        actions={
          <>
            <Link href="/admin/apps/meta-ads"><Button>Meta Ads</Button></Link>
            <Link href="/admin/apps/google-shopping"><Button>Merchant Center</Button></Link>
          </>
        }
      />
      {!accounts || !status || !storeInfo ? (
        <Skeleton active />
      ) : !status.configured ? (
        <Alert type="info" showIcon message="Google Ads is being set up on Oyklane" description="It'll be available here as soon as Oyklane's Google Ads access is approved — nothing for you to do." />
      ) : !ready ? (
        <AccountSignIn kind="google" account={google} access="ads" title="Sign in with Google" description="Use the Google account that has your Google Ads account. Oyklane manages campaigns and reads results — you can remove access any time." returnTo="/admin/apps/google-ads" />
      ) : !status.account ? (
        <div className="flex flex-col gap-3">
          <AccountLine kind="google" account={google} />
          <ChooseAccount onChosen={load} status={status} google={google} storeName={storeInfo.store?.name} />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Card size="small" className="!py-0">
            <div className="flex flex-wrap items-center gap-2">
              <Tag>{status.account.name} · {status.account.customerId.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3")}</Tag>
              {status.account.purchaseTracking ? <Tag color="green">Purchase tracking on</Tag> : <Tag color="gold">No purchase tracking</Tag>}
              <Popconfirm title="Use a different Google Ads account?" onConfirm={() => apiFetch("/api/google-ads/account", { method: "DELETE" }).then(load)}>
                <Button size="small" type="link">Change</Button>
              </Popconfirm>
            </div>
          </Card>
          <Suspense fallback={null}>
            <Suite storeInfo={storeInfo} />
          </Suspense>
        </div>
      )}
    </div>
  );
}

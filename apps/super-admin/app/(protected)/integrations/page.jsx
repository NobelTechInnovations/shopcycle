"use client";

import { useCallback, useEffect, useState } from "react";
import { App, Button, Form, Input, Select, Skeleton, Tag } from "antd";
import { CheckCircle2, Copy, XCircle } from "lucide-react";
import { PageHeader } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

function Section({ title, note, children }) {
  return (
    <section className="bg-app-surface border border-app-border rounded-[14px] shadow-card p-5">
      <h2 className="text-[15px] font-semibold text-ink m-0">{title}</h2>
      {note && <p className="text-[13px] text-ink-muted mt-1 mb-0">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Status({ ok, yes = "Set", no = "Not set" }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-[13px] text-status-success">
      <CheckCircle2 size={14} aria-hidden="true" /> {yes}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[13px] text-status-danger">
      <XCircle size={14} aria-hidden="true" /> {no}
    </span>
  );
}

function CopyLine({ label, value }) {
  const { message } = App.useApp();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-app-border last:border-0">
      <span className="text-[13px] text-ink-muted">{label}</span>
      <span className="inline-flex items-center gap-1.5 font-mono text-[12.5px] text-ink break-all">
        {value}
        <button
          type="button"
          aria-label={`Copy ${label}`}
          className="bg-transparent border-0 p-0 cursor-pointer text-ink-muted hover:text-ink"
          onClick={() => navigator.clipboard.writeText(value).then(() => message.success("Copied"))}
        >
          <Copy size={13} aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}

/**
 * Oyklane's own Google and Meta setup: what's on the server, the exact
 * redirect URIs to register, a live check of the Places key, and Merchant
 * API's one-time registration (without it no store's Google & YouTube app
 * can reach Merchant Center).
 */
export default function IntegrationsPage() {
  const { message } = App.useApp();
  const [data, setData] = useState(null);
  const [places, setPlaces] = useState(null);
  const [busy, setBusy] = useState(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    try {
      setData(await apiFetch("/api/super-admin/integrations"));
    } catch (err) {
      message.error(err.message);
    }
  }, [message]);

  useEffect(() => {
    load();
  }, [load]);

  async function testPlaces() {
    setBusy("places");
    try {
      setPlaces(await apiFetch("/api/super-admin/integrations/places/test", { method: "POST" }));
    } catch (err) {
      setPlaces({ ok: false, error: err.message });
    } finally {
      setBusy(null);
    }
  }

  async function register(values) {
    setBusy("register");
    try {
      await apiFetch("/api/super-admin/integrations/google-merchant/register", { method: "POST", body: values });
      message.success("Registered — every store's Google & YouTube app can reach Merchant Center now");
      load();
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  if (!data) return <Skeleton active paragraph={{ rows: 10 }} />;
  const metaWrong = data.meta.redirectUri !== data.meta.expectedRedirectUri;

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <PageHeader title="Integrations" subtitle="Oyklane's own Google and Meta apps — what sellers sign in with. Sellers never see these keys." />

      <Section title="Google" note="Google Cloud ▸ APIs & Services ▸ Credentials ▸ your OAuth client. Add the redirect URI exactly as shown.">
        <div className="flex items-center justify-between py-2 border-b border-app-border">
          <span className="text-[13px] text-ink-muted">GOOGLE_CLIENT_ID / SECRET</span>
          <Status ok={data.google.configured} />
        </div>
        <CopyLine label="Authorized redirect URI" value={data.google.redirectUri} />
        <div className="py-2 text-[12.5px] text-ink-muted">
          Enable: My Business Account Management API, My Business Business Information API, Google My Business API (reviews), Merchant API, Google Analytics Admin API. Scopes asked for:{" "}
          {data.google.scopes.map((s) => (
            <Tag key={s} className="!mr-1 !mb-1 font-mono text-[11px]">
              {s.replace("https://www.googleapis.com/auth/", "")}
            </Tag>
          ))}
        </div>
      </Section>

      <Section title="Google Maps search (Places)" note="Used to find a business by name for Google Reviews. The key must be allowed to use “Places API (New)”.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[13px] text-ink-muted">
            GOOGLE_PLACES_API_KEY <Status ok={data.places.configured} />
          </span>
          <Button loading={busy === "places"} onClick={testPlaces} disabled={!data.places.configured}>
            Test the key
          </Button>
        </div>
        {places?.ok && places.reviewsMissing && (
          <p className="m-0 mt-3 text-[13px] text-status-danger">
            Ratings work, but Google sends no review texts — for any place. The key&apos;s Google Cloud project has no billing account: Google Cloud ▸ Billing ▸ link a
            billing account to this project (review texts are a billed field; Google&apos;s monthly free usage covers small volumes). Then press “Refresh now” on a
            store&apos;s Google Reviews page.
          </p>
        )}
        {places && !(places.ok && places.reviewsMissing) && (
          <p className={`m-0 mt-3 text-[13px] ${places.ok ? "text-status-success" : "text-status-danger"}`}>
            {places.ok
              ? `Works — Google answered with ${places.found} place(s), ${places.reviews} review text(s).`
              : `${places.error} — In Google Cloud ▸ APIs & Services: enable “Places API (New)”, then ▸ Credentials ▸ this key ▸ API restrictions ▸ add “Places API (New)” (or don't restrict), and Application restrictions ▸ None (the API calls from its server).`}
          </p>
        )}
      </Section>

      <Section
        title="Google Merchant API — one-time registration"
        note="Merchant API only answers apps whose Google Cloud project is registered with a Merchant Center account. Register once with Oyklane's own account; every seller's Google & YouTube app then works through their own sign-in."
      >
        {data.merchant ? (
          <p className="m-0 text-[13px] text-ink">
            <Status ok yes="Registered" /> with Merchant Center <b>{data.merchant.merchantId}</b> on {new Date(data.merchant.at).toLocaleDateString("en-IN", { dateStyle: "medium" })}.
          </p>
        ) : null}
        {data.googleStores.length === 0 ? (
          <p className="m-0 mt-2 text-[13px] text-ink-muted">
            First sign in with Google on one of your own stores (Settings ▸ Connected accounts), with the Google account that has Oyklane&apos;s Merchant Center (create one free at merchants.google.com). It shows up here.
          </p>
        ) : (
          <Form form={form} layout="vertical" requiredMark={false} onFinish={register} className="mt-3" initialValues={{ storeId: data.googleStores[0].storeId }}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Form.Item name="storeId" label="Google sign-in of store" rules={[{ required: true }]}>
                <Select options={data.googleStores.map((s) => ({ value: s.storeId, label: `${s.store} · ${s.email || s.handle}` }))} />
              </Form.Item>
              <Form.Item name="merchantId" label="Oyklane's Merchant Center ID" rules={[{ required: true, message: "Enter the ID" }]}>
                <Input placeholder="e.g. 5123456789" inputMode="numeric" />
              </Form.Item>
              <Form.Item name="developerEmail" label="Developer email (optional)">
                <Input placeholder="dev@oyklane.com" />
              </Form.Item>
            </div>
            <Button type="primary" htmlType="submit" loading={busy === "register"}>
              {data.merchant ? "Register again" : "Register Oyklane"}
            </Button>
          </Form>
        )}
      </Section>

      <Section title="Meta (Facebook, Instagram)" note="developers.facebook.com ▸ your app ▸ Facebook Login for Business ▸ Settings ▸ Valid OAuth Redirect URIs.">
        <div className="flex items-center justify-between py-2 border-b border-app-border">
          <span className="text-[13px] text-ink-muted">META_APP_ID / SECRET</span>
          <Status ok={data.meta.configured} />
        </div>
        <div className="flex items-center justify-between py-2 border-b border-app-border">
          <span className="text-[13px] text-ink-muted">META_LOGIN_CONFIG_ID (Facebook Login for Business)</span>
          <Status ok={Boolean(data.meta.configId)} yes={data.meta.configId || "Set"} no="Not set — permissions asked by name" />
        </div>
        <p className="m-0 py-2 text-[12.5px] text-ink-muted border-b border-app-border">
          A Business-type Meta app (like “Oyklane - Marketing”) signs people in with a configuration: Facebook Login for Business ▸ Configurations ▸ Create ▸
          token type <b>User access token</b> ▸ tick the permissions your apps need (only ones the app&apos;s use cases include) ▸ copy its ID into{" "}
          <code>META_LOGIN_CONFIG_ID</code>. Without it, Meta shows “Feature unavailable” when the login asks for a permission the app doesn&apos;t have.
        </p>
        <CopyLine label="Valid OAuth redirect URI" value={data.meta.expectedRedirectUri} />
        {metaWrong && (
          <p className="m-0 mt-2 text-[12.5px] text-status-danger">
            META_OAUTH_REDIRECT_URI on the API is <code>{data.meta.redirectUri}</code>. It still works (the API forwards to the admin), but set it to the address above —
            or delete it — and list that address in the Meta app.
          </p>
        )}
        <div className="py-2 text-[12.5px] text-ink-muted">
          {data.meta.configId ? "Without a configuration these would be asked for" : "Permissions asked for"} (each needs Advanced Access through App Review for sellers outside your app&apos;s roles):{" "}
          {data.meta.scopes.map((s) => (
            <Tag key={s} className="!mr-1 !mb-1 font-mono text-[11px]">
              {s}
            </Tag>
          ))}
        </div>
        <div className="flex items-center justify-between py-2 border-t border-app-border">
          <span className="text-[13px] text-ink-muted">INSTAGRAM_APP_ID / SECRET (optional second way in)</span>
          <Status ok={data.instagram.configured} />
        </div>
      </Section>
    </div>
  );
}

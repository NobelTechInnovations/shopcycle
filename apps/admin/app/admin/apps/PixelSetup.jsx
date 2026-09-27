"use client";

import { useEffect, useState } from "react";
import { Button, Form, Input, Radio, Skeleton, Alert } from "antd";
import { CheckCircle2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

const EVENTS = ["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase", "Search"];

function FacebookMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#fff" d="M13.5 21v-8h2.7l.4-3.1h-3.1V8c0-.9.25-1.5 1.55-1.5H17V3.7c-.28-.04-1.24-.12-2.35-.12-2.33 0-3.92 1.42-3.92 4.03V10H8v3.1h2.73V21z" />
    </svg>
  );
}

/**
 * The Facebook Pixel install form: "Continue with Facebook" to pick one of
 * the seller's pixels (when Facebook login is set up on the platform), or
 * paste the Pixel ID. Fills the form's `pixelId` field either way.
 */
export function PixelSetup({ form }) {
  const [info, setInfo] = useState(null);
  const [pixels, setPixels] = useState(null);
  const [error, setError] = useState(null);
  const pixelId = Form.useWatch("pixelId", form);

  useEffect(() => {
    apiFetch("/api/apps/facebook-pixel/connect")
      .then((d) => {
        setInfo(d);
        if (d.connectedAs) {
          apiFetch("/api/apps/facebook-pixel/pixels")
            .then((r) => setPixels(r.pixels))
            .catch((err) => setError(err.message));
        }
      })
      .catch(() => setInfo({ configured: false }));
  }, []);

  function connect() {
    sessionStorage.setItem("meta-connect-return-to", "/admin/apps?setup=facebook-pixel");
    sessionStorage.setItem("meta-connect-endpoint", "/api/apps/facebook-pixel/connect");
    window.location.href = info.authorizeUrl;
  }

  return (
    <div className="flex flex-col gap-4">
      {!info ? (
        <Skeleton active paragraph={{ rows: 1 }} title={false} />
      ) : info.configured ? (
        info.connectedAs ? (
          <div className="flex flex-col gap-2">
            <p className="m-0 flex items-center gap-1.5 text-[13px] text-ink">
              <CheckCircle2 size={15} className="text-status-success" aria-hidden="true" /> Connected to Facebook as <b>{info.connectedAs}</b>
            </p>
            {error && <Alert type="warning" showIcon message={error} />}
            {pixels === null && !error && <Skeleton active paragraph={{ rows: 2 }} title={false} />}
            {pixels?.length === 0 && (
              <Alert type="info" showIcon message="No pixels found on your ad accounts" description="Create one in Meta Events Manager (Connect data sources ▸ Web), then come back — or paste its ID below." />
            )}
            {pixels?.length > 0 && (
              <Radio.Group value={pixelId} onChange={(e) => form.setFieldValue("pixelId", e.target.value)} className="flex flex-col gap-1.5">
                {pixels.map((p) => (
                  <Radio key={p.id} value={p.id} className="!items-start">
                    <span className="text-[13px] text-ink">{p.name}</span>
                    <span className="block text-xs text-ink-muted">
                      {p.id} · {p.adAccount}
                      {p.lastFired ? ` · last active ${new Date(p.lastFired).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : " · no activity yet"}
                    </span>
                  </Radio>
                ))}
              </Radio.Group>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Button type="primary" size="large" onClick={connect} className="!bg-[#1877F2] !border-[#1877F2] self-start" icon={<FacebookMark />}>
              Continue with Facebook
            </Button>
            <p className="m-0 text-xs text-ink-muted">Pick your pixel from a list — no ids to copy. We only ask to read your ad accounts' pixels.</p>
          </div>
        )
      ) : null}

      <Form.Item
        name="pixelId"
        label={info?.configured ? "Or enter the Pixel ID" : "Pixel ID"}
        extra="In Meta Events Manager: Data sources ▸ your pixel ▸ Settings. It's a 15–16 digit number."
        rules={[
          { required: true, message: "Choose a pixel or enter its ID" },
          { pattern: /^\d{6,20}$/, message: "Pixel IDs are numbers only" },
        ]}
        className="!mb-0"
      >
        <Input placeholder="123456789012345" inputMode="numeric" />
      </Form.Item>

      <div className="rounded-lg bg-app-bg px-3 py-2.5">
        <p className="m-0 text-xs font-medium text-ink">Tracked on every page, checkout included</p>
        <p className="m-0 mt-1 text-xs text-ink-muted">{EVENTS.join(" · ")} — with product ids and order value, so Meta can optimise your ads for sales.</p>
      </div>
    </div>
  );
}

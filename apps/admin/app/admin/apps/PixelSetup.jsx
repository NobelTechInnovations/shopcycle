"use client";

import { useEffect, useState } from "react";
import { Form, Input, Radio, Skeleton, Alert } from "antd";
import { apiFetch } from "@/lib/api";
import { SignInButton, AccountLine } from "@/components/accounts/AccountConnect";

const EVENTS = ["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase", "Search"];

/**
 * The Facebook Pixel install form: pick one of the pixels on the store's
 * Facebook login (Settings ▸ Connected accounts — the one login every Meta
 * app shares; "Continue with Facebook" here if it isn't there yet), or type
 * the Pixel ID. Fills the form's `pixelId` field either way.
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

  return (
    <div className="flex flex-col gap-4">
      {!info ? (
        <Skeleton active paragraph={{ rows: 1 }} title={false} />
      ) : info.configured ? (
        info.connectedAs ? (
          <div className="flex flex-col gap-2">
            <AccountLine kind="facebook" account={info.account} />
            {error && <Alert type="warning" showIcon message={error} />}
            {pixels === null && !error && <Skeleton active paragraph={{ rows: 2 }} title={false} />}
            {pixels?.length === 0 && (
              <Alert type="info" showIcon message="No pixels found on your ad accounts" description="Create one in Meta Events Manager (Connect data sources ▸ Web), then come back — or type its ID below." />
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
            <SignInButton kind="facebook" returnTo="/admin/apps/details/facebook-pixel" className="self-start" />
            <p className="m-0 text-xs text-ink-muted">Pick your pixel from a list — no ids to copy. One Facebook sign-in for your store, shared by every Meta app.</p>
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

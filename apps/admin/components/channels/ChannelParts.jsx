"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { App, Button, Card, Collapse, Input, Tag } from "antd";
import { Copy, CheckCircle2, AlertTriangle, Lightbulb, Link2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

/** How the store's products look to the channel: listed, held back, tips. */
export function ProductsHealth({ products, channelName }) {
  const { problems, suggestions } = products;
  return (
    <Card size="small" title="Your products">
      <div className="flex flex-wrap gap-6 mb-3">
        <div>
          <p className="m-0 text-[24px] font-semibold text-ink leading-none">{products.listed}</p>
          <p className="m-0 mt-1 text-[12.5px] text-ink-muted">of {products.total} active products sent to {channelName}</p>
        </div>
        <div>
          <p className="m-0 text-[24px] font-semibold text-ink leading-none">{products.items}</p>
          <p className="m-0 mt-1 text-[12.5px] text-ink-muted">listings (one per size / colour)</p>
        </div>
      </div>
      {problems.length === 0 && suggestions.length === 0 ? (
        <p className="m-0 text-[13px] text-[#15803D] flex items-center gap-1.5">
          <CheckCircle2 size={14} aria-hidden="true" /> Every active product is ready.
        </p>
      ) : (
        <Collapse
          size="small"
          items={[
            ...(problems.length
              ? [
                  {
                    key: "problems",
                    label: (
                      <span className="flex items-center gap-1.5 text-[13px]">
                        <AlertTriangle size={13} className="text-[#B54708]" aria-hidden="true" /> {problems.length} not sent
                      </span>
                    ),
                    children: <IssueList list={problems} />,
                  },
                ]
              : []),
            ...(suggestions.length
              ? [
                  {
                    key: "tips",
                    label: (
                      <span className="flex items-center gap-1.5 text-[13px]">
                        <Lightbulb size={13} className="text-accent" aria-hidden="true" /> {suggestions.length} could do better
                      </span>
                    ),
                    children: <IssueList list={suggestions} />,
                  },
                ]
              : []),
          ]}
        />
      )}
    </Card>
  );
}

function IssueList({ list }) {
  return (
    <ul className="list-none m-0 p-0 flex flex-col">
      {list.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 border-t border-app-border first:border-t-0">
          <Link href={`/admin/products/${p.id}`} className="text-[13px] text-ink hover:underline truncate max-w-[60%]">
            {p.title}
          </Link>
          <span className="flex flex-wrap gap-1">
            {p.reasons.map((r) => (
              <Tag key={r} className="m-0 text-[11.5px]">
                {r}
              </Tag>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function CopyField({ value, label = "Copy" }) {
  const { message } = App.useApp();
  return (
    <div className="flex gap-2">
      <Input readOnly value={value} onFocus={(e) => e.target.select()} className="font-mono text-[12px]" />
      <Button
        icon={<Copy size={14} aria-hidden="true" />}
        onClick={() => {
          navigator.clipboard?.writeText(value).then(() => message.success("Copied"));
        }}
      >
        {label}
      </Button>
    </div>
  );
}

/** The feed URL and the steps to add it by hand. */
export function ManualFeedCard({ url, title, steps, open = false }) {
  return (
    <Card size="small" title={<span className="flex items-center gap-2"><Link2 size={14} className="text-ink-muted" aria-hidden="true" /> {title}</span>}>
      <p className="m-0 mb-2 text-[12.5px] text-ink-muted">Your product feed — always up to date, private to whoever has the link.</p>
      <CopyField value={url} />
      <Collapse
        ghost
        size="small"
        className="mt-2 -mx-3"
        defaultActiveKey={open ? ["steps"] : []}
        items={[
          {
            key: "steps",
            label: <span className="text-[13px]">How to add it yourself</span>,
            children: (
              <ol className="m-0 pl-5 text-[13px] text-ink flex flex-col gap-1">
                {steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            ),
          },
        ]}
      />
    </Card>
  );
}

/** A domain verification code (Google Merchant Center / Meta), added to
 * every page of the store as a <meta> tag. */
export function VerificationCard({ which, title, help }) {
  const { message } = App.useApp();
  const [value, setValue] = useState(null);
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch("/api/channels/verification")
      .then((d) => {
        setValue(d.verification?.[which] || "");
        setSaved(d.verification?.[which] || "");
      })
      .catch(() => setValue(""));
  }, [which]);

  async function save() {
    setBusy(true);
    try {
      const d = await apiFetch("/api/channels/verification", { method: "PUT", body: { [which]: value } });
      setValue(d.verification[which] || "");
      setSaved(d.verification[which] || "");
      message.success(d.verification[which] ? "Added to your store — now press Verify on the other site." : "Removed");
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (value == null) return null;
  return (
    <Card size="small" title={title}>
      <p className="m-0 mb-2 text-[12.5px] text-ink-muted">{help}</p>
      <div className="flex gap-2">
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder='Paste the code, or the whole <meta …> tag' />
        <Button type="primary" loading={busy} disabled={value === saved} onClick={save}>
          Save
        </Button>
      </div>
      {saved && (
        <p className="m-0 mt-2 text-[12px] text-[#15803D] flex items-center gap-1">
          <CheckCircle2 size={12} aria-hidden="true" /> On every page of your store
        </p>
      )}
    </Card>
  );
}

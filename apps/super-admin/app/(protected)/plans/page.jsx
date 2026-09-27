"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { App, Button, Form, Input, InputNumber, Modal, Skeleton, Switch } from "antd";
import { Pencil } from "lucide-react";
import { PageHeader, useHasMounted } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { inr } from "@/lib/billing";

/**
 * Plans and what each includes — the billing engine's entitlements read
 * this matrix on every request, so a change here applies to every store on
 * the plan straight away. Prices apply from each store's next payment.
 */
export default function PlansPage() {
  const mounted = useHasMounted();
  const { message } = App.useApp();
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setData(await apiFetch("/api/super-admin/billing/plans"));
  }, []);

  useEffect(() => {
    load().catch((err) => message.error(err.message));
  }, [load, message]);

  async function toggle(plan, key, value) {
    setSaving(`${plan.id}:${key}`);
    try {
      setData(await apiFetch(`/api/super-admin/billing/plans/${plan.id}/features`, { method: "PUT", body: { [key]: value } }));
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(null);
    }
  }

  async function savePlan(values) {
    setSaving("plan");
    try {
      await apiFetch(`/api/super-admin/billing/plans/${editing.id}`, { method: "PATCH", body: values });
      message.success(`${values.name} saved`);
      setEditing(null);
      await load();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(null);
    }
  }

  if (!mounted || !data) return <Skeleton active paragraph={{ rows: 10 }} />;
  const categories = [...new Set(data.features.map((f) => f.category))];

  return (
    <div>
      <PageHeader title="Plans" subtitle="Prices, checkout fees, staff limits and the features each plan includes. Changes apply to every store on the plan." />

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        {data.plans.map((p) => (
          <div key={p.id} className="bg-app-surface border border-app-border rounded-[14px] shadow-card p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-base font-semibold text-ink m-0">
                  {p.name} {!p.isActive && <span className="text-xs font-normal text-ink-muted">(hidden)</span>}
                </p>
                <p className="text-[13px] text-ink-muted m-0 mt-0.5">{p.tagline}</p>
              </div>
              <Button
                size="small"
                icon={<Pencil size={13} aria-hidden="true" />}
                onClick={() => {
                  form.setFieldsValue({ name: p.name, tagline: p.tagline, priceMonthly: p.priceMonthly, commissionPercent: p.commissionPercent, staffLimit: p.staffLimit, isActive: p.isActive });
                  setEditing(p);
                }}
              >
                Edit
              </Button>
            </div>
            <p className="m-0 mt-3">
              <span className="text-2xl font-semibold text-ink tabular-nums">{inr(p.priceMonthly)}</span>
              <span className="text-[13px] text-ink-muted">/month · {inr(p.priceYearly)}/year</span>
            </p>
            <p className="text-[13px] text-ink m-0 mt-2">
              {p.commissionPercent}% checkout fee · {p.staffLimit} staff · {p.subscriptions} store{p.subscriptions === 1 ? "" : "s"}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-app-surface border border-app-border rounded-[14px] shadow-card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm border-collapse">
          <thead>
            <tr className="border-b border-app-border">
              <th className="text-left font-medium text-ink-muted px-4 py-3">Feature</th>
              {data.plans.map((p) => (
                <th key={p.id} className="font-semibold text-ink px-4 py-3 w-32">
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <Fragment key={cat}>
                <tr className="bg-app-bg">
                  <td colSpan={data.plans.length + 1} className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                    {cat}
                  </td>
                </tr>
                {data.features
                  .filter((f) => f.category === cat)
                  .map((f) => (
                    <tr key={f.key} className="border-t border-app-border">
                      <td className="px-4 py-2.5 text-ink">
                        {f.name}
                        <span className="block text-xs text-ink-muted font-mono">{f.key}</span>
                      </td>
                      {data.plans.map((p) => (
                        <td key={p.id} className="px-4 py-2.5 text-center">
                          {f.kind === "limit" ? (
                            <span className="tabular-nums">{p.staffLimit}</span>
                          ) : (
                            <Switch size="small" checked={Boolean(p.features[f.key]?.enabled)} loading={saving === `${p.id}:${f.key}`} onChange={(v) => toggle(p, f.key, v)} aria-label={`${f.name} on ${p.name}`} />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={Boolean(editing)} title={editing ? `Edit ${editing.name}` : ""} okText="Save plan" confirmLoading={saving === "plan"} onCancel={() => setEditing(null)} onOk={() => form.submit()} destroyOnHidden>
        <Form form={form} layout="vertical" requiredMark={false} onFinish={savePlan} className="mt-3">
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="name" label="Name" rules={[{ required: true }]}>
              <Input maxLength={60} />
            </Form.Item>
            <Form.Item name="priceMonthly" label="Monthly price (₹, before GST)" rules={[{ required: true }]}>
              <InputNumber min={0} className="!w-full" />
            </Form.Item>
            <Form.Item name="commissionPercent" label="Checkout fee (%)" rules={[{ required: true }]}>
              <InputNumber min={0} max={20} step={0.1} className="!w-full" />
            </Form.Item>
            <Form.Item name="staffLimit" label="Staff accounts" rules={[{ required: true }]}>
              <InputNumber min={0} max={10000} className="!w-full" />
            </Form.Item>
          </div>
          <Form.Item name="tagline" label="Tagline">
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="isActive" label="Offered to sellers" valuePropName="checked">
            <Switch />
          </Form.Item>
          <p className="text-xs text-ink-muted m-0">A new price applies from each store's next payment. The checkout fee applies to orders placed from now on.</p>
        </Form>
      </Modal>
    </div>
  );
}

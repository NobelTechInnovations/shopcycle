"use client";

import { useEffect, useState } from "react";
import { App, Button, Form, Input, InputNumber, Select, Skeleton, Switch } from "antd";
import { useHasMounted } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

const list = (v) => (Array.isArray(v) ? v.join(", ") : v);
const parseList = (v) =>
  String(v || "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);

function Section({ title, children, note }) {
  return (
    <section className="bg-app-surface border border-app-border rounded-[14px] shadow-card p-5">
      <h2 className="text-[15px] font-semibold text-ink m-0">{title}</h2>
      {note && <p className="text-[13px] text-ink-muted mt-1 mb-0">{note}</p>}
      <div className="grid gap-x-5 md:grid-cols-3 mt-4">{children}</div>
    </section>
  );
}

/** The rules the billing engine follows. Changes apply from the engine's
 * next run; amounts already charged or invoiced don't change. */
export default function BillingSettingsPage() {
  const mounted = useHasMounted();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [plans, setPlans] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([apiFetch("/api/super-admin/billing/settings"), apiFetch("/api/super-admin/billing/plans")])
      .then(([{ settings }, matrix]) => {
        form.setFieldsValue({
          ...settings,
          retryOffsetsDays: list(settings.retryOffsetsDays),
          reminderDaysBeforeBilling: list(settings.reminderDaysBeforeBilling),
          trialEndingReminderDays: list(settings.trialEndingReminderDays),
          graceEndingReminderDays: list(settings.graceEndingReminderDays),
        });
        setPlans(matrix.plans);
        setLoaded(true);
      })
      .catch((err) => message.error(err.message));
  }, [form, message]);

  async function save(values) {
    setSaving(true);
    try {
      await apiFetch("/api/super-admin/billing/settings", {
        method: "PATCH",
        body: {
          ...values,
          retryOffsetsDays: parseList(values.retryOffsetsDays),
          reminderDaysBeforeBilling: parseList(values.reminderDaysBeforeBilling),
          trialEndingReminderDays: parseList(values.trialEndingReminderDays),
          graceEndingReminderDays: parseList(values.graceEndingReminderDays),
        },
      });
      message.success("Billing settings saved");
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!mounted || !loaded) return <Skeleton active paragraph={{ rows: 8 }} />;
  return (
    <Form form={form} layout="vertical" requiredMark={false} onFinish={save} className="flex flex-col gap-5">
      <Section title="Pricing & tax" note="Plan prices are set per plan (Plans). GST is always added on top and shown separately.">
        <Form.Item name="taxRate" label="GST rate (%)">
          <InputNumber min={0} max={40} step={0.5} className="!w-full" />
        </Form.Item>
        <Form.Item name="annualDiscountPercent" label="Yearly discount (%)" extra="Yearly = monthly × 12 × (1 − discount)">
          <InputNumber min={0} max={90} className="!w-full" />
        </Form.Item>
        <Form.Item name="oneClickFeePercent" label="One-Click Checkout fee (%)" extra="On top of the plan's checkout fee">
          <InputNumber min={0} max={10} step={0.05} className="!w-full" />
        </Form.Item>
      </Section>

      <Section title="Trial & first month" note="Every new store gets these — a second store by the same owner too.">
        <Form.Item name="trialDays" label="Free trial (days)">
          <InputNumber min={0} max={60} className="!w-full" />
        </Form.Item>
        <Form.Item name="defaultTrialPlan" label="Trial plan">
          <Select options={plans.map((p) => ({ value: p.key, label: p.name }))} />
        </Form.Item>
        <div className="grid grid-cols-[auto_1fr] gap-3 items-start">
          <Form.Item name="introEnabled" label="First-month offer" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="introPrice" label="First month (₹, before GST)">
            <InputNumber min={0} className="!w-full" />
          </Form.Item>
        </div>
      </Section>

      <Section title="Failed payments" note="Grace keeps the dashboard open; after it the dashboard locks while the storefront stays live. At the limit of unpaid cycles the store goes offline.">
        <Form.Item name="graceDays" label="Grace period (days)">
          <InputNumber min={0} max={60} className="!w-full" />
        </Form.Item>
        <Form.Item name="maxConsecutiveFailures" label="Unpaid cycles before suspension">
          <InputNumber min={1} max={12} className="!w-full" />
        </Form.Item>
        <Form.Item name="retryOffsetsDays" label="Retry after (days)" extra="Comma-separated, e.g. 1, 3, 5">
          <Input />
        </Form.Item>
      </Section>

      <Section title="Reminders" note="Days before the date. Each reminder is sent once — dashboard notice and email.">
        <Form.Item name="reminderDaysBeforeBilling" label="Before each payment">
          <Input />
        </Form.Item>
        <Form.Item name="trialEndingReminderDays" label="Before the trial ends">
          <Input />
        </Form.Item>
        <Form.Item name="graceEndingReminderDays" label="Before grace ends">
          <Input />
        </Form.Item>
      </Section>

      <Section title="Mandates">
        <Form.Item name={["mandateMaxAmount", "upi"]} label="UPI AutoPay limit (₹)">
          <InputNumber min={100} className="!w-full" />
        </Form.Item>
        <Form.Item name={["mandateMaxAmount", "card"]} label="Card limit (₹)">
          <InputNumber min={100} className="!w-full" />
        </Form.Item>
        <Form.Item name={["mandateMaxAmount", "emandate"]} label="E-mandate limit (₹)">
          <InputNumber min={100} className="!w-full" />
        </Form.Item>
        <Form.Item name="mandateYears" label="Mandate valid for (years)">
          <InputNumber min={1} max={30} className="!w-full" />
        </Form.Item>
        <Form.Item name="supportEmail" label="Billing support email">
          <Input type="email" />
        </Form.Item>
      </Section>

      <div className="flex justify-end">
        <Button type="primary" htmlType="submit" loading={saving}>
          Save settings
        </Button>
      </div>
    </Form>
  );
}

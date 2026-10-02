"use client";

import { useEffect, useState } from "react";
import { App, Button, Card, Form, Input, InputNumber, Radio, Skeleton } from "antd";
import { apiFetch } from "@/lib/api";

/** How bookings work in this store: pay at checkout or request first,
 * delivery and pickup, the deposit, late fees, terms. */
export function RentalSettings({ settings, onSaved }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const handover = Form.useWatch("handover", form);
  const returns = Form.useWatch("returns", form);

  useEffect(() => {
    if (settings) {
      form.setFieldsValue(settings);
      setDirty(false);
    }
  }, [settings, form]);

  if (!settings) return <Skeleton active />;

  async function save(values) {
    setSaving(true);
    try {
      const { settings: next } = await apiFetch("/api/rentals/settings", { method: "PUT", body: values });
      onSaved(next);
      setDirty(false);
      message.success("Rental settings saved");
    } catch (err) {
      message.error(err.message || "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  const needsAddress = handover !== "delivery" || returns !== "collect";

  return (
    <Form form={form} layout="vertical" requiredMark={false} onFinish={save} onValuesChange={() => setDirty(true)} className="max-w-[760px]">
      <div className="flex flex-col gap-6">
        <Card size="small" title="Booking">
          <Form.Item name="checkoutMode" label="When a shopper books" className="mb-0">
            <Radio.Group className="flex flex-col gap-2">
              <Radio value="cart">
                <span className="text-[13.5px]">They pay at checkout</span>
                <span className="block text-[12.5px] text-ink-muted">The rent goes in the cart; the dates are booked when the order is placed (cash on delivery or online).</span>
              </Radio>
              <Radio value="request">
                <span className="text-[13.5px]">They send a request, you confirm</span>
                <span className="block text-[12.5px] text-ink-muted">No payment on the store — you get the request by email, call them, then confirm it here.</span>
              </Radio>
            </Radio.Group>
          </Form.Item>
        </Card>

        <Card size="small" title="Delivery and return">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
            <Form.Item name="handover" label="Getting it to the customer">
              <Radio.Group className="flex flex-col gap-1.5">
                <Radio value="both">Customer chooses</Radio>
                <Radio value="delivery">You deliver it</Radio>
                <Radio value="store_pickup">They pick it up from you</Radio>
              </Radio.Group>
            </Form.Item>
            <Form.Item name="returns" label="Getting it back">
              <Radio.Group className="flex flex-col gap-1.5">
                <Radio value="both">Customer chooses</Radio>
                <Radio value="collect">You collect it</Radio>
                <Radio value="drop_off">They drop it back</Radio>
              </Radio.Group>
            </Form.Item>
          </div>
          <Form.Item
            name="pickupAddress"
            label="Your pickup & drop-off address"
            className="mb-0"
            extra={needsAddress ? "Shown on the product page for customers who come to you." : "Only needed when customers can come to you."}
          >
            <Input.TextArea rows={2} maxLength={400} placeholder="Shop 4, MG Road, Pune 411001 · 11am–8pm" />
          </Form.Item>
        </Card>

        <Card size="small" title="Money">
          <Form.Item name="depositCollection" label="Collect the deposit">
            <Radio.Group className="flex flex-col gap-1.5">
              <Radio value="on_delivery">On delivery or pickup, in person</Radio>
              <Radio value="checkout">At checkout, with the rent</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="lateFeePerDay" label="Late fee per day, per piece" className="mb-0" extra="Suggested when you mark a late return. Leave 0 for none.">
            <InputNumber min={0} prefix="₹" className="w-[180px]" />
          </Form.Item>
        </Card>

        <Card size="small" title="Rules">
          <Form.Item name="bookingWindowDays" label="Bookings open up to" extra="How far ahead shoppers can book.">
            <InputNumber min={14} max={730} addonAfter="days ahead" className="w-[220px]" />
          </Form.Item>
          <Form.Item name="terms" label="Rental terms (optional)" className="mb-0" extra="Shown under the booking calendar — care, damage, cleaning, ID needed.">
            <Input.TextArea rows={4} maxLength={2000} placeholder="Dry-clean only. Minor stains are fine; damage is charged from the deposit. Bring a photo ID at pickup." />
          </Form.Item>
        </Card>

        <div>
          <Button type="primary" htmlType="submit" loading={saving} disabled={!dirty}>
            Save settings
          </Button>
        </div>
      </div>
    </Form>
  );
}

"use client";

import { useEffect, useState } from "react";
import { App, Form, Input, InputNumber, Modal, Radio, Select } from "antd";
import { apiFetch } from "@/lib/api";
import { todayDay } from "./shared";

/**
 * "Add booking" — a rental agreed on the phone or in the shop — or
 * "Block dates" — a piece away for repairs or a shoot. Either way the
 * days stop showing as free on the store.
 */
export function NewBookingModal({ kind, onClose, onCreated }) {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState([]);
  const [saving, setSaving] = useState(false);
  const productId = Form.useWatch("productId", form);
  const start = Form.useWatch("start", form);
  const block = kind === "block";

  useEffect(() => {
    if (!kind) return;
    form.resetFields();
    apiFetch("/api/rentals/products").then((d) => setProducts(d.products)).catch(() => {});
  }, [kind, form]);

  useEffect(() => {
    setVariants([]);
    form.setFieldValue("variantId", undefined);
    if (!productId) return;
    apiFetch(`/api/products/${productId}`)
      .then((d) => setVariants((d.product?.variants || []).filter((v) => v.status !== "draft")))
      .catch(() => {});
  }, [productId, form]);

  async function submit(values, force = false) {
    setSaving(true);
    try {
      const { booking } = await apiFetch("/api/rentals/bookings", { method: "POST", body: { ...values, kind: block ? "block" : "booking", force } });
      onCreated(booking);
    } catch (err) {
      if (err.status === 409) {
        modal.confirm({
          title: "Those dates are already booked",
          content: `${err.message} Add it anyway? Only if you have another piece free.`,
          okText: "Add anyway",
          onOk: () => submit(values, true),
        });
      } else {
        message.error(err.message || "Couldn't save");
      }
    } finally {
      setSaving(false);
    }
  }

  const sizes = variants.length > 1 || (variants.length === 1 && variants[0].title !== "Default");

  return (
    <Modal
      open={Boolean(kind)}
      onCancel={onClose}
      title={block ? "Block dates" : "Add a booking"}
      okText={block ? "Block dates" : "Add booking"}
      confirmLoading={saving}
      onOk={() => form.submit()}
      destroyOnHidden
      width={560}
    >
      <p className="text-[13px] text-ink-muted mt-0">
        {block ? "The piece won't be bookable on these days — for repairs, cleaning or a photo shoot." : "For a rental agreed on the phone or in your shop. The dates stop showing as free on your store."}
      </p>
      <Form form={form} layout="vertical" requiredMark={false} onFinish={(v) => submit(v)} initialValues={{ quantity: 1, handover: "store_pickup", returnMethod: "drop_off", start: todayDay(), end: todayDay() }}>
        <Form.Item name="productId" label="Product" rules={[{ required: true, message: "Choose a product" }]}>
          <Select showSearch optionFilterProp="label" placeholder="A product you rent out" options={products.map((p) => ({ value: p.productId, label: p.title }))} notFoundContent="Turn on renting for a product first" />
        </Form.Item>
        {sizes && (
          <Form.Item name="variantId" label="Size" rules={block ? [] : [{ required: true, message: "Choose the size" }]}>
            <Select allowClear={block} placeholder={block ? "All sizes" : "Choose"} options={variants.map((v) => ({ value: v.id, label: v.title }))} />
          </Form.Item>
        )}
        <div className="grid grid-cols-2 gap-x-3">
          <Form.Item name="start" label="First day" rules={[{ required: true, message: "Pick a day" }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item name="end" label="Last day" dependencies={["start"]} rules={[{ required: true, message: "Pick a day" }, ({ getFieldValue }) => ({ validator: (_, v) => (!v || v >= getFieldValue("start") ? Promise.resolve() : Promise.reject(new Error("After the first day"))) })]}>
            <Input type="date" min={start} />
          </Form.Item>
        </div>
        {!block && (
          <>
            <div className="grid grid-cols-2 gap-x-3">
              <Form.Item name="customerName" label="Customer name" rules={[{ required: true, message: "Enter a name" }]}>
                <Input maxLength={120} />
              </Form.Item>
              <Form.Item name="phone" label="Mobile" rules={[{ required: true, message: "Enter a number" }]}>
                <Input type="tel" maxLength={20} />
              </Form.Item>
            </div>
            <div className="grid grid-cols-2 gap-x-3">
              <Form.Item name="handover" label="Handover">
                <Radio.Group className="flex flex-col">
                  <Radio value="store_pickup">They pick it up</Radio>
                  <Radio value="delivery">You deliver</Radio>
                </Radio.Group>
              </Form.Item>
              <Form.Item name="returnMethod" label="Return">
                <Radio.Group className="flex flex-col">
                  <Radio value="drop_off">They drop it back</Radio>
                  <Radio value="collect">You collect it</Radio>
                </Radio.Group>
              </Form.Item>
            </div>
            <Form.Item name="address" label="Address (for delivery or collection)">
              <Input.TextArea rows={2} maxLength={500} />
            </Form.Item>
            <div className="grid grid-cols-3 gap-x-3">
              <Form.Item name="quantity" label="Pieces">
                <InputNumber min={1} max={99} className="w-full" />
              </Form.Item>
              <Form.Item name="rentalTotal" label="Rent agreed" extra="Empty = your rates">
                <InputNumber min={0} prefix="₹" className="w-full" />
              </Form.Item>
              <Form.Item name="deposit" label="Deposit" extra="Empty = your deposit">
                <InputNumber min={0} prefix="₹" className="w-full" />
              </Form.Item>
            </div>
          </>
        )}
        <Form.Item name="note" label="Note" className="mb-0">
          <Input maxLength={1000} placeholder={block ? "Sent for alteration" : "Optional"} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

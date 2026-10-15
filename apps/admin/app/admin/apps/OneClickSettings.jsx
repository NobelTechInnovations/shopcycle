"use client";

import { useEffect, useState } from "react";
import { Button, ColorPicker, Form, Input, InputNumber, Segmented, Select, Switch } from "antd";
import { apiFetch } from "@/lib/api";

const hexOf = (c) => (typeof c === "string" ? c : c?.toHexString?.() || "");

/** One-Click Checkout's settings: how the popup and cart look, and the
 * "You may also like" products in the cart. Saved as the app's settings. */
export function OneClickSettings({ app, onSave, saving }) {
  const [form] = Form.useForm();
  const [products, setProducts] = useState([]);
  const [collections, setCollections] = useState([]);
  const s = app.settings || {};
  const crossSell = Form.useWatch("crossSell", form);
  const source = Form.useWatch("crossSellSource", form);

  useEffect(() => {
    apiFetch("/api/products?pageSize=100&status=active").then((d) => setProducts(d.products || [])).catch(() => {});
    apiFetch("/api/collections?pageSize=100").then((d) => setCollections(d.collections || [])).catch(() => {});
  }, []);

  useEffect(() => {
    form.setFieldsValue({
      accent: s.accent || null,
      buttonText: s.buttonText || null,
      corners: s.corners || "theme",
      summary: s.summary === "open",
      crossSell: s.crossSell === "on",
      crossSellSource: s.crossSellSource || "auto",
      crossSellCollection: s.crossSellCollection || undefined,
      crossSellProducts: String(s.crossSellProducts || "").split(",").filter(Boolean),
      crossSellTitle: s.crossSellTitle || "You may also like",
      crossSellLayout: s.crossSellLayout || "row",
      crossSellCard: s.crossSellCard || "bordered",
      crossSellLimit: Number(s.crossSellLimit) || 4,
    });
  }, [app]); // eslint-disable-line react-hooks/exhaustive-deps

  function submit(v) {
    onSave({
      ...s,
      accent: hexOf(v.accent),
      buttonText: hexOf(v.buttonText),
      corners: v.corners,
      summary: v.summary ? "open" : "closed",
      crossSell: v.crossSell ? "on" : "off",
      crossSellSource: v.crossSellSource,
      crossSellCollection: v.crossSellCollection || "",
      crossSellProducts: (v.crossSellProducts || []).join(","),
      crossSellTitle: v.crossSellTitle || "",
      crossSellLayout: v.crossSellLayout,
      crossSellCard: v.crossSellCard,
      crossSellLimit: String(v.crossSellLimit || 4),
    });
  }

  return (
    <Form layout="vertical" form={form} onFinish={submit} requiredMark={false}>
      <h3 className="text-[13px] font-semibold text-ink m-0 mb-3">Design</h3>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Form.Item name="accent" label="Checkout colour" extra="Buttons, links and selected options. Empty uses your theme's colour.">
          <ColorPicker allowClear showText format="hex" />
        </Form.Item>
        <Form.Item name="buttonText" label="Button text colour" extra="Pick white on a dark colour, dark on a light one.">
          <ColorPicker allowClear showText format="hex" />
        </Form.Item>
      </div>
      <Form.Item name="corners" label="Button corners">
        <Segmented
          options={[
            { value: "theme", label: "Theme" },
            { value: "rounded", label: "Rounded" },
            { value: "pill", label: "Pill" },
            { value: "square", label: "Square" },
          ]}
        />
      </Form.Item>
      <Form.Item name="summary" label="Show the order summary open in the popup" valuePropName="checked">
        <Switch />
      </Form.Item>

      <h3 className="text-[13px] font-semibold text-ink m-0 mb-1 mt-2 pt-4 border-t border-app-border">Cross-sell in the cart</h3>
      <p className="text-[12.5px] text-ink-muted m-0 mb-3">Suggest more products under the cart items, with a one-tap Add. Products already in the cart are skipped.</p>
      <Form.Item name="crossSell" label="Show “You may also like”" valuePropName="checked">
        <Switch />
      </Form.Item>
      {crossSell && (
        <>
          <Form.Item name="crossSellTitle" label="Heading">
            <Input maxLength={60} placeholder="You may also like" />
          </Form.Item>
          <Form.Item name="crossSellSource" label="Which products">
            <Segmented
              options={[
                { value: "auto", label: "Best sellers" },
                { value: "collection", label: "A collection" },
                { value: "products", label: "Pick products" },
              ]}
            />
          </Form.Item>
          {source === "collection" && (
            <Form.Item name="crossSellCollection" label="Collection" rules={[{ required: true, message: "Choose a collection" }]}>
              <Select showSearch optionFilterProp="label" placeholder="Choose a collection" options={collections.map((c) => ({ value: c.id, label: c.title }))} />
            </Form.Item>
          )}
          {source === "products" && (
            <Form.Item name="crossSellProducts" label="Products" rules={[{ required: true, message: "Pick at least one product" }]}>
              <Select mode="multiple" showSearch optionFilterProp="label" placeholder="Search products" maxCount={8} options={products.map((p) => ({ value: p.id, label: p.title }))} />
            </Form.Item>
          )}
          <div className="grid gap-x-4 sm:grid-cols-3">
            <Form.Item name="crossSellLayout" label="Layout">
              <Select
                options={[
                  { value: "row", label: "Scrolling row" },
                  { value: "grid", label: "Grid (2 per row)" },
                  { value: "list", label: "List" },
                ]}
              />
            </Form.Item>
            <Form.Item name="crossSellCard" label="Card style">
              <Select
                options={[
                  { value: "bordered", label: "Bordered" },
                  { value: "filled", label: "Filled" },
                  { value: "minimal", label: "Minimal" },
                ]}
              />
            </Form.Item>
            <Form.Item name="crossSellLimit" label="How many">
              <InputNumber min={1} max={8} className="w-full" />
            </Form.Item>
          </div>
        </>
      )}
      <p className="text-[12.5px] text-ink-muted m-0 mb-3">Which fields checkout asks for is in Settings ▸ Checkout.</p>
      <div className="flex justify-end">
        <Button type="primary" htmlType="submit" loading={saving}>
          Save settings
        </Button>
      </div>
    </Form>
  );
}

"use client";

import { Form, Input, InputNumber, Select, Button, Switch } from "antd";
import { Trash2 } from "lucide-react";

/** Picking a real product/variant auto-fills title, price, and sku (kept as
 * hidden fields so they still travel in the form's submitted values) — a
 * "Custom item" toggle switches the row to a free-text title for one-off
 * line items (gift wrapping, a manual adjustment) that aren't a real product.
 *
 * Each of title/variantId/productId/sku gets exactly one mounted Form.Item
 * (toggling `hidden`, never duplicated) — two Form.Items sharing a field
 * name is an antd footgun: whichever isn't currently hidden "wins" and the
 * other's value can be silently dropped from the submitted payload. */
export function OrderItemRow({ field, restField, form, products, onRemove, canRemove }) {
  const isCustom = Form.useWatch(["items", field.name, "isCustom"], form);
  const variantId = Form.useWatch(["items", field.name, "variantId"], form);

  const variantOptions = products.flatMap((p) =>
    p.variants.map((v) => ({
      value: v.id,
      label: `${p.title}${v.title !== "Default" ? ` — ${v.title}` : ""} (₹${Number(v.price).toFixed(2)})`,
    }))
  );

  function handleProductSelect(selectedVariantId) {
    let match = null;
    for (const p of products) {
      const v = p.variants.find((variant) => variant.id === selectedVariantId);
      if (v) {
        match = { product: p, variant: v };
        break;
      }
    }
    if (!match) return;
    const { product, variant } = match;
    form.setFieldValue(["items", field.name, "variantId"], variant.id);
    form.setFieldValue(["items", field.name, "productId"], product.id);
    form.setFieldValue(
      ["items", field.name, "title"],
      `${product.title}${variant.title !== "Default" ? ` — ${variant.title}` : ""}`
    );
    form.setFieldValue(["items", field.name, "price"], Number(variant.price));
    form.setFieldValue(["items", field.name, "sku"], variant.sku);
  }

  function handleCustomToggle(checked) {
    form.setFieldValue(["items", field.name, "isCustom"], checked);
    form.setFieldValue(["items", field.name, "variantId"], undefined);
    form.setFieldValue(["items", field.name, "productId"], undefined);
    form.setFieldValue(["items", field.name, "title"], undefined);
    form.setFieldValue(["items", field.name, "price"], 0);
  }

  return (
    <div className="border border-app-border rounded-md p-3">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
        <div className="md:col-span-2">
          {!isCustom && (
            <div className="mb-2">
              <label className="block text-xs font-medium mb-1">Product</label>
              <Select
                showSearch
                className="w-full"
                optionFilterProp="label"
                placeholder="Select a product"
                options={variantOptions}
                value={variantId}
                onChange={handleProductSelect}
              />
            </div>
          )}
          <Form.Item
            {...restField}
            name={[field.name, "title"]}
            label={isCustom ? "Item" : undefined}
            className="mb-0"
            hidden={!isCustom}
            rules={isCustom ? [{ required: true, message: "Required" }] : []}
          >
            <Input placeholder="Gift wrapping" />
          </Form.Item>
        </div>

        <Form.Item {...restField} name={[field.name, "quantity"]} label="Qty" className="mb-0">
          <InputNumber min={1} className="w-full" />
        </Form.Item>
        <Form.Item {...restField} name={[field.name, "price"]} label="Price" className="mb-0">
          <InputNumber min={0} prefix="₹" className="w-full" readOnly={!isCustom} />
        </Form.Item>

        <div className="flex items-center gap-2">
          <Switch size="small" checked={isCustom} onChange={handleCustomToggle} />
          <span className="text-xs text-ink-muted">Custom</span>
        </div>
      </div>

      <Form.Item {...restField} name={[field.name, "variantId"]} hidden>
        <Input type="hidden" />
      </Form.Item>
      <Form.Item {...restField} name={[field.name, "productId"]} hidden>
        <Input type="hidden" />
      </Form.Item>
      <Form.Item {...restField} name={[field.name, "sku"]} hidden>
        <Input type="hidden" />
      </Form.Item>
      <Form.Item {...restField} name={[field.name, "isCustom"]} hidden>
        <Input type="hidden" />
      </Form.Item>

      {canRemove && (
        <Button type="text" danger size="small" className="mt-2" icon={<Trash2 size={14} aria-hidden="true" />} onClick={onRemove}>
          Remove item
        </Button>
      )}
    </div>
  );
}

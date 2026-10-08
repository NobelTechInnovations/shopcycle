"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Card, Checkbox, Form, Input, InputNumber, Radio, Segmented, Select, Switch } from "antd";
import { Shuffle, Zap, Ticket } from "lucide-react";
import { PageHeader, SaveBar } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { DISCOUNT_TYPES, kindOf, summaryLines } from "./discount-text";

// <input type="datetime-local"> works in the browser's local time.
const toLocal = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocal = (v) => (v ? new Date(v).toISOString() : null);

function randomCode() {
  const words = ["SAVE", "DEAL", "FEST", "TREAT", "HAPPY", "SHOP"];
  return `${words[Math.floor(Math.random() * words.length)]}${Math.floor(10 + Math.random() * 89)}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
}

/** What the form holds → what the API takes. */
function toBody(v, kind) {
  const type = kind === "shipping" ? "free_shipping" : kind === "bxgy" ? "buy_x_get_y" : v.valueType;
  return {
    method: v.method,
    ...(v.method === "code" ? { code: v.code } : { title: v.title }),
    type,
    value: kind === "shipping" ? 0 : kind === "bxgy" ? (v.getFree ? 100 : v.value) : v.value,
    maxDiscount: type === "percentage" && v.capOn ? v.maxDiscount : null,
    appliesTo: kind === "order" || kind === "shipping" ? "order" : v.appliesTo,
    targetIds: kind === "order" || kind === "shipping" || v.appliesTo === "order" ? [] : v.targetIds || [],
    buyQuantity: kind === "bxgy" ? v.buyQuantity : null,
    getQuantity: kind === "bxgy" ? v.getQuantity : null,
    minSubtotal: v.minimum === "amount" ? v.minSubtotal : null,
    minQuantity: v.minimum === "quantity" ? v.minQuantity : null,
    usageLimit: v.limitOn ? v.usageLimit : null,
    oncePerCustomer: Boolean(v.oncePerCustomer),
    startsAt: fromLocal(v.startsAt),
    endsAt: v.endOn ? fromLocal(v.endsAt) : null,
    status: v.active ? "active" : "disabled",
  };
}

function initialValues(d, kind) {
  if (!d) {
    return {
      method: "code",
      code: "",
      valueType: "percentage",
      value: kind === "bxgy" ? 100 : 10,
      getFree: true,
      buyQuantity: 2,
      getQuantity: 1,
      appliesTo: kind === "products" ? "collections" : "order",
      targetIds: [],
      minimum: kind === "shipping" ? "amount" : "none",
      minSubtotal: kind === "shipping" ? 999 : undefined,
      limitOn: false,
      oncePerCustomer: false,
      startsAt: toLocal(new Date().toISOString()),
      endOn: false,
      active: true,
    };
  }
  return {
    method: d.method || "code",
    code: d.method === "automatic" ? "" : d.code,
    title: d.title || "",
    valueType: d.type === "fixed_amount" ? "fixed_amount" : "percentage",
    value: Number(d.value),
    getFree: Number(d.value) >= 100,
    capOn: d.maxDiscount != null,
    maxDiscount: d.maxDiscount != null ? Number(d.maxDiscount) : undefined,
    buyQuantity: d.buyQuantity || 2,
    getQuantity: d.getQuantity || 1,
    appliesTo: d.appliesTo || "order",
    targetIds: d.targetIds || [],
    minimum: d.minSubtotal != null ? "amount" : d.minQuantity ? "quantity" : "none",
    minSubtotal: d.minSubtotal != null ? Number(d.minSubtotal) : undefined,
    minQuantity: d.minQuantity || undefined,
    limitOn: Boolean(d.usageLimit),
    usageLimit: d.usageLimit || undefined,
    oncePerCustomer: Boolean(d.oncePerCustomer),
    startsAt: toLocal(d.startsAt || d.createdAt),
    endOn: Boolean(d.endsAt),
    endsAt: toLocal(d.endsAt),
    active: d.status === "active",
  };
}

/**
 * Create / edit a discount. The kind (amount off order, off products,
 * buy X get Y, free shipping) is picked first and decides the sections;
 * the summary on the right says it back in plain words.
 */
export function DiscountForm({ discount, kind: kindParam }) {
  const router = useRouter();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [collections, setCollections] = useState([]);
  const [products, setProducts] = useState([]);
  const isEdit = Boolean(discount);
  const kind = discount ? kindOf(discount) : DISCOUNT_TYPES.some((t) => t.key === kindParam) ? kindParam : "order";
  const kindInfo = DISCOUNT_TYPES.find((t) => t.key === kind);
  const init = useMemo(() => initialValues(discount, kind), [discount, kind]);
  // Every field, for the conditional sections and the summary.
  const watched = Form.useWatch((values) => values, form);
  const v = { ...init, ...(watched || {}) };

  useEffect(() => {
    if (kind === "order" || kind === "shipping") return;
    apiFetch("/api/collections?pageSize=100")
      .then((d) => setCollections(d.collections || []))
      .catch(() => {});
    apiFetch("/api/products?pageSize=100")
      .then((d) => setProducts(d.products || []))
      .catch(() => {});
  }, [kind]);

  async function submit(values) {
    setSaving(true);
    try {
      // Fields hidden right now still count (their saved values).
      const body = toBody({ ...form.getFieldsValue(true), ...values }, kind);
      if (isEdit) await apiFetch(`/api/discounts/${discount.id}`, { method: "PATCH", body });
      else await apiFetch("/api/discounts", { method: "POST", body });
      message.success(isEdit ? "Discount saved" : "Discount created");
      setDirty(false);
      router.push("/admin/discounts");
      router.refresh();
    } catch (err) {
      const field = err.details && Object.values(err.details).flat().find((m) => typeof m === "string");
      message.error(field || err.message);
    } finally {
      setSaving(false);
    }
  }

  const preview = toBody(v, kind);
  const lines = summaryLines(preview, { collections, products });
  const picker = v.appliesTo === "products" ? products : collections;

  return (
    <div>
      <PageHeader
        title={isEdit ? (discount.method === "automatic" ? discount.title : discount.code) : kindInfo.title}
        subtitle={isEdit ? `${kindInfo.title} · used ${discount.usageCount} time${discount.usageCount === 1 ? "" : "s"}` : kindInfo.text}
        backHref="/admin/discounts"
      />

      <Form form={form} layout="vertical" requiredMark={false} initialValues={init} onFinish={submit} onValuesChange={() => setDirty(true)}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 flex flex-col gap-6 min-w-0">
            <Card size="small" title={kindInfo.title}>
              <Form.Item name="method" className="mb-4">
                <Segmented
                  options={[
                    { value: "code", label: <span className="inline-flex items-center gap-1.5 px-1"><Ticket size={14} aria-hidden="true" /> Discount code</span> },
                    { value: "automatic", label: <span className="inline-flex items-center gap-1.5 px-1"><Zap size={14} aria-hidden="true" /> Automatic</span> },
                  ]}
                />
              </Form.Item>
              {v.method === "automatic" ? (
                <Form.Item name="title" label="Title" rules={[{ required: true, message: "Shoppers see this title in the cart" }]} extra="Applies by itself when the cart qualifies — shoppers see this title in their cart and at checkout." className="mb-0">
                  <Input maxLength={80} placeholder="e.g. Diwali sale — 10% off" />
                </Form.Item>
              ) : (
                <Form.Item label="Code" required extra="Shoppers enter it in the cart or at checkout." className="mb-0">
                  <div className="flex gap-2">
                    <Form.Item name="code" noStyle rules={[{ required: true, message: "Enter a code" }, { pattern: /^[A-Za-z0-9_-]{2,40}$/, message: "Letters, numbers, - and _ only" }]}>
                      <Input placeholder="WELCOME10" className="font-mono uppercase" style={{ textTransform: "uppercase" }} />
                    </Form.Item>
                    <Button
                      icon={<Shuffle size={14} aria-hidden="true" />}
                      onClick={() => {
                        form.setFieldValue("code", randomCode());
                        setDirty(true);
                      }}
                    >
                      Generate
                    </Button>
                  </div>
                </Form.Item>
              )}
            </Card>

            {(kind === "order" || kind === "products") && (
              <Card size="small" title="Discount value">
                <div className="flex flex-wrap items-end gap-3">
                  <Form.Item name="valueType" className="mb-0">
                    <Segmented options={[{ value: "percentage", label: "Percentage" }, { value: "fixed_amount", label: "Fixed amount" }]} />
                  </Form.Item>
                  <Form.Item name="value" className="mb-0" rules={[{ required: true, message: "Enter the value" }]}>
                    <InputNumber min={0} max={v.valueType === "percentage" ? 100 : undefined} className="!w-40" {...(v.valueType === "percentage" ? { suffix: "%" } : { prefix: "₹" })} />
                  </Form.Item>
                </div>
                {v.valueType === "percentage" && (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Form.Item name="capOn" valuePropName="checked" className="mb-0">
                      <Checkbox>Cap the discount at</Checkbox>
                    </Form.Item>
                    {v.capOn && (
                      <Form.Item name="maxDiscount" className="mb-0" rules={[{ required: true, message: "Enter the cap" }]}>
                        <InputNumber min={1} prefix="₹" className="!w-36" />
                      </Form.Item>
                    )}
                  </div>
                )}
              </Card>
            )}

            {kind === "bxgy" && (
              <Card size="small" title="Customer buys, customer gets">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                  <Form.Item name="buyQuantity" label="Buys (items)" rules={[{ required: true }]}>
                    <InputNumber min={1} max={100} className="!w-full" />
                  </Form.Item>
                  <Form.Item name="getQuantity" label="Gets (items)" rules={[{ required: true }]}>
                    <InputNumber min={1} max={100} className="!w-full" />
                  </Form.Item>
                </div>
                <Form.Item name="getFree" className="mb-2">
                  <Radio.Group
                    options={[
                      { value: true, label: "Free" },
                      { value: false, label: "At a percentage off" },
                    ]}
                  />
                </Form.Item>
                {!v.getFree && (
                  <Form.Item name="value" className="mb-0" rules={[{ required: true, message: "Enter the percentage" }]}>
                    <InputNumber min={1} max={99} suffix="% off" className="!w-40" />
                  </Form.Item>
                )}
                <p className="m-0 mt-3 text-[12.5px] text-ink-muted">The cheapest items in each group are the ones they get — buy {v.buyQuantity || 2}, the next {v.getQuantity || 1} {v.getFree ? "free" : "discounted"}.</p>
              </Card>
            )}

            {(kind === "products" || kind === "bxgy") && (
              <Card size="small" title="Applies to">
                <Form.Item name="appliesTo" className="mb-3">
                  <Radio.Group
                    options={[
                      ...(kind === "bxgy" ? [{ value: "order", label: "Any products" }] : []),
                      { value: "collections", label: "Specific collections" },
                      { value: "products", label: "Specific products" },
                    ]}
                  />
                </Form.Item>
                {v.appliesTo !== "order" && (
                  <Form.Item name="targetIds" className="mb-0" rules={[{ required: true, type: "array", min: 1, message: `Pick at least one ${v.appliesTo === "products" ? "product" : "collection"}` }]}>
                    <Select
                      mode="multiple"
                      showSearch
                      optionFilterProp="label"
                      placeholder={`Search ${v.appliesTo === "products" ? "products" : "collections"}`}
                      options={picker.map((x) => ({ value: x.id, label: x.title }))}
                    />
                  </Form.Item>
                )}
              </Card>
            )}

            <Card size="small" title="Minimum purchase">
              <Form.Item name="minimum" className="mb-3">
                <Radio.Group
                  className="flex flex-col gap-2"
                  options={[
                    { value: "none", label: "No minimum" },
                    { value: "amount", label: "Minimum order amount" },
                    { value: "quantity", label: "Minimum number of items" },
                  ]}
                />
              </Form.Item>
              {v.minimum === "amount" && (
                <Form.Item name="minSubtotal" className="mb-0" rules={[{ required: true, message: "Enter the amount" }]}>
                  <InputNumber min={1} prefix="₹" className="!w-40" />
                </Form.Item>
              )}
              {v.minimum === "quantity" && (
                <Form.Item name="minQuantity" className="mb-0" rules={[{ required: true, message: "Enter the number of items" }]}>
                  <InputNumber min={1} className="!w-40" suffix="items" />
                </Form.Item>
              )}
            </Card>

            <Card size="small" title="Limits">
              <div className="flex flex-wrap items-center gap-3">
                <Form.Item name="limitOn" valuePropName="checked" className="mb-0">
                  <Checkbox>Limit the total number of uses</Checkbox>
                </Form.Item>
                {v.limitOn && (
                  <Form.Item name="usageLimit" className="mb-0" rules={[{ required: true, message: "How many?" }]}>
                    <InputNumber min={1} className="!w-32" suffix="uses" />
                  </Form.Item>
                )}
              </div>
              <Form.Item name="oncePerCustomer" valuePropName="checked" className="mb-0 mt-3">
                <Checkbox>Once per customer (by email)</Checkbox>
              </Form.Item>
            </Card>

            <Card size="small" title="Active dates">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                <Form.Item name="startsAt" label="Starts">
                  <Input type="datetime-local" />
                </Form.Item>
                <div>
                  <Form.Item name="endOn" valuePropName="checked" className="mb-2 mt-7 sm:mt-0 sm:mb-2">
                    <Checkbox>Set an end date</Checkbox>
                  </Form.Item>
                  {v.endOn && (
                    <Form.Item name="endsAt" rules={[{ required: true, message: "Pick the end" }]} className="mb-0">
                      <Input type="datetime-local" />
                    </Form.Item>
                  )}
                </div>
              </div>
            </Card>
          </div>

          <div className="flex flex-col gap-6 min-w-0 lg:sticky lg:top-20">
            <Card size="small" title="Summary">
              {v.method === "automatic" ? (
                <p className="m-0 mb-3 inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink">
                  <Zap size={14} className="text-[#7C5CFF]" aria-hidden="true" /> {v.title || "Untitled"}
                </p>
              ) : (
                <p className="m-0 mb-3">
                  <span className="inline-block font-mono text-[13.5px] font-semibold tracking-wide text-ink bg-app-bg border border-dashed border-app-border rounded px-2 py-0.5">
                    {(v.code || "NO CODE YET").toUpperCase()}
                  </span>
                </p>
              )}
              <ul className="m-0 pl-4 text-[13px] text-ink flex flex-col gap-1">
                {lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
                <li>{v.method === "automatic" ? "Applies by itself" : "Shoppers enter the code"}</li>
                <li>{v.endOn && v.endsAt ? `Ends ${new Date(v.endsAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : "No end date"}</li>
              </ul>
              <div className="mt-4 pt-3 border-t border-app-border flex items-center justify-between">
                <span className="text-[13px] text-ink">Active</span>
                <Form.Item name="active" valuePropName="checked" className="mb-0">
                  <Switch />
                </Form.Item>
              </div>
            </Card>
            <p className="m-0 text-[12px] text-ink-muted px-1">One discount per order: a code a shopper enters takes the place of an automatic discount.</p>
          </div>
        </div>

        <SaveBar dirty={dirty} isNew={!isEdit} saving={saving} saveLabel={isEdit ? "Save" : "Create discount"} onDiscard={() => router.push("/admin/discounts")} />
      </Form>
    </div>
  );
}

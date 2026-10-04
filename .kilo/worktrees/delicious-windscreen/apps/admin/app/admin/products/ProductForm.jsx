"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Form, Input, InputNumber, Select, Button, Card, Upload, App, Modal, Dropdown, Tooltip, Progress } from "antd";
import Link from "next/link";
import { Plus, Trash2, UploadCloud, Images, Wand2, ExternalLink, Copy, Sparkles, Undo2, ChevronDown, CheckCircle2, Circle, Tag as TagIcon, Layers } from "lucide-react";
import { SavedPanel } from "@/components/SavedPanel";
import { MediaLibraryModal } from "@/components/MediaLibraryModal";
import { CustomDataFields, metafieldPayload } from "@/components/CustomDataFields";
import { PageHeader, StatusBadge, SaveBar } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { useApps } from "@/lib/apps";
import { RentalProductCard } from "@/components/RentalProductCard";
import { ThemeTemplateField } from "@/components/ThemeTemplateField";
import { SalesChannelsCard } from "@/components/channels/SalesChannelsCard";
import { IMAGE_ACCEPT, uploadImage } from "@/lib/uploads";
import { storefrontUrlFor, storefrontLabelFor } from "@/lib/storefront";

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

const MAX_IMAGES = 8;

const OPTION_PRESETS = {
  Size: ["XS", "S", "M", "L", "XL", "XXL"],
  Colour: ["Black", "White", "Navy", "Beige"],
};

/** Every combination of the options' values: [["S","Black"],["S","White"],…]. */
function combinations(options) {
  return options.reduce((acc, opt) => acc.flatMap((prefix) => opt.values.map((v) => [...prefix, v])), [[]]);
}

/**
 * "Create variants from options": pick Size and Colour values (or any
 * option) and get one variant per combination, titled "M / Black" — the
 * format the product page splits back into separate pickers.
 */
function VariantOptionsModal({ open, onClose, onApply }) {
  const [options, setOptions] = useState([
    { name: "Size", values: ["S", "M", "L", "XL"] },
    { name: "Colour", values: [] },
  ]);
  const usable = options.filter((o) => o.name.trim() && o.values.length);
  const count = usable.length ? combinations(usable).length : 0;
  const set = (i, patch) => setOptions((list) => list.map((o, j) => (j === i ? { ...o, ...patch } : o)));

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Create variants from options"
      okText={count ? `Create ${count} variant${count === 1 ? "" : "s"}` : "Create variants"}
      okButtonProps={{ disabled: !count || count > 100 }}
      onOk={() => {
        onApply(combinations(usable).map((combo) => combo.join(" / ")));
        onClose();
      }}
      destroyOnHidden
    >
      <p className="text-[13px] text-ink-muted mt-1">
        Shoppers pick each option separately on the product page. Variants that already exist keep their price and stock.
      </p>
      <div className="flex flex-col gap-3">
        {options.map((opt, i) => (
          <div key={i} className="rounded-lg border border-app-border p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Input value={opt.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Option name, e.g. Size" className="max-w-[200px]" aria-label="Option name" />
              {options.length > 1 && (
                <Button type="text" danger size="small" icon={<Trash2 size={13} aria-hidden="true" />} aria-label="Remove option" onClick={() => setOptions((l) => l.filter((_, j) => j !== i))} />
              )}
            </div>
            <Select
              mode="tags"
              value={opt.values}
              onChange={(values) => set(i, { values })}
              tokenSeparators={[","]}
              placeholder="Type a value and press Enter"
              aria-label={`${opt.name || "Option"} values`}
              options={(OPTION_PRESETS[opt.name.trim()] || []).map((v) => ({ value: v, label: v }))}
            />
          </div>
        ))}
        {options.length < 3 && (
          <Button type="dashed" icon={<Plus size={13} aria-hidden="true" />} onClick={() => setOptions((l) => [...l, { name: "", values: [] }])}>
            Add another option
          </Button>
        )}
        {count > 100 && <p className="text-xs text-status-danger m-0">That's {count} combinations — keep it to 100 or fewer.</p>}
      </div>
    </Modal>
  );
}

const AI_MODES = [
  { key: "rewrite", label: "Rewrite it better" },
  { key: "shorter", label: "Make it shorter" },
  { key: "detailed", label: "Add more detail" },
  { key: "bullets", label: "Turn into bullet points" },
  { key: "seo", label: "Help it show up in Google" },
];

const splitTags = (value) =>
  String(value || "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

/**
 * The description box with "Write with AI": the seller writes a few words
 * (or nothing), picks how to improve it, and the box is rewritten in place
 * — with Undo, so their own words are one click away.
 */
function DescriptionField({ form, aiAvailable, getFacts, onChanged }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(null);
  const [undo, setUndo] = useState(null);
  const description = Form.useWatch("description", form);

  async function run(mode) {
    setBusy(mode);
    try {
      const before = form.getFieldValue("description") || "";
      const out = await apiFetch("/api/products/ai/description", { method: "POST", body: { ...getFacts(), description: before, mode } });
      form.setFieldValue("description", out.description);
      setUndo(before);
      onChanged(); // setFieldValue doesn't fire the form's onValuesChange
    } catch (err) {
      message.error(err.message || "Couldn't rewrite the description");
    } finally {
      setBusy(null);
    }
  }

  const empty = !String(description || "").trim();
  const items = AI_MODES.map((m) => ({ key: m.key, label: m.label, disabled: empty && m.key !== "rewrite" }));

  return (
    <div>
      <Form.Item
        name="description"
        label="Description"
        className="mb-2"
        extra={empty ? "Tell shoppers what it is, what it's made of, and why they'll love it. Stuck? Write a few words and let AI finish it." : null}
      >
        <Input.TextArea autoSize={{ minRows: 5, maxRows: 18 }} placeholder="e.g. Soft cotton kurta, straight fit, hand block print, machine washable" disabled={Boolean(busy)} />
      </Form.Item>
      <div className="flex flex-wrap items-center gap-2">
        <Tooltip title={aiAvailable ? null : "AI writing isn't switched on for your store yet."}>
          <Dropdown.Button
            size="small"
            disabled={!aiAvailable || Boolean(busy)}
            loading={Boolean(busy)}
            menu={{ items, onClick: ({ key }) => run(key) }}
            onClick={() => run("rewrite")}
            icon={<ChevronDown size={13} aria-hidden="true" />}
          >
            <span className="inline-flex items-center gap-1.5">
              <Sparkles size={13} aria-hidden="true" className="text-accent" />
              {busy ? "Writing…" : empty ? "Write with AI" : "Improve with AI"}
            </span>
          </Dropdown.Button>
        </Tooltip>
        {undo !== null && !busy && (
          <Button
            size="small"
            type="text"
            icon={<Undo2 size={13} aria-hidden="true" />}
            onClick={() => {
              form.setFieldValue("description", undo);
              setUndo(null);
              onChanged();
            }}
          >
            Undo AI change
          </Button>
        )}
        {undo !== null && !busy && <span className="text-[12px] text-ink-muted">Rewritten by AI — read it over before you save.</span>}
      </div>
    </div>
  );
}

/** One clickable suggestion: "+ cotton". */
function Chip({ children, onClick, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex items-center gap-1 h-6 px-2 rounded-full border border-dashed border-accent/50 bg-accent-soft/40 text-[12px] text-ink cursor-pointer hover:bg-accent-soft hover:border-accent transition-colors"
    >
      {children}
    </button>
  );
}

/** "Ready to sell": what's done and what's missing, at a glance. */
function ReadyChecklist({ checks }) {
  const done = checks.filter((c) => c.ok).length;
  return (
    <Card size="small" title="Ready to sell?">
      <Progress percent={Math.round((done / checks.length) * 100)} size="small" showInfo={false} strokeColor="var(--color-accent, #5B3FE0)" />
      <ul className="list-none m-0 mt-2 p-0 flex flex-col gap-1.5">
        {checks.map((c) => (
          <li key={c.label} className="flex items-start gap-2 text-[13px]">
            {c.ok ? <CheckCircle2 size={15} className="text-status-success shrink-0 mt-[2px]" aria-hidden="true" /> : <Circle size={15} className="text-ink-subtle shrink-0 mt-[2px]" aria-hidden="true" />}
            <span className={c.ok ? "text-ink-muted" : "text-ink"}>
              {c.label}
              {!c.ok && c.hint ? <span className="block text-[12px] text-ink-muted">{c.hint}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** `template` (Duplicate): a product whose details pre-fill a new one. */
export function ProductForm({ product, store, template, justCreated = false }) {
  const router = useRouter();
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(Boolean(template));
  const [saved, setSaved] = useState(justCreated ? "created" : null);
  const source = product || template;
  const [images, setImages] = useState(
    source ? source.images.map((img) => ({ uid: img.id, url: img.url })) : []
  );
  const [uploading, setUploading] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [seoOpen, setSeoOpen] = useState(Boolean(source?.seoTitle || source?.seoDescription));
  const [brands, setBrands] = useState([]);
  const [categories, setCategories] = useState([]);
  const [storeTags, setStoreTags] = useState([]);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [suggesting, setSuggesting] = useState(false);
  const lastSuggested = useRef(null);
  const [form] = Form.useForm();
  const { apps } = useApps();
  const hasApp = (key) => Boolean(apps?.some((a) => a.key === key && a.installed));
  const rentalRef = useRef(null);
  const [rentalOn, setRentalOn] = useState(false);
  const seoTitle = Form.useWatch("seoTitle", form);
  const seoDescription = Form.useWatch("seoDescription", form);
  const title = Form.useWatch("title", form);
  const description = Form.useWatch("description", form);
  const categoryId = Form.useWatch("categoryId", form);
  const tags = Form.useWatch("tags", form) || [];
  const status = Form.useWatch("status", form);
  const variants = Form.useWatch("variants", { form, preserve: true }) || [];
  const isEdit = Boolean(product);
  // One variant called "Default" is a product without options: show plain
  // price and stock fields instead of a variant list.
  const simple = variants.length <= 1 && ["", "default"].includes(String(variants[0]?.title || "").trim().toLowerCase());

  useEffect(() => {
    apiFetch("/api/brands?pageSize=100").then((data) => setBrands(data.brands));
    apiFetch("/api/categories?pageSize=100").then((data) => setCategories(data.categories));
    apiFetch("/api/products/tags")
      .then((data) => {
        setStoreTags(data.tags.map((t) => t.tag));
        setAiAvailable(Boolean(data.aiAvailable));
      })
      .catch(() => {});
  }, []);

  const initialValues = source
    ? {
        title: template ? `Copy of ${template.title}` : source.title,
        description: source.description,
        status: template ? "draft" : source.status,
        vendor: source.vendor,
        productType: source.productType,
        brandId: source.brandId,
        categoryId: source.categoryId,
        tags: splitTags(source.tags),
        seoTitle: template ? undefined : source.seoTitle,
        seoDescription: source.seoDescription,
        hsnCode: source.hsnCode,
        metafields: source.metafields || {},
        templateSuffix: source.templateSuffix || null,
        hiddenChannels: source.hiddenChannels || [],
        googleCategory: source.googleCategory || null,
        // A copy gets new variants (no ids) and no SKUs — those must stay unique.
        variants: source.variants.map((v) => ({
          id: template ? undefined : v.id,
          title: v.title,
          sku: template ? undefined : v.sku,
          price: Number(v.price),
          comparePrice: v.comparePrice ? Number(v.comparePrice) : undefined,
          inventoryQuantity: template ? 0 : v.inventoryQuantity,
        })),
      }
    : {
        status: "draft",
        tags: [],
        templateSuffix: null,
        hiddenChannels: [],
        variants: [{ title: "Default", price: undefined, inventoryQuantity: 0 }],
      };

  /** What the AI needs to know about the product right now. */
  const facts = () => {
    const v = form.getFieldsValue(["title", "productType", "categoryId", "brandId"]);
    return {
      title: v.title || "",
      productType: v.productType || null,
      category: categories.find((c) => c.id === v.categoryId)?.title || null,
      brand: brands.find((b) => b.id === v.brandId)?.title || null,
      tags: form.getFieldValue("tags") || [],
    };
  };

  /** Category and tag ideas for the current title (AI when it's on). Runs
   * once per title when the title box is left, or on demand. */
  async function suggest({ force = false } = {}) {
    const t = String(form.getFieldValue("title") || "").trim();
    if (!t || (!force && lastSuggested.current === t)) return;
    lastSuggested.current = t;
    setSuggesting(true);
    try {
      setSuggestions(await apiFetch("/api/products/ai/suggest", { method: "POST", body: { ...facts(), description: form.getFieldValue("description") || "" } }));
    } catch (err) {
      if (force) message.error(err.message || "Couldn't get suggestions");
    } finally {
      setSuggesting(false);
    }
  }

  function addTags(list) {
    const current = form.getFieldValue("tags") || [];
    form.setFieldValue("tags", [...new Set([...current, ...list.map((t) => t.toLowerCase())])]);
    setDirty(true);
  }

  async function createSuggestedCategory(name) {
    try {
      const { category } = await apiFetch("/api/categories", { method: "POST", body: { title: name } });
      setCategories((list) => [...list, category]);
      form.setFieldValue("categoryId", category.id);
      setDirty(true);
      message.success(`Category “${category.title}” created`);
    } catch (err) {
      message.error(err.message || "Couldn't create the category");
    }
  }

  async function handleImageUpload(file) {
    setUploading(true);
    try {
      const uploaded = await uploadImage(file);
      setImages((prev) => [...prev, { uid: uploaded.id, url: uploaded.url }]);
      setDirty(true); // images live outside the form's own values
    } catch (err) {
      message.error(err.message);
    } finally {
      setUploading(false);
    }
    return false; // stop antd's own XHR upload — we already uploaded via uploadImage
  }

  function removeImage(uid) {
    setImages((prev) => prev.filter((img) => img.uid !== uid));
    setDirty(true);
  }

  async function handleSubmit(values) {
    const rentalProblem = rentalRef.current?.problem();
    if (rentalProblem) {
      message.error(rentalProblem);
      document.getElementById("rental")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSaving(true);
    try {
      // Stock is only sent when it was changed here — otherwise the save
      // would overwrite any sales made while this page was open.
      const loadedStock = Object.fromEntries((product?.variants || []).map((v) => [v.id, v.inventoryQuantity]));
      const variantsOut = (values.variants || []).map((v) => ({
        ...v,
        title: String(v.title || "").trim() || "Default",
        price: v.price ?? 0,
        inventoryQuantity: v.id && loadedStock[v.id] === v.inventoryQuantity ? undefined : v.inventoryQuantity,
      }));
      const payload = {
        ...values,
        tags: (values.tags || []).join(", ") || null,
        variants: variantsOut,
        metafields: metafieldPayload(values.metafields),
        images: images.map((img) => ({ url: img.url })),
      };
      if (isEdit) {
        await apiFetch(`/api/products/${product.id}`, { method: "PATCH", body: payload });
        await rentalRef.current?.save(product.id);
        // Stay on the product: the panel offers what's next.
        setDirty(false);
        setSaved("saved");
        router.refresh();
      } else {
        const { product: created } = await apiFetch("/api/products", { method: "POST", body: payload });
        try {
          await rentalRef.current?.save(created.id);
        } catch (err) {
          message.error(`Product saved, but the rental settings weren't: ${err.message}`);
        }
        setDirty(false);
        router.replace(`/admin/products/${created.id}?saved=new`);
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      message.error(err.message || "Couldn't save the product");
    } finally {
      setSaving(false);
    }
  }

  /** Replaces the variant list with one row per option combination,
   * keeping id, price and stock for titles that already exist. */
  function applyVariantTitles(titles) {
    const current = form.getFieldValue("variants") || [];
    const byTitle = Object.fromEntries(current.map((v) => [String(v.title || "").trim().toLowerCase(), v]));
    const base = current[0] || { price: 0 };
    form.setFieldValue(
      "variants",
      titles.map((t) => byTitle[t.toLowerCase()] || { title: t, price: base.price, comparePrice: base.comparePrice, inventoryQuantity: 0 })
    );
    setDirty(true);
  }

  const previewTitle = seoTitle || title || "Product title";
  const previewDescription = seoDescription || String(description || "").slice(0, 160) || "A short description of this product will appear here.";
  const suggestedCategory = suggestions?.category && suggestions.category.id !== categoryId ? suggestions.category : null;
  const suggestedTags = (suggestions?.tags || []).filter((t) => !tags.includes(t)).slice(0, 8);
  const popularTags = (suggestions?.popularTags || storeTags).filter((t) => !tags.includes(t) && !suggestedTags.includes(t)).slice(0, 6);
  const hasPrice = rentalOn || variants.some((v) => Number(v?.price) > 0);

  const checks = [
    { label: "A clear title", ok: String(title || "").trim().length >= 3 },
    { label: "At least one photo", ok: images.length > 0, hint: "Products with photos sell far better." },
    { label: "A price", ok: hasPrice },
    { label: "A description", ok: String(description || "").trim().length >= 40, hint: aiAvailable ? "Write a few words, then “Write with AI”." : "A few lines on what it is and why it's great." },
    { label: "A category", ok: Boolean(categoryId), hint: "Helps shoppers filter and find it." },
    { label: "Set to Active", ok: status === "active", hint: "Drafts aren't shown on your store." },
  ];

  return (
    <div>
      <PageHeader
        title={isEdit ? product.title : "Add product"}
        backHref="/admin/products"
        meta={isEdit ? <StatusBadge status={product.status} /> : null}
        actions={
          isEdit ? (
            <div className="flex gap-2">
              <Link href={`/admin/products/new?from=${product.id}`}>
                <Button icon={<Copy size={14} aria-hidden="true" />}>Duplicate</Button>
              </Link>
              {store && product.status === "active" && (
                <Button href={`${storefrontUrlFor(store)}/products/${product.slug}`} target="_blank" icon={<ExternalLink size={14} aria-hidden="true" />}>
                  View on store
                </Button>
              )}
            </div>
          ) : null
        }
      />

      {isEdit && saved && !dirty && (
        <SavedPanel
          title={saved === "created" ? "Product added" : "Changes saved"}
          detail={product.status === "active" ? "It's live on your store." : "It's a draft — set Status to Active to show it on your store."}
          viewUrl={store && product.status === "active" ? `${storefrontUrlFor(store)}/products/${product.slug}` : null}
          duplicateHref={`/admin/products/new?from=${product.id}`}
          addHref="/admin/products/new"
          addLabel="Add another product"
          onClose={() => setSaved(null)}
        />
      )}

      <Form form={form} layout="vertical" initialValues={initialValues} onFinish={handleSubmit} onValuesChange={() => setDirty(true)} requiredMark={false}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6">
            <Card size="small" title="Name & description">
              <Form.Item name="title" label="Product name" rules={[{ required: true, message: "Give the product a name" }]} extra="What shoppers see first — e.g. “Cotton block-print kurta, indigo”.">
                <Input size="large" placeholder="Cotton block-print kurta" onBlur={() => suggest()} />
              </Form.Item>
              <DescriptionField form={form} aiAvailable={aiAvailable} getFacts={facts} onChanged={() => setDirty(true)} />
            </Card>

            <Card size="small" title="Photos" extra={<span className="text-[12px] text-ink-muted">The first photo is the main one</span>}>
              <Upload
                listType="picture-card"
                fileList={images.map((img) => ({ uid: img.uid, url: img.url, status: "done", name: "image" }))}
                beforeUpload={handleImageUpload}
                onRemove={(file) => removeImage(file.uid)}
                accept={IMAGE_ACCEPT}
              >
                {images.length < MAX_IMAGES && (
                  <div className="flex flex-col items-center text-xs text-ink-muted">
                    <UploadCloud size={18} aria-hidden="true" />
                    <span className="mt-1">{uploading ? "Uploading…" : "Add photo"}</span>
                  </div>
                )}
              </Upload>
              <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                <p className="text-xs text-ink-muted m-0">JPEG, PNG, WebP or GIF — up to 8MB each, {MAX_IMAGES} photos. Square photos look best.</p>
                {images.length < MAX_IMAGES && (
                  <Button size="small" icon={<Images size={13} aria-hidden="true" />} onClick={() => setLibraryOpen(true)}>
                    Choose from Files
                  </Button>
                )}
              </div>
              <MediaLibraryModal
                open={libraryOpen}
                multiple
                max={MAX_IMAGES - images.length}
                onClose={() => setLibraryOpen(false)}
                onSelect={(urls) => {
                  setImages((list) => [...list, ...urls.map((url) => ({ uid: `lib-${url}-${Math.random().toString(36).slice(2)}`, url }))]);
                  setDirty(true);
                }}
              />
            </Card>

            {simple ? (
              <Card size="small" title="Price & stock">
                <Form.Item name={["variants", 0, "id"]} hidden>
                  <Input />
                </Form.Item>
                <Form.Item name={["variants", 0, "title"]} hidden>
                  <Input />
                </Form.Item>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                  <Form.Item name={["variants", 0, "price"]} label="Selling price" rules={[{ required: !rentalOn, message: "Enter the price" }]} extra={rentalOn ? "Not used while it's rented out — the rent per day below is." : "What the shopper pays, including GST."}>
                    <InputNumber min={0} className="w-full" prefix="₹" placeholder="999" />
                  </Form.Item>
                  <Form.Item
                    name={["variants", 0, "comparePrice"]}
                    label="MRP (optional)"
                    extra="Shown struck through when it's higher than the price."
                    dependencies={[["variants", 0, "price"]]}
                    rules={[
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          const price = getFieldValue(["variants", 0, "price"]);
                          return value == null || value === "" || Number(value) > Number(price || 0) ? Promise.resolve() : Promise.reject(new Error("MRP should be higher than the price"));
                        },
                      }),
                    ]}
                  >
                    <InputNumber min={0} className="w-full" prefix="₹" placeholder="1,299" />
                  </Form.Item>
                  <Form.Item name={["variants", 0, "inventoryQuantity"]} label="In stock" extra="How many you can sell. It goes down with every order.">
                    <InputNumber min={0} className="w-full" placeholder="0" />
                  </Form.Item>
                  <Form.Item name={["variants", 0, "sku"]} label="SKU (optional)" extra="Your own code for this item, if you use one.">
                    <Input placeholder="KUR-IND-01" />
                  </Form.Item>
                </div>
                <div className="rounded-[10px] border border-dashed border-app-border bg-app-bg px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] text-ink">
                    <Layers size={14} className="inline -mt-0.5 mr-1.5 text-ink-muted" aria-hidden="true" />
                    Does it come in different sizes or colours?
                  </span>
                  <Button size="small" icon={<Wand2 size={13} aria-hidden="true" />} onClick={() => setOptionsOpen(true)}>
                    Add sizes & colours
                  </Button>
                </div>
              </Card>
            ) : (
              <Card size="small" title="Variants" extra={<span className="text-[12px] text-ink-muted">One row per size / colour combination</span>}>
                <Form.List name="variants">
                  {(fields, { add, remove }) => (
                    <div className="flex flex-col gap-4">
                      {fields.map(({ key, name, ...restField }) => (
                        <div key={key} className="border border-app-border rounded-md p-3">
                          <Form.Item {...restField} name={[name, "id"]} hidden>
                            <Input />
                          </Form.Item>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            <Form.Item {...restField} name={[name, "title"]} label="Option" className="mb-0">
                              <Input placeholder="M / Black" />
                            </Form.Item>
                            <Form.Item {...restField} name={[name, "price"]} label="Price" className="mb-0" rules={[{ required: !rentalOn, message: "Required" }]}>
                              <InputNumber min={0} className="w-full" prefix="₹" />
                            </Form.Item>
                            <Form.Item {...restField} name={[name, "comparePrice"]} label="MRP" className="mb-0">
                              <InputNumber min={0} className="w-full" prefix="₹" />
                            </Form.Item>
                            <Form.Item {...restField} name={[name, "inventoryQuantity"]} label="In stock" className="mb-0">
                              <InputNumber min={0} className="w-full" />
                            </Form.Item>
                            <Form.Item {...restField} name={[name, "sku"]} label="SKU" className="mb-0">
                              <Input />
                            </Form.Item>
                          </div>
                          {fields.length > 1 && (
                            <Button type="text" danger size="small" className="mt-2" icon={<Trash2 size={14} aria-hidden="true" />} onClick={() => remove(name)}>
                              Remove
                            </Button>
                          )}
                        </div>
                      ))}
                      <div className="flex flex-wrap gap-2">
                        <Button icon={<Wand2 size={14} aria-hidden="true" />} onClick={() => setOptionsOpen(true)}>
                          Create from sizes & colours
                        </Button>
                        <Button type="dashed" icon={<Plus size={14} aria-hidden="true" />} onClick={() => add({ title: "", price: variants[0]?.price ?? 0, inventoryQuantity: 0 })}>
                          Add one variant
                        </Button>
                      </div>
                    </div>
                  )}
                </Form.List>
              </Card>
            )}
            <VariantOptionsModal open={optionsOpen} onClose={() => setOptionsOpen(false)} onApply={applyVariantTitles} />

            {hasApp("rentals") && <RentalProductCard ref={rentalRef} productId={isEdit ? product.id : null} onEnabled={setRentalOn} onChange={() => setDirty(true)} />}

            <CustomDataFields ownerType="product" />

            <Card
              size="small"
              title="Search engine listing"
              extra={
                <Button size="small" type="link" onClick={() => setSeoOpen((v) => !v)}>
                  {seoOpen ? "Hide" : "Edit"}
                </Button>
              }
            >
              <p className="text-xs text-ink-muted mt-0 mb-2">How this product can look in Google. We use the name and description unless you write your own.</p>
              <div className="border border-app-border rounded-md p-3 bg-app-bg">
                <p className="text-[#1a0dab] text-base m-0 truncate">{previewTitle}</p>
                <p className="text-[#006621] text-xs m-0 truncate">
                  {store ? storefrontLabelFor(store) : "your-store"}/products/{product?.slug || "…"}
                </p>
                <p className="text-sm text-ink-muted mt-1 mb-0 line-clamp-2">{previewDescription}</p>
              </div>
              <div className={seoOpen ? "mt-4" : "hidden"}>
                <Form.Item name="seoTitle" label="Page title" extra="Up to about 60 characters.">
                  <Input maxLength={120} showCount placeholder={title || ""} />
                </Form.Item>
                <Form.Item name="seoDescription" label="Meta description" className="mb-0" extra="Up to about 160 characters.">
                  <Input.TextArea rows={2} maxLength={320} showCount />
                </Form.Item>
              </div>
            </Card>
          </div>

          <div className="flex flex-col gap-6">
            <Card size="small" title="Status">
              <Form.Item name="status" className="mb-1">
                <Select options={STATUS_OPTIONS} />
              </Form.Item>
              <p className="text-[12px] text-ink-muted m-0">
                {status === "active" ? "Shown on your store." : status === "archived" ? "Hidden and kept for your records." : "Only you can see it — set Active when it's ready."}
              </p>
            </Card>

            <Card
              size="small"
              title="Organise"
              extra={
                <Button size="small" type="text" loading={suggesting} icon={<Sparkles size={13} aria-hidden="true" className="text-accent" />} onClick={() => suggest({ force: true })} disabled={!String(title || "").trim()}>
                  Suggest
                </Button>
              }
            >
              <Form.Item name="categoryId" label="Category" className={suggestedCategory || suggestions?.newCategory ? "mb-1.5" : undefined}>
                <Select allowClear showSearch placeholder="Choose a category" optionFilterProp="label" options={categories.map((c) => ({ value: c.id, label: c.title }))} />
              </Form.Item>
              {suggestedCategory ? (
                <div className="flex flex-wrap items-center gap-1.5 mb-4 text-[12px] text-ink-muted">
                  Suggested:
                  <Chip
                    onClick={() => {
                      form.setFieldValue("categoryId", suggestedCategory.id);
                      setDirty(true);
                    }}
                  >
                    {suggestedCategory.title}
                  </Chip>
                </div>
              ) : !categoryId && suggestions?.newCategory ? (
                <div className="flex flex-wrap items-center gap-1.5 mb-4 text-[12px] text-ink-muted">
                  Suggested new category:
                  <Chip onClick={() => createSuggestedCategory(suggestions.newCategory)} title="Create this category and use it">
                    <Plus size={11} aria-hidden="true" /> {suggestions.newCategory}
                  </Chip>
                </div>
              ) : null}

              <Form.Item name="tags" label="Tags" className="mb-1.5" extra={tags.length ? null : "Words shoppers search or filter by — fabric, occasion, colour."}>
                <Select
                  mode="tags"
                  tokenSeparators={[","]}
                  placeholder="e.g. cotton, festive, summer"
                  options={storeTags.map((t) => ({ value: t, label: t }))}
                  onChange={(v) => form.setFieldValue("tags", [...new Set(v.map((t) => String(t).trim().toLowerCase()).filter(Boolean))])}
                  suffixIcon={<TagIcon size={13} aria-hidden="true" />}
                />
              </Form.Item>
              {(suggestedTags.length > 0 || popularTags.length > 0) && (
                <div className="mb-4">
                  {suggestedTags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-muted">
                      {suggestions?.source === "ai" ? "AI suggests:" : "Suggested:"}
                      {suggestedTags.map((t) => (
                        <Chip key={t} onClick={() => addTags([t])}>
                          <Plus size={11} aria-hidden="true" /> {t}
                        </Chip>
                      ))}
                      {suggestedTags.length > 1 && (
                        <button type="button" className="text-[12px] text-accent bg-transparent border-0 cursor-pointer p-0 ml-1" onClick={() => addTags(suggestedTags)}>
                          Add all
                        </button>
                      )}
                    </div>
                  )}
                  {popularTags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-muted mt-1.5">
                      Your tags:
                      {popularTags.map((t) => (
                        <Chip key={t} onClick={() => addTags([t])}>
                          <Plus size={11} aria-hidden="true" /> {t}
                        </Chip>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <Form.Item name="brandId" label="Brand">
                <Select allowClear showSearch placeholder="Choose a brand" optionFilterProp="label" options={brands.map((b) => ({ value: b.id, label: b.title }))} />
              </Form.Item>
              <div className="grid grid-cols-2 gap-x-3">
                <Form.Item name="productType" label="Type" className="mb-0" tooltip="Your own grouping, e.g. Kurta, Saree.">
                  <Input placeholder="Kurta" />
                </Form.Item>
                <Form.Item name="vendor" label="Supplier" className="mb-0" tooltip="Who makes or supplies it. Only you see this.">
                  <Input />
                </Form.Item>
              </div>
            </Card>

            <ReadyChecklist checks={checks} />

            <SalesChannelsCard installed={hasApp} onChange={() => setDirty(true)} />

            <Card size="small" title="Layout">
              <ThemeTemplateField
                kind="product"
                hint={rentalOn ? "Rented products use the Rental product layout unless you pick another." : "A different product page layout made in the theme editor."}
              />
            </Card>

            <Card size="small" title="GST">
              <Form.Item
                name="hsnCode"
                label="HSN code"
                className="mb-0"
                extra="Printed on GST invoices. 4–8 digits, e.g. 6109 for cotton T-shirts."
                rules={[{ pattern: /^\d{4,8}$/, message: "HSN codes are 4 to 8 digits" }]}
              >
                <Input inputMode="numeric" placeholder="6109" />
              </Form.Item>
            </Card>
          </div>
        </div>

        {/* Sticky action bar, per the "sticky action areas" pattern used across the admin. */}
        <SaveBar
          dirty={dirty}
          isNew={!isEdit}
          saving={saving}
          saveLabel={isEdit ? "Save" : "Add product"}
          onDiscard={() => router.push("/admin/products")}
        />
      </Form>
    </div>
  );
}

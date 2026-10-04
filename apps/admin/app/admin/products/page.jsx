"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, Button, Dropdown, App, Select, InputNumber, Popover, Checkbox, Tag, Badge } from "antd";
import { Plus, Package, Search, Upload, Download, ChevronDown, X, SlidersHorizontal, Columns3 } from "lucide-react";
import { PageHeader, StatusBadge, EmptyState, ListCard, Thumb, SearchInput, DeleteIconButton, useConfirmDialog } from "@shopcycle/ui";
import { formatCurrency } from "@shopcycle/utils";
import { apiFetch, apiDownload } from "@/lib/api";
import { ProductImportModal } from "@/components/ProductImportModal";

const TABS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "draft", label: "Draft" },
  { key: "archived", label: "Archived" },
];

const LOW_STOCK = 5;

function Inventory({ variants }) {
  const qty = variants.reduce((sum, v) => sum + v.inventoryQuantity, 0);
  const across = variants.length > 1 ? ` · ${variants.length} variants` : "";
  if (qty <= 0) return <span className="text-status-danger text-[13px]">Out of stock{across}</span>;
  if (qty <= LOW_STOCK) return <span className="text-status-warning text-[13px]">{qty} left{across}</span>;
  return (
    <span className="text-[13px] text-ink tabular-nums">
      {qty} in stock<span className="text-ink-muted">{across}</span>
    </span>
  );
}

const STOCK = [
  { value: "in", label: "In stock" },
  { value: "low", label: "Low stock (5 or fewer)" },
  { value: "out", label: "Out of stock" },
];
const CHANNEL = [
  { value: "rental", label: "Rented by the day" },
  { value: "hidden-google", label: "Hidden from Google" },
  { value: "hidden-facebook", label: "Hidden from Facebook & Instagram" },
];
const SORTS = [
  { value: "updated", label: "Last updated" },
  { value: "created", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "title", label: "Title A–Z" },
  { value: "title-desc", label: "Title Z–A" },
];
// Optional columns, chosen from "Columns" (remembered in this browser).
const OPTIONAL = [
  { key: "inventory", label: "Inventory" },
  { key: "price", label: "Price" },
  { key: "sold", label: "Sold (30 days)" },
  { key: "category", label: "Category" },
  { key: "brand", label: "Brand" },
  { key: "collections", label: "Collections" },
  { key: "sku", label: "SKU" },
  { key: "variants", label: "Variants" },
  { key: "type", label: "Type" },
  { key: "vendor", label: "Vendor" },
  { key: "created", label: "Created" },
  { key: "updated", label: "Updated" },
];
const DEFAULT_COLUMNS = ["inventory", "price", "sold", "category", "sku"];
const COLUMNS_KEY = "oy:products:columns";
const NO_FILTERS = { categoryId: undefined, brandId: undefined, collectionId: undefined, stock: undefined, productType: undefined, vendor: undefined, channel: undefined, priceMin: null, priceMax: null };
const day = (iso) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");

function readColumns() {
  try {
    const saved = JSON.parse(localStorage.getItem(COLUMNS_KEY) || "null");
    return Array.isArray(saved) ? saved.filter((k) => OPTIONAL.some((c) => c.key === k)) : DEFAULT_COLUMNS;
  } catch {
    return DEFAULT_COLUMNS;
  }
}

function priceLabel(variants) {
  if (!variants.length) return "—";
  const prices = variants.map((v) => Number(v.price));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatCurrency(min) : `${formatCurrency(min)} – ${formatCurrency(max)}`;
}

export default function ProductsPage() {
  const router = useRouter();
  const { confirmDialog } = useConfirmDialog();

  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);
  const [importOpen, setImportOpen] = useState(false);
  const [selected, setSelected] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [filters, setFilters] = useState(NO_FILTERS);
  const [sort, setSort] = useState("updated");
  const [shown, setShown] = useState(DEFAULT_COLUMNS);
  const [options, setOptions] = useState({ categories: [], brands: [], collections: [], productTypes: [], vendors: [] });
  const { message } = App.useApp();
  const pageSize = 20;

  useEffect(() => {
    setShown(readColumns());
    // Filter choices; the list still works if any of these fail.
    Promise.all([
      apiFetch("/api/categories?pageSize=100").catch(() => ({ categories: [] })),
      apiFetch("/api/brands?pageSize=100").catch(() => ({ brands: [] })),
      apiFetch("/api/collections?pageSize=100").catch(() => ({ collections: [] })),
      apiFetch("/api/products/facets").catch(() => ({ productTypes: [], vendors: [] })),
    ]).then(([c, b, col, f]) => setOptions({ categories: c.categories || [], brands: b.brands || [], collections: col.collections || [], productTypes: f.productTypes || [], vendors: f.vendors || [] }));
  }, []);

  function setFilter(key, value) {
    setPage(1);
    setFilters((cur) => ({ ...cur, [key]: value ?? undefined }));
  }

  function toggleColumn(key, on) {
    const next = on ? OPTIONAL.map((c) => c.key).filter((k) => k === key || shown.includes(k)) : shown.filter((k) => k !== key);
    setShown(next);
    try {
      localStorage.setItem(COLUMNS_KEY, JSON.stringify(next));
    } catch {
      // Private window — the choice lasts this visit.
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort });
      if (q) params.set("q", q);
      if (tab !== "all") params.set("status", tab);
      for (const [k, v] of Object.entries(filters)) if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
      const data = await apiFetch(`/api/products?${params.toString()}`);
      setProducts(data.products);
      setTotal(data.total);
      setSelected([]);
    } catch (err) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [q, tab, page, filters, sort, message]);

  useEffect(() => {
    load();
  }, [load]);

  function handleDelete(product) {
    confirmDialog({
      title: `Delete "${product.title}"?`,
      description: "This can't be undone.",
      okText: "Delete",
      danger: true,
      onConfirm: async () => {
        await apiFetch(`/api/products/${product.id}`, { method: "DELETE" });
        load();
      },
    });
  }

  async function runBulk(action) {
    setBulkBusy(true);
    try {
      const { count } = await apiFetch("/api/products/bulk", { method: "POST", body: { ids: selected, action } });
      const verb = { activate: "set to active", draft: "set to draft", archive: "archived", delete: "deleted" }[action];
      message.success(`${count} ${count === 1 ? "product" : "products"} ${verb}`);
      load();
    } catch (err) {
      message.error(err.message);
    } finally {
      setBulkBusy(false);
    }
  }

  function bulkDelete() {
    confirmDialog({
      title: `Delete ${selected.length} ${selected.length === 1 ? "product" : "products"}?`,
      description: "They come off your store and out of shoppers' carts. Past orders keep their line items. This can't be undone.",
      okText: "Delete",
      danger: true,
      onConfirm: () => runBulk("delete"),
    });
  }

  const columns = [
    {
      title: "Product",
      dataIndex: "title",
      render: (title, row) => (
        <div className="flex items-center gap-3 min-w-0">
          <Thumb src={row.images?.[0]?.url} alt="" />
          <div className="min-w-0">
            <Link
              href={`/admin/products/${row.id}`}
              className="font-medium text-ink hover:underline block truncate"
              onClick={(e) => e.stopPropagation()}
            >
              {title}
            </Link>
            {(row.productType || row.vendor) && (
              <span className="text-xs text-ink-muted truncate block">
                {[row.productType, row.vendor].filter(Boolean).join(" · ")}
              </span>
            )}
          </div>
        </div>
      ),
    },
    { title: "Status", dataIndex: "status", width: 110, render: (s) => <StatusBadge status={s} /> },
    ...[
      { key: "inventory", title: "Inventory", width: 190, render: (_, row) => <Inventory variants={row.variants} /> },
      { key: "price", title: "Price", width: 150, align: "right", render: (_, row) => <span className="tabular-nums">{priceLabel(row.variants)}</span> },
      { key: "sold", title: "Sold (30d)", width: 100, align: "right", render: (_, row) => <span className="tabular-nums">{row.sold30 || 0}</span> },
      { key: "category", title: "Category", width: 140, render: (_, row) => row.category?.title || <span className="text-ink-subtle">—</span> },
      { key: "brand", title: "Brand", width: 130, render: (_, row) => row.brand?.title || <span className="text-ink-subtle">—</span> },
      {
        key: "collections",
        title: "Collections",
        width: 200,
        render: (_, row) =>
          row.collections?.length ? (
            <span className="flex flex-wrap gap-1">
              {row.collections.slice(0, 2).map((c) => (
                <Tag key={c.id} className="!m-0">
                  {c.title}
                </Tag>
              ))}
              {row.collections.length > 2 && <span className="text-xs text-ink-muted">+{row.collections.length - 2}</span>}
            </span>
          ) : (
            <span className="text-ink-subtle">—</span>
          ),
      },
      {
        key: "sku",
        title: "SKU",
        width: 140,
        render: (_, row) => {
          const skus = row.variants.map((v) => v.sku).filter(Boolean);
          return skus.length ? <span className="font-mono text-[12px]">{skus[0]}{skus.length > 1 ? ` +${skus.length - 1}` : ""}</span> : <span className="text-ink-subtle">—</span>;
        },
      },
      { key: "variants", title: "Variants", width: 90, align: "right", render: (_, row) => <span className="tabular-nums">{row.variants.length}</span> },
      { key: "type", title: "Type", width: 120, render: (_, row) => row.productType || <span className="text-ink-subtle">—</span> },
      { key: "vendor", title: "Vendor", width: 120, render: (_, row) => row.vendor || <span className="text-ink-subtle">—</span> },
      { key: "created", title: "Created", width: 120, render: (_, row) => <span className="text-[13px]">{day(row.createdAt)}</span> },
      { key: "updated", title: "Updated", width: 120, render: (_, row) => <span className="text-[13px]">{day(row.updatedAt)}</span> },
    ].filter((c) => shown.includes(c.key)),
    {
      title: "",
      width: 56,
      align: "right",
      render: (_, row) => <DeleteIconButton label={`Delete ${row.title}`} onClick={() => handleDelete(row)} />,
    },
  ];

  const activeFilters = Object.values(filters).filter((v) => v !== undefined && v !== null && v !== "").length;
  const filtered = Boolean(q) || tab !== "all" || activeFilters > 0;
  const selectProps = { allowClear: true, size: "middle", popupMatchSelectWidth: false, showSearch: true, optionFilterProp: "label" };

  const filterPanel = (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-[min(560px,86vw)]">
      <label className="flex flex-col gap-1 text-xs text-ink-muted">
        Category
        <Select {...selectProps} placeholder="Any" value={filters.categoryId} onChange={(v) => setFilter("categoryId", v)} options={options.categories.map((c) => ({ value: c.id, label: c.title }))} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-muted">
        Brand
        <Select {...selectProps} placeholder="Any" value={filters.brandId} onChange={(v) => setFilter("brandId", v)} options={options.brands.map((b) => ({ value: b.id, label: b.title }))} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-muted">
        Collection
        <Select {...selectProps} placeholder="Any" value={filters.collectionId} onChange={(v) => setFilter("collectionId", v)} options={options.collections.map((c) => ({ value: c.id, label: c.title }))} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-muted">
        Stock
        <Select {...selectProps} showSearch={false} placeholder="Any" value={filters.stock} onChange={(v) => setFilter("stock", v)} options={STOCK} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-muted">
        Type
        <Select {...selectProps} placeholder="Any" value={filters.productType} onChange={(v) => setFilter("productType", v)} options={options.productTypes.map((t) => ({ value: t, label: t }))} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-muted">
        Vendor
        <Select {...selectProps} placeholder="Any" value={filters.vendor} onChange={(v) => setFilter("vendor", v)} options={options.vendors.map((t) => ({ value: t, label: t }))} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-muted">
        Price (₹)
        <span className="flex items-center gap-2">
          <InputNumber className="!w-full" min={0} placeholder="Min" value={filters.priceMin} onChange={(v) => setFilter("priceMin", v)} />
          <span aria-hidden="true">–</span>
          <InputNumber className="!w-full" min={0} placeholder="Max" value={filters.priceMax} onChange={(v) => setFilter("priceMax", v)} />
        </span>
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-muted">
        Selling
        <Select {...selectProps} showSearch={false} placeholder="Any" value={filters.channel} onChange={(v) => setFilter("channel", v)} options={CHANNEL} />
      </label>
      <div className="sm:col-span-2 flex justify-end">
        <Button size="small" type="text" disabled={!activeFilters} onClick={() => { setPage(1); setFilters(NO_FILTERS); }}>
          Clear filters
        </Button>
      </div>
    </div>
  );

  const columnPanel = (
    <div className="flex flex-col gap-1.5 min-w-[180px]">
      {OPTIONAL.map((c) => (
        <Checkbox key={c.key} checked={shown.includes(c.key)} onChange={(e) => toggleColumn(c.key, e.target.checked)}>
          {c.label}
        </Checkbox>
      ))}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle={loading ? " " : `${total} ${total === 1 ? "product" : "products"}${filtered ? " match" : ""}`}
        actions={
          <>
            <Dropdown
              trigger={["click"]}
              menu={{
                items: [
                  { key: "import", icon: <Upload size={14} />, label: "Import from CSV", onClick: () => setImportOpen(true) },
                  {
                    key: "export",
                    icon: <Download size={14} />,
                    label: "Export to CSV",
                    onClick: () => apiDownload("/api/data/exports/products", "products.csv").catch((err) => message.error(err.message)),
                  },
                ],
              }}
            >
              <Button>
                Import / export <ChevronDown size={14} aria-hidden="true" />
              </Button>
            </Dropdown>
            <Link href="/admin/products/new">
              <Button type="primary" icon={<Plus size={15} aria-hidden="true" />}>
                Add product
              </Button>
            </Link>
          </>
        }
      />
      <ProductImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={load} />

      <ListCard
        tabs={TABS}
        activeTab={tab}
        onTabChange={(key) => {
          setPage(1);
          setTab(key);
        }}
        toolbar={
          <div className="flex flex-wrap items-center gap-2 pb-2">
            <SearchInput
              placeholder="Search title, SKU, vendor, tag"
              onSearch={(v) => {
                setPage(1);
                setQ(v);
              }}
            />
            <Popover trigger="click" placement="bottomRight" content={filterPanel} title="Filter products">
              <Badge count={activeFilters} size="small" offset={[-4, 4]}>
                <Button icon={<SlidersHorizontal size={14} aria-hidden="true" />}>Filters</Button>
              </Badge>
            </Popover>
            <Select
              value={sort}
              onChange={(v) => {
                setPage(1);
                setSort(v);
              }}
              options={SORTS}
              className="w-[150px]"
              aria-label="Sort products"
            />
            <Popover trigger="click" placement="bottomRight" content={columnPanel} title="Columns">
              <Button icon={<Columns3 size={14} aria-hidden="true" />} aria-label="Choose columns">
                <span className="hidden sm:inline">Columns</span>
              </Button>
            </Popover>
          </div>
        }
      >
        {activeFilters > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-app-border text-[12.5px]">
            {[
              filters.categoryId && ["categoryId", `Category: ${options.categories.find((c) => c.id === filters.categoryId)?.title || "…"}`],
              filters.brandId && ["brandId", `Brand: ${options.brands.find((b) => b.id === filters.brandId)?.title || "…"}`],
              filters.collectionId && ["collectionId", `Collection: ${options.collections.find((c) => c.id === filters.collectionId)?.title || "…"}`],
              filters.stock && ["stock", STOCK.find((x) => x.value === filters.stock)?.label],
              filters.productType && ["productType", `Type: ${filters.productType}`],
              filters.vendor && ["vendor", `Vendor: ${filters.vendor}`],
              filters.priceMin != null && ["priceMin", `From ₹${filters.priceMin}`],
              filters.priceMax != null && ["priceMax", `Up to ₹${filters.priceMax}`],
              filters.channel && ["channel", CHANNEL.find((x) => x.value === filters.channel)?.label],
            ]
              .filter(Boolean)
              .map(([key, label]) => (
                <Tag key={key} closable className="!m-0" onClose={() => setFilter(key, key.startsWith("price") ? null : undefined)}>
                  {label}
                </Tag>
              ))}
          </div>
        )}
        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-app-border bg-accent-soft/60" role="region" aria-label="Bulk actions">
            <span className="text-sm font-medium text-ink mr-1 tabular-nums">{selected.length} selected</span>
            <Button size="small" loading={bulkBusy} onClick={() => runBulk("activate")}>
              Set active
            </Button>
            <Button size="small" loading={bulkBusy} onClick={() => runBulk("draft")}>
              Set draft
            </Button>
            <Button size="small" loading={bulkBusy} onClick={() => runBulk("archive")}>
              Archive
            </Button>
            <Button size="small" danger loading={bulkBusy} onClick={bulkDelete}>
              Delete
            </Button>
            <Button size="small" type="text" className="ml-auto" icon={<X size={14} aria-hidden="true" />} onClick={() => setSelected([])}>
              Clear
            </Button>
          </div>
        )}
        <Table
          rowKey="id"
          scroll={{ x: "max-content" }}
          loading={loading}
          rowSelection={{
            selectedRowKeys: selected,
            onChange: setSelected,
            columnWidth: 44,
            // Clicking the checkbox shouldn't also open the product.
            getCheckboxProps: () => ({ onClick: (e) => e.stopPropagation() }),
          }}
          columns={columns}
          dataSource={products}
          rowClassName="oy-row-link"
          onRow={(row) => ({ onClick: () => router.push(`/admin/products/${row.id}`) })}
          pagination={
            total > pageSize && { current: page, pageSize, total, onChange: setPage, showSizeChanger: false }
          }
          locale={{
            emptyText: filtered ? (
              <EmptyState
                icon={<Search />}
                title="No products match"
                description="Try a different search, another tab, or clear the filters."
              />
            ) : (
              <EmptyState
                icon={<Package />}
                title="Add your first product"
                description="Photos, a price, and a description are all a product needs to start selling."
                actionLabel="Add product"
                onAction={() => router.push("/admin/products/new")}
              />
            ),
          }}
        />
      </ListCard>
    </div>
  );
}

"use client";

import Link from "next/link";
import { AutoComplete, Card, Form, Switch } from "antd";
import { Store } from "lucide-react";
import { BrandGlyph } from "@/components/apps/AppTile";

// Common Google product categories for Indian stores (Google's taxonomy).
const GOOGLE_CATEGORIES = [
  "Apparel & Accessories > Clothing",
  "Apparel & Accessories > Clothing > Dresses",
  "Apparel & Accessories > Clothing > Shirts & Tops",
  "Apparel & Accessories > Clothing > Traditional & Ceremonial Clothing",
  "Apparel & Accessories > Clothing > Traditional & Ceremonial Clothing > Saris & Lehengas",
  "Apparel & Accessories > Jewelry",
  "Apparel & Accessories > Handbags, Wallets & Cases",
  "Apparel & Accessories > Shoes",
  "Health & Beauty > Personal Care > Cosmetics",
  "Health & Beauty > Personal Care > Cosmetics > Skin Care",
  "Food, Beverages & Tobacco > Food Items",
  "Food, Beverages & Tobacco > Food Items > Candy & Chocolate",
  "Food, Beverages & Tobacco > Food Items > Snack Foods",
  "Home & Garden > Decor",
  "Home & Garden > Kitchen & Dining",
  "Home & Garden > Linens & Bedding",
  "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts",
  "Baby & Toddler",
  "Toys & Games",
  "Electronics",
  "Sporting Goods",
  "Furniture",
];

const CHANNELS = [
  { key: "google", app: "google-shopping", name: "Google & YouTube" },
  { key: "facebook", app: "facebook-shop", name: "Facebook & Instagram" },
];

/**
 * Where a product is listed: the online store always, plus each sales
 * channel app the store has installed (on unless switched off here).
 * Form fields: hiddenChannels, googleCategory.
 */
const Keep = () => null; // holds the field's value; the switches below edit it

export function SalesChannelsCard({ installed, onChange }) {
  const form = Form.useFormInstance();
  const hidden = Form.useWatch("hiddenChannels", form) || [];
  const channels = CHANNELS.filter((c) => installed(c.app));
  if (!channels.length) return null;

  const toggle = (key, on) => {
    const next = on ? hidden.filter((k) => k !== key) : [...new Set([...hidden, key])];
    form.setFieldValue("hiddenChannels", next);
    onChange?.();
  };

  return (
    <Card size="small" title="Sales channels">
      <Form.Item name="hiddenChannels" hidden>
        <Keep />
      </Form.Item>
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2.5 text-[13px] text-ink">
          <span className="w-6 h-6 rounded-md bg-app-bg flex items-center justify-center">
            <Store size={13} aria-hidden="true" />
          </span>
          <span className="flex-1">Online store</span>
          <span className="text-[12px] text-ink-muted">Status above</span>
        </div>
        {channels.map((c) => (
          <label key={c.key} className="flex items-center gap-2.5 text-[13px] text-ink cursor-pointer">
            <span className="w-6 h-6 rounded-md bg-white border border-app-border flex items-center justify-center">
              <BrandGlyph app={{ key: c.app }} size={13} />
            </span>
            <Link href={`/admin/apps/${c.app}`} className="flex-1 text-ink no-underline hover:underline">
              {c.name}
            </Link>
            <Switch size="small" checked={!hidden.includes(c.key)} onChange={(on) => toggle(c.key, on)} aria-label={`List on ${c.name}`} />
          </label>
        ))}
      </div>
      {installed("google-shopping") && !hidden.includes("google") && (
        <Form.Item name="googleCategory" label="Google category" className="mb-0 mt-3" extra="Helps Google show it to the right shoppers.">
          <AutoComplete
            allowClear
            options={GOOGLE_CATEGORIES.map((v) => ({ value: v }))}
            filterOption={(input, option) => option.value.toLowerCase().includes(input.toLowerCase())}
            placeholder="e.g. Apparel & Accessories > Clothing"
          />
        </Form.Item>
      )}
    </Card>
  );
}

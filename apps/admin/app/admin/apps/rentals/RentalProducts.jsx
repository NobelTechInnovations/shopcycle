"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { App, Button, Card, Empty, Select, Skeleton, Tag } from "antd";
import { Plus, Pencil, ImageOff } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { rupees } from "./shared";

/** The products rented out, their rates and rules, and how to add one. */
export function RentalProducts() {
  const router = useRouter();
  const { message } = App.useApp();
  const [list, setList] = useState(null);
  const [all, setAll] = useState([]);
  const [pick, setPick] = useState(null);

  useEffect(() => {
    apiFetch("/api/rentals/products").then((d) => setList(d.products)).catch((err) => message.error(err.message));
    apiFetch("/api/products?pageSize=100").then((d) => setAll(d.products || [])).catch(() => {});
  }, [message]);

  if (!list) return <Skeleton active />;
  const rented = new Set(list.map((p) => p.productId));
  const choices = all.filter((p) => !rented.has(p.id)).map((p) => ({ value: p.id, label: p.title }));

  return (
    <div className="flex flex-col gap-4">
      <Card size="small">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] text-ink">Rent out a product:</span>
          <Select showSearch optionFilterProp="label" placeholder="Choose a product" className="min-w-[260px]" value={pick} onChange={setPick} options={choices} />
          <Button type="primary" icon={<Plus size={14} aria-hidden="true" />} disabled={!pick} onClick={() => router.push(`/admin/products/${pick}#rental`)}>
            Set rent
          </Button>
          <Link href="/admin/products/new#rental" className="text-[13px] ml-1">
            or add a new product
          </Link>
        </div>
        <p className="m-0 mt-2 text-[12.5px] text-ink-muted">
          On the product's page, turn on <b>Rent this product</b>. Its page then shows a booking calendar instead of Add to cart — the price you set for selling isn't used.
        </p>
      </Card>

      {list.length === 0 ? (
        <Empty description="No products are rented out yet." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map((p) => (
            <Card key={p.productId} size="small" className="h-full">
              <div className="flex gap-3">
                {p.image ? (
                  <img src={p.image} alt="" width={64} height={80} className="w-16 h-20 object-cover rounded-md border border-app-border shrink-0" />
                ) : (
                  <span className="w-16 h-20 rounded-md bg-app-bg flex items-center justify-center text-ink-subtle shrink-0">
                    <ImageOff size={18} aria-hidden="true" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[14px] font-medium text-ink truncate">{p.title}</p>
                  <p className="m-0 text-[15px] font-semibold text-ink">
                    {rupees(p.pricePerDay)} <span className="text-[12.5px] font-normal text-ink-muted">/ day</span>
                  </p>
                  {p.tiers.length > 0 && <p className="m-0 text-[12px] text-ink-muted">{p.tiers.map((t) => `${t.days}+ days ${rupees(t.price)}`).join(" · ")}</p>}
                  <p className="m-0 text-[12px] text-ink-muted">
                    {p.minDays}–{p.maxDays} days · {p.units} piece{p.units === 1 ? "" : "s"} per size{p.deposit > 0 ? ` · deposit ${rupees(p.deposit)}` : ""}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    {!p.enabled && <Tag className="m-0">Renting off</Tag>}
                    {p.status !== "active" && <Tag className="m-0">Draft</Tag>}
                    {p.open > 0 && <Tag color="blue" className="m-0">{p.open} open booking{p.open === 1 ? "" : "s"}</Tag>}
                  </div>
                </div>
              </div>
              <Button size="small" className="mt-3" icon={<Pencil size={13} aria-hidden="true" />} href={`/admin/products/${p.productId}#rental`}>
                Edit rent &amp; rules
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

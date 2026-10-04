"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Skeleton } from "antd";
import { apiFetch } from "@/lib/api";
import { VisitRow, ContactButtons } from "@/components/visitors";

/** A customer's recent visits to the store (when they were signed in). */
export function CustomerVisitsCard({ customerId, phone }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    let live = true;
    apiFetch(`/api/analytics/visitors?customerId=${encodeURIComponent(customerId)}&range=90d`)
      .then((d) => live && setData(d))
      .catch(() => live && setData({ total: 0, sessions: [] }));
    return () => {
      live = false;
    };
  }, [customerId]);

  return (
    <Card size="small" title="Recent visits" extra={<Link href="/admin/analytics/live" className="text-[12px]">All visitors</Link>}>
      {!data ? (
        <Skeleton active paragraph={{ rows: 2 }} title={false} />
      ) : data.sessions.length === 0 ? (
        <p className="m-0 text-[13px] text-ink-muted">No visits while signed in in the last 90 days.</p>
      ) : (
        <>
          {phone && (
            <div className="mb-1">
              <ContactButtons phone={phone} compact />
            </div>
          )}
          {data.sessions.slice(0, 5).map((s) => (
            <VisitRow key={s.id} visit={s} showCustomer={false} />
          ))}
          {data.total > 5 && <p className="m-0 pt-2 text-[12px] text-ink-muted">+{data.total - 5} earlier visits</p>}
        </>
      )}
    </Card>
  );
}

"use client";

import { Card, Table, Tag } from "antd";
import { formatCurrency } from "@shopcycle/utils";
import { OrderStatusControls } from "./OrderStatusControls";

// The RSC bug this file exists to avoid: a `columns` array with `render`
// functions can't be defined in the Server Component page.jsx and handed
// down to antd's <Table> (a Client Component) as a prop — functions aren't
// serializable across that boundary. See CustomerDetailView.jsx for the
// same fix applied to the customer page.
const columns = [
  { title: "Item", dataIndex: "title" },
  { title: "SKU", dataIndex: "sku", render: (v) => v || "—" },
  { title: "Qty", dataIndex: "quantity" },
  { title: "Price", dataIndex: "price", render: (v) => formatCurrency(v) },
  { title: "Total", dataIndex: "total", render: (v) => formatCurrency(v) },
];

const PAYMENT_METHOD_LABEL = { cod: "Cash on Delivery", razorpay: "Razorpay (online)" };

export function OrderDetailView({ order }) {
  const hasShippingAddress = Boolean(order.shippingAddress1);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 flex flex-col gap-6">
        <Card size="small" title="Products">
          <Table rowKey="id" columns={columns} dataSource={order.items} pagination={false} />
        </Card>

        <Card size="small" title="Summary">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-ink-muted">Subtotal</span>
            <span>{formatCurrency(order.subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-ink-muted">
              Discount{order.discountCode ? ` (${order.discountCode})` : ""}
            </span>
            <span>-{formatCurrency(order.discount)}</span>
          </div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-ink-muted">Shipping</span>
            <span>{formatCurrency(order.shipping)}</span>
          </div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-ink-muted">Tax</span>
            <span>{formatCurrency(order.tax)}</span>
          </div>
          <div className="flex justify-between font-semibold border-t border-app-border pt-2">
            <span>Total</span>
            <span>{formatCurrency(order.total)}</span>
          </div>
        </Card>

        {hasShippingAddress && (
          <Card size="small" title="Shipping address">
            <p className="text-sm m-0">{order.shippingName}</p>
            <p className="text-sm text-ink-muted m-0">
              {order.shippingAddress1}
              {order.shippingAddress2 ? `, ${order.shippingAddress2}` : ""}
            </p>
            <p className="text-sm text-ink-muted m-0">
              {order.shippingCity}, {order.shippingProvince} {order.shippingZip}
            </p>
            <p className="text-sm text-ink-muted m-0">{order.shippingCountry}</p>
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-6">
        <Card size="small" title="Customer">
          {order.customer ? (
            <>
              <p className="text-sm m-0 font-medium">{order.customer.name}</p>
              <p className="text-sm text-ink-muted m-0">{order.email || order.customer.email}</p>
              {order.phone && <p className="text-sm text-ink-muted m-0">{order.phone}</p>}
            </>
          ) : (
            <p className="text-sm text-ink-muted m-0">Guest order</p>
          )}
        </Card>

        <Card size="small" title="Payment">
          <Tag>{PAYMENT_METHOD_LABEL[order.paymentMethod] || order.paymentMethod}</Tag>
        </Card>

        <Card size="small" title="Status">
          <OrderStatusControls order={order} />
        </Card>
      </div>
    </div>
  );
}

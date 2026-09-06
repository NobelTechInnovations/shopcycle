"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Button, Modal, Form, Input, Select, InputNumber, App } from "antd";
import { Plus, Trash2 } from "lucide-react";
import { useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { COUNTRY_OPTIONS } from "@/lib/countries";

export function ShippingSettings() {
  const { message } = App.useApp();
  const { confirmDialog } = useConfirmDialog();
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [zoneModalOpen, setZoneModalOpen] = useState(false);
  const [rateModalZoneId, setRateModalZoneId] = useState(null);
  const [zoneForm] = Form.useForm();
  const [rateForm] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/api/shipping/zones");
      setZones(data.zones);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreateZone(values) {
    try {
      await apiFetch("/api/shipping/zones", {
        method: "POST",
        body: { name: values.name, countries: values.countries.join(",") },
      });
      setZoneModalOpen(false);
      zoneForm.resetFields();
      load();
    } catch (err) {
      message.error(err.message);
    }
  }

  function handleDeleteZone(zone) {
    confirmDialog({
      title: `Delete "${zone.name}"?`,
      description: "This removes all its shipping rates too.",
      okText: "Delete",
      danger: true,
      onConfirm: async () => {
        await apiFetch(`/api/shipping/zones/${zone.id}`, { method: "DELETE" });
        load();
      },
    });
  }

  async function handleAddRate(values) {
    try {
      await apiFetch(`/api/shipping/zones/${rateModalZoneId}/rates`, { method: "POST", body: values });
      setRateModalZoneId(null);
      rateForm.resetFields();
      load();
    } catch (err) {
      message.error(err.message);
    }
  }

  function handleDeleteRate(zoneId, rate) {
    confirmDialog({
      title: `Delete "${rate.name}"?`,
      okText: "Delete",
      danger: true,
      onConfirm: async () => {
        await apiFetch(`/api/shipping/zones/${zoneId}/rates/${rate.id}`, { method: "DELETE" });
        load();
      },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button type="primary" icon={<Plus size={14} aria-hidden="true" />} onClick={() => setZoneModalOpen(true)}>
          Add zone
        </Button>
      </div>

      {!loading && zones.length === 0 && (
        <p className="text-sm text-ink-muted">
          No shipping zones yet — the storefront cart won&apos;t show a shipping estimate until you add one.
        </p>
      )}

      {zones.map((zone) => (
        <Card
          key={zone.id}
          size="small"
          title={zone.name}
          extra={
            <div className="flex gap-2">
              <Button size="small" icon={<Plus size={12} aria-hidden="true" />} onClick={() => setRateModalZoneId(zone.id)}>
                Add rate
              </Button>
              <Button size="small" danger type="text" icon={<Trash2 size={12} aria-hidden="true" />} onClick={() => handleDeleteZone(zone)} />
            </div>
          }
        >
          <p className="text-xs text-ink-muted mb-3">Countries: {zone.countries}</p>
          {zone.rates.length === 0 && <p className="text-sm text-ink-muted">No rates yet.</p>}
          {zone.rates.map((rate) => (
            <div key={rate.id} className="flex items-center justify-between py-2 border-t border-app-border first:border-t-0">
              <div>
                <p className="text-sm m-0">{rate.name}</p>
                <p className="text-xs text-ink-muted m-0">
                  ₹{Number(rate.price).toFixed(2)}
                  {rate.freeAbove ? ` — free above ₹${Number(rate.freeAbove).toFixed(2)}` : ""}
                </p>
              </div>
              <Button type="text" danger size="small" icon={<Trash2 size={13} aria-hidden="true" />} onClick={() => handleDeleteRate(zone.id, rate)} />
            </div>
          ))}
        </Card>
      ))}

      <Modal title="Add shipping zone" open={zoneModalOpen} onCancel={() => setZoneModalOpen(false)} onOk={() => zoneForm.submit()} okText="Add zone" destroyOnHidden>
        <Form layout="vertical" form={zoneForm} onFinish={handleCreateZone} requiredMark={false}>
          <Form.Item name="name" label="Zone name" rules={[{ required: true, message: "Required" }]}>
            <Input placeholder="India" />
          </Form.Item>
          <Form.Item name="countries" label="Countries" rules={[{ required: true, message: "Select at least one" }]}>
            <Select mode="multiple" options={COUNTRY_OPTIONS} placeholder="Select countries" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="Add shipping rate" open={Boolean(rateModalZoneId)} onCancel={() => setRateModalZoneId(null)} onOk={() => rateForm.submit()} okText="Add rate" destroyOnHidden>
        <Form layout="vertical" form={rateForm} onFinish={handleAddRate} requiredMark={false}>
          <Form.Item name="name" label="Rate name" rules={[{ required: true, message: "Required" }]}>
            <Input placeholder="Standard" />
          </Form.Item>
          <Form.Item name="price" label="Price" rules={[{ required: true, message: "Required" }]}>
            <InputNumber min={0} className="w-full" prefix="₹" />
          </Form.Item>
          <Form.Item name="freeAbove" label="Free above (optional)" className="mb-0">
            <InputNumber min={0} className="w-full" prefix="₹" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

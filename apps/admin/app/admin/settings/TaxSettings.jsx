"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Button, Modal, Form, Input, Select, InputNumber, App } from "antd";
import { Plus, Trash2 } from "lucide-react";
import { useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { COUNTRY_OPTIONS } from "@/lib/countries";

export function TaxSettings() {
  const { message } = App.useApp();
  const { confirmDialog } = useConfirmDialog();
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/api/taxes");
      setRates(data.rates);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(values) {
    try {
      await apiFetch("/api/taxes", { method: "POST", body: values });
      setModalOpen(false);
      form.resetFields();
      load();
    } catch (err) {
      message.error(err.message);
    }
  }

  function handleDelete(rate) {
    confirmDialog({
      title: `Delete "${rate.name}"?`,
      okText: "Delete",
      danger: true,
      onConfirm: async () => {
        await apiFetch(`/api/taxes/${rate.id}`, { method: "DELETE" });
        load();
      },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button type="primary" icon={<Plus size={14} aria-hidden="true" />} onClick={() => setModalOpen(true)}>
          Add tax rate
        </Button>
      </div>

      <Card size="small">
        {!loading && rates.length === 0 && (
          <p className="text-sm text-ink-muted m-0">No tax rates yet — the storefront cart won&apos;t show a tax line until you add one.</p>
        )}
        {rates.map((rate) => (
          <div key={rate.id} className="flex items-center justify-between py-2 border-t border-app-border first:border-t-0">
            <div>
              <p className="text-sm m-0">{rate.name}</p>
              <p className="text-xs text-ink-muted m-0">
                {rate.country}
                {rate.province ? ` / ${rate.province}` : ""} — {Number(rate.rate)}%
              </p>
            </div>
            <Button type="text" danger size="small" icon={<Trash2 size={13} aria-hidden="true" />} onClick={() => handleDelete(rate)} />
          </div>
        ))}
      </Card>

      <Modal title="Add tax rate" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} okText="Add" destroyOnHidden>
        <Form layout="vertical" form={form} onFinish={handleCreate} requiredMark={false}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: "Required" }]}>
            <Input placeholder="GST" />
          </Form.Item>
          <Form.Item name="country" label="Country" rules={[{ required: true, message: "Required" }]}>
            <Select options={COUNTRY_OPTIONS} placeholder="Select a country" />
          </Form.Item>
          <Form.Item name="province" label="State / Province (optional)">
            <Input />
          </Form.Item>
          <Form.Item name="rate" label="Rate (%)" rules={[{ required: true, message: "Required" }]} className="mb-0">
            <InputNumber min={0} max={100} className="w-full" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

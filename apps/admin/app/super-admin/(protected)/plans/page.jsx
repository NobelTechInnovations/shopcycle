"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Button, Modal, Form, Input, InputNumber, App } from "antd";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { PageHeader, useConfirmDialog } from "@shopcycle/ui";
import { formatCurrency } from "@shopcycle/utils";
import { apiFetch } from "@/lib/api";

export default function PlansPage() {
  const { message } = App.useApp();
  const { confirmDialog } = useConfirmDialog();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null = closed, {} = new, {...plan} = edit
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/api/super-admin/plans");
      setPlans(data.plans);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openNew() {
    setEditing({});
    form.resetFields();
  }

  function openEdit(plan) {
    setEditing(plan);
    form.resetFields();
    form.setFieldsValue(plan);
  }

  async function handleSubmit(values) {
    try {
      if (editing?.id) {
        await apiFetch(`/api/super-admin/plans/${editing.id}`, { method: "PATCH", body: values });
        message.success("Plan updated");
      } else {
        await apiFetch("/api/super-admin/plans", { method: "POST", body: values });
        message.success("Plan created");
      }
      setEditing(null);
      load();
    } catch (err) {
      message.error(err.message);
    }
  }

  function handleDelete(plan) {
    confirmDialog({
      title: `Delete "${plan.name}"?`,
      okText: "Delete",
      danger: true,
      onConfirm: async () => {
        try {
          await apiFetch(`/api/super-admin/plans/${plan.id}`, { method: "DELETE" });
          load();
        } catch (err) {
          message.error(err.message);
        }
      },
    });
  }

  return (
    <div>
      <PageHeader
        title="Plans"
        actions={
          <Button type="primary" icon={<Plus size={14} aria-hidden="true" />} onClick={openNew}>
            New plan
          </Button>
        }
      />

      <Card size="small" loading={loading}>
        {plans.map((plan) => (
          <div key={plan.id} className="flex items-center justify-between py-3 border-t border-app-border first:border-t-0">
            <div>
              <p className="text-sm font-medium m-0">
                {plan.name} — {formatCurrency(plan.priceMonthly)}/mo
              </p>
              <p className="text-xs text-ink-muted m-0">
                {plan.productLimit} products · {plan.staffLimit} staff · {plan.description}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="small" icon={<Pencil size={12} aria-hidden="true" />} onClick={() => openEdit(plan)} />
              <Button size="small" danger icon={<Trash2 size={12} aria-hidden="true" />} onClick={() => handleDelete(plan)} />
            </div>
          </div>
        ))}
      </Card>

      <Modal
        title={editing?.id ? "Edit plan" : "New plan"}
        open={Boolean(editing)}
        onCancel={() => setEditing(null)}
        onOk={() => form.submit()}
        okText={editing?.id ? "Save" : "Create"}
        forceRender
      >
        <Form layout="vertical" form={form} onFinish={handleSubmit} requiredMark={false}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: "Required" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="priceMonthly" label="Price / month" rules={[{ required: true, message: "Required" }]}>
            <InputNumber min={0} className="w-full" prefix="₹" />
          </Form.Item>
          <Form.Item name="productLimit" label="Product limit" rules={[{ required: true, message: "Required" }]}>
            <InputNumber min={1} className="w-full" />
          </Form.Item>
          <Form.Item name="staffLimit" label="Staff limit" rules={[{ required: true, message: "Required" }]}>
            <InputNumber min={1} className="w-full" />
          </Form.Item>
          <Form.Item name="description" label="Description" className="mb-0">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

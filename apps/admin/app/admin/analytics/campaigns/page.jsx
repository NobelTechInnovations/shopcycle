"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Button, Modal, Form, Input, App } from "antd";
import { Plus, Trash2, Copy, Megaphone } from "lucide-react";
import { PageHeader, EmptyState, useConfirmDialog } from "@shopcycle/ui";
import { formatCurrency } from "@shopcycle/utils";
import { apiFetch } from "@/lib/api";

export default function CampaignsPage() {
  const { message } = App.useApp();
  const { confirmDialog } = useConfirmDialog();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/api/analytics/campaigns");
      setCampaigns(data.campaigns);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(values) {
    try {
      await apiFetch("/api/analytics/campaigns", { method: "POST", body: values });
      message.success("Campaign created");
      setOpen(false);
      form.resetFields();
      load();
    } catch (err) {
      message.error(err.message);
    }
  }

  function handleDelete(campaign) {
    confirmDialog({
      title: `Delete "${campaign.name}"?`,
      description: "The link will stop being tracked — existing sessions/orders keep their history.",
      okText: "Delete",
      danger: true,
      onConfirm: async () => {
        await apiFetch(`/api/analytics/campaigns/${campaign.id}`, { method: "DELETE" });
        load();
      },
    });
  }

  function copyLink(campaign) {
    navigator.clipboard.writeText(campaign.url);
    message.success("Link copied");
  }

  return (
    <div>
      <PageHeader
        title="Campaigns"
        actions={
          <Button type="primary" icon={<Plus size={14} aria-hidden="true" />} onClick={() => setOpen(true)}>
            Create campaign
          </Button>
        }
      />

      <Card size="small" loading={loading}>
        {!loading && campaigns.length === 0 && (
          <EmptyState
            icon={<Megaphone size={32} strokeWidth={1.5} aria-hidden="true" />}
            title="No campaigns yet"
            description="Create a trackable link for an ad, email, or bio link — visits and orders through it show up here."
          />
        )}
        {campaigns.map((c) => (
          <div key={c.id} className="flex items-center justify-between py-3 border-t border-app-border first:border-t-0">
            <div className="min-w-0">
              <p className="text-sm m-0 font-medium">{c.name}</p>
              <p className="text-xs text-ink-muted m-0 truncate max-w-md">{c.url}</p>
              <p className="text-xs text-ink-muted m-0 mt-1">
                {c.stats.sessions} sessions · {c.stats.orders} orders · {formatCurrency(c.stats.revenue)} revenue
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="small" icon={<Copy size={12} aria-hidden="true" />} onClick={() => copyLink(c)}>
                Copy link
              </Button>
              <Button
                type="text"
                danger
                size="small"
                icon={<Trash2 size={13} aria-hidden="true" />}
                onClick={() => handleDelete(c)}
              />
            </div>
          </div>
        ))}
      </Card>

      <Modal title="Create campaign" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="Create" destroyOnHidden>
        <Form layout="vertical" form={form} onFinish={handleCreate} requiredMark={false}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: "Required" }]}>
            <Input placeholder="Instagram bio link" />
          </Form.Item>
          <Form.Item name="utmSource" label="Source" rules={[{ required: true, message: "Required" }]}>
            <Input placeholder="instagram" />
          </Form.Item>
          <Form.Item name="utmMedium" label="Medium" rules={[{ required: true, message: "Required" }]}>
            <Input placeholder="social" />
          </Form.Item>
          <Form.Item name="utmCampaign" label="Campaign" rules={[{ required: true, message: "Required" }]}>
            <Input placeholder="bio_link" />
          </Form.Item>
          <Form.Item name="utmTerm" label="Term (optional)" className="mb-3">
            <Input />
          </Form.Item>
          <Form.Item name="utmContent" label="Content (optional)" className="mb-3">
            <Input />
          </Form.Item>
          <Form.Item name="destinationPath" label="Destination path" initialValue="/" className="mb-0">
            <Input placeholder="/ (homepage)" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

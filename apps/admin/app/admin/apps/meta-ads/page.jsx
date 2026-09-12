"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Button, Table, Tag, Modal, Form, Input, InputNumber, Select, Switch, App } from "antd";
import { Plus } from "lucide-react";
import { PageHeader } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { MetaConnectPanel } from "@/components/MetaConnectPanel";

function CampaignsPanel() {
  const { message } = App.useApp();
  const [campaigns, setCampaigns] = useState([]);
  const [objectives, setObjectives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, o] = await Promise.all([
        apiFetch("/api/meta-ads/campaigns"),
        apiFetch("/api/meta-ads/objectives"),
      ]);
      setCampaigns(c.campaigns);
      setObjectives(o.objectives);
    } catch (err) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(values) {
    setSubmitting(true);
    try {
      await apiFetch("/api/meta-ads/campaigns", { method: "POST", body: values });
      message.success("Campaign created, paused for review — turn it on below when you're ready.");
      setCreating(false);
      form.resetFields();
      load();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStatus(campaign) {
    const status = campaign.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try {
      await apiFetch(`/api/meta-ads/campaigns/${campaign.id}/status`, { method: "POST", body: { status } });
      load();
    } catch (err) {
      message.error(err.message);
    }
  }

  return (
    <Card
      size="small"
      title="Campaigns"
      extra={
        <Button size="small" type="primary" icon={<Plus size={14} aria-hidden="true" />} onClick={() => setCreating(true)}>
          Create campaign
        </Button>
      }
    >
      <Table
        size="small"
        rowKey="id"
        loading={loading}
        dataSource={campaigns}
        pagination={false}
        locale={{ emptyText: "No campaigns yet — create one to get started." }}
        columns={[
          { title: "Name", dataIndex: "name" },
          { title: "Objective", dataIndex: "objective", render: (v) => <Tag>{v}</Tag> },
          {
            title: "Daily budget",
            dataIndex: "dailyBudget",
            render: (v) => (v != null ? `₹${v}` : "—"),
          },
          {
            title: "Status",
            dataIndex: "status",
            render: (status, row) => (
              <Switch
                size="small"
                checked={status === "ACTIVE"}
                checkedChildren="Live"
                unCheckedChildren="Paused"
                onChange={() => toggleStatus(row)}
              />
            ),
          },
        ]}
      />

      <Modal
        title="Create campaign"
        open={creating}
        onCancel={() => setCreating(false)}
        onOk={() => form.submit()}
        confirmLoading={submitting}
        okText="Create (starts paused)"
      >
        <Form layout="vertical" form={form} onFinish={handleCreate} requiredMark={false}>
          <Form.Item name="name" label="Campaign name" rules={[{ required: true, message: "Required" }]}>
            <Input placeholder="Diwali sale traffic" />
          </Form.Item>
          <Form.Item name="objectivePreset" label="Goal" rules={[{ required: true, message: "Required" }]}>
            <Select options={objectives.map((o) => ({ value: o.key, label: o.label }))} />
          </Form.Item>
          <Form.Item name="dailyBudget" label="Daily budget (₹)" rules={[{ required: true, message: "Required" }]}>
            <InputNumber className="w-full" min={100} />
          </Form.Item>
          <Form.Item name="headline" label="Headline" rules={[{ required: true, message: "Required" }]}>
            <Input maxLength={80} showCount />
          </Form.Item>
          <Form.Item name="primaryText" label="Primary text" rules={[{ required: true, message: "Required" }]}>
            <Input.TextArea rows={3} maxLength={500} showCount />
          </Form.Item>
          <Form.Item name="destinationUrl" label="Destination URL" rules={[{ required: true, message: "Required" }]}>
            <Input placeholder="https://yourstore.oyklane.com/products/..." />
          </Form.Item>
          <Form.Item name="imageUrl" label="Image URL" rules={[{ required: true, message: "Required" }]}>
            <Input placeholder="https://.../product.jpg" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}

export default function MetaAdsPage() {
  return (
    <div>
      <PageHeader title="Meta Ads" />
      <p className="text-sm text-ink-muted -mt-4 mb-4">Connect Facebook to run ads for your store.</p>
      <MetaConnectPanel focus="ads">
        <CampaignsPanel />
      </MetaConnectPanel>
    </div>
  );
}

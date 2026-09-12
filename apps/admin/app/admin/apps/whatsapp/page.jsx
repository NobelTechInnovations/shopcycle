"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Button, Table, Tag, Modal, Form, Input, Select, Radio, App } from "antd";
import { Send } from "lucide-react";
import { PageHeader } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { MetaConnectPanel } from "@/components/MetaConnectPanel";

function MessagesPanel() {
  const { message } = App.useApp();
  const [messages, setMessages] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [kind, setKind] = useState("template");
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, t] = await Promise.all([apiFetch("/api/whatsapp/messages"), apiFetch("/api/whatsapp/templates")]);
      setMessages(m.messages);
      setTemplates(t.templates);
    } catch (err) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSend(values) {
    setSubmitting(true);
    try {
      await apiFetch("/api/whatsapp/messages", { method: "POST", body: { ...values, kind } });
      message.success("Sent");
      setComposing(false);
      form.resetFields();
      load();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card
      size="small"
      title="Messages"
      extra={
        <Button size="small" type="primary" icon={<Send size={14} aria-hidden="true" />} onClick={() => setComposing(true)}>
          Send message
        </Button>
      }
    >
      {templates.length === 0 && (
        <p className="text-xs text-ink-muted mt-0 mb-3">
          No approved templates found yet — a template is required to message a customer who hasn't messaged you in
          the last 24 hours. Create and get one approved in Meta Business Manager first.
        </p>
      )}
      <Table
        size="small"
        rowKey="id"
        loading={loading}
        dataSource={messages}
        pagination={false}
        locale={{ emptyText: "No messages sent yet." }}
        columns={[
          { title: "To", dataIndex: "toPhone" },
          { title: "Type", dataIndex: "kind", render: (v) => <Tag>{v}</Tag> },
          { title: "Message", dataIndex: "body", ellipsis: true },
          { title: "Status", dataIndex: "status" },
          { title: "Sent", dataIndex: "createdAt", render: (v) => new Date(v).toLocaleString() },
        ]}
      />

      <Modal
        title="Send WhatsApp message"
        open={composing}
        onCancel={() => setComposing(false)}
        onOk={() => form.submit()}
        confirmLoading={submitting}
        okText="Send"
      >
        <Form layout="vertical" form={form} onFinish={handleSend} requiredMark={false}>
          <Form.Item name="toPhone" label="Customer phone (with country code)" rules={[{ required: true, message: "Required" }]}>
            <Input placeholder="+91 98765 43210" />
          </Form.Item>
          <Radio.Group value={kind} onChange={(e) => setKind(e.target.value)} className="mb-4">
            <Radio.Button value="template">Template</Radio.Button>
            <Radio.Button value="text">Free text</Radio.Button>
          </Radio.Group>
          {kind === "template" ? (
            <Form.Item name="templateName" label="Template" rules={[{ required: true, message: "Required" }]}>
              <Select
                options={templates.map((t) => ({ value: t.name, label: `${t.name} (${t.language})` }))}
                onChange={(_, opt) => form.setFieldValue("templateLanguage", opt?.label?.match(/\(([^)]+)\)/)?.[1])}
              />
            </Form.Item>
          ) : (
            <Form.Item name="body" label="Message" rules={[{ required: true, message: "Required" }]}>
              <Input.TextArea rows={4} maxLength={1000} showCount />
            </Form.Item>
          )}
          <p className="text-xs text-ink-muted -mt-2">
            {kind === "text"
              ? "Free text only delivers if this customer has messaged you in the last 24 hours."
              : "A template message works any time and is the only way to start a new conversation."}
          </p>
        </Form>
      </Modal>
    </Card>
  );
}

export default function WhatsappPage() {
  return (
    <div>
      <PageHeader title="WhatsApp" />
      <p className="text-sm text-ink-muted -mt-4 mb-4">Connect WhatsApp Business to message your customers.</p>
      <MetaConnectPanel focus="whatsapp">
        <MessagesPanel />
      </MetaConnectPanel>
    </div>
  );
}

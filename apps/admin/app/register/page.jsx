"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Form, Input, Button, Typography, Alert } from "antd";
import { apiFetch } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function onFinish(values) {
    setError(null);
    setLoading(true);
    try {
      await apiFetch("/api/auth/register", { method: "POST", body: values });
      router.push("/admin");
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-app-bg px-4">
      <div className="w-full max-w-sm bg-app-surface border border-app-border rounded-lg shadow-card p-8">
        <Typography.Title level={4} className="!mb-1">
          Create your store
        </Typography.Title>
        <Typography.Text type="secondary">Start with a store name and an owner account</Typography.Text>

        {error && <Alert type="error" message={error} showIcon className="mt-4" />}

        <Form layout="vertical" onFinish={onFinish} className="mt-6" requiredMark={false}>
          <Form.Item
            label="Store name"
            name="storeName"
            rules={[{ required: true, min: 2, message: "Store name is too short" }]}
          >
            <Input size="large" placeholder="Demo Store" />
          </Form.Item>
          <Form.Item
            label="Your name"
            name="name"
            rules={[{ required: true, min: 2, message: "Name is too short" }]}
          >
            <Input size="large" />
          </Form.Item>
          <Form.Item
            label="Email"
            name="email"
            rules={[{ required: true, type: "email", message: "Enter a valid email" }]}
          >
            <Input autoComplete="email" size="large" />
          </Form.Item>
          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true, min: 8, message: "At least 8 characters" }]}
          >
            <Input.Password autoComplete="new-password" size="large" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={loading}>
            Create store
          </Button>
        </Form>

        <p className="text-sm text-ink-muted mt-4 text-center">
          Already have a store?{" "}
          <a href="/login" className="text-brand font-medium">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}

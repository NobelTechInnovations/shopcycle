"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Form, Input, Button, Typography, Alert } from "antd";
import { apiFetch } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function onFinish(values) {
    setError(null);
    setLoading(true);
    try {
      await apiFetch("/api/auth/login", { method: "POST", body: values });
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
          Sign in
        </Typography.Title>
        <Typography.Text type="secondary">Welcome back to ShopCycle</Typography.Text>

        {error && <Alert type="error" message={error} showIcon className="mt-4" />}

        <Form layout="vertical" onFinish={onFinish} className="mt-6" requiredMark={false}>
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
            rules={[{ required: true, message: "Password is required" }]}
          >
            <Input.Password autoComplete="current-password" size="large" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={loading}>
            Sign in
          </Button>
        </Form>

        <p className="text-sm text-ink-muted mt-4 text-center">
          New here?{" "}
          <a href="/register" className="text-brand font-medium">
            Create a store
          </a>
        </p>
      </div>
    </div>
  );
}

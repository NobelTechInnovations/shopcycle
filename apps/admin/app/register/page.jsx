"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Form, Input, Button, Alert } from "antd";
import { AuthShell } from "@shopcycle/ui";
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
    <AuthShell
      title="Create your store"
      subtitle="Free for 2 days, then a 1-month free trial on any plan."
      footer={
        <>
          Already selling on Oyklane?{" "}
          <a href="/login" className="text-ink font-medium underline underline-offset-4 decoration-ink/20 hover:decoration-ink">
            Sign in
          </a>
        </>
      }
    >
      {error && <Alert type="error" message={error} showIcon className="mb-5" />}

      <Form layout="vertical" onFinish={onFinish} requiredMark={false} size="large">
        <Form.Item label="Store name" name="storeName" rules={[{ required: true, min: 2, message: "Store name is too short" }]}>
          <Input placeholder="Aurora Goods" autoFocus />
        </Form.Item>
        <Form.Item label="Your name" name="name" rules={[{ required: true, min: 2, message: "Name is too short" }]}>
          <Input autoComplete="name" placeholder="Priya Sharma" />
        </Form.Item>
        <Form.Item label="Email" name="email" rules={[{ required: true, type: "email", message: "Enter a valid email" }]}>
          <Input autoComplete="email" placeholder="you@company.com" />
        </Form.Item>
        <Form.Item
          label="Password"
          name="password"
          extra="At least 8 characters."
          rules={[{ required: true, min: 8, message: "At least 8 characters" }]}
        >
          <Input.Password autoComplete="new-password" placeholder="••••••••" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={loading} className="!h-11 !mt-2">
          Create store
        </Button>
      </Form>
    </AuthShell>
  );
}

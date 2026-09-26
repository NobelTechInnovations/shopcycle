"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Form, Input, Button, Alert } from "antd";
import { AuthShell } from "@shopcycle/ui";
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
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to manage your store."
      footer={
        <>
          New to Oyklane?{" "}
          <a href="/register" className="text-ink font-medium underline underline-offset-4 decoration-ink/20 hover:decoration-ink">
            Create a store
          </a>
        </>
      }
    >
      {error && <Alert type="error" message={error} showIcon className="mb-5" />}

      <Form layout="vertical" onFinish={onFinish} requiredMark={false} size="large">
        <Form.Item label="Email" name="email" rules={[{ required: true, type: "email", message: "Enter a valid email" }]}>
          <Input autoComplete="email" placeholder="you@company.com" autoFocus />
        </Form.Item>
        <Form.Item label="Password" name="password" rules={[{ required: true, message: "Password is required" }]}>
          <Input.Password autoComplete="current-password" placeholder="••••••••" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={loading} className="!h-11 !mt-2">
          Sign in
        </Button>
      </Form>
    </AuthShell>
  );
}

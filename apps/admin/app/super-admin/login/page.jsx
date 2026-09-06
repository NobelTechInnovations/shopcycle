"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Form, Input, Button, Typography, Alert } from "antd";
import { ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/api";

/**
 * A deliberately separate entry point from the merchant /login — this is
 * where the platform's own operator signs in, not a store owner. Reuses
 * /api/auth/login (same account system, same JWT) but never lets a
 * non-super-admin account land in the platform panel: their session is
 * torn back down immediately if `isSuperAdmin` comes back false, rather
 * than quietly dropping them into their own store's /admin instead.
 */
export default function SuperAdminLoginPage() {
  const router = useRouter();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function onFinish(values) {
    setError(null);
    setLoading(true);
    try {
      const { user } = await apiFetch("/api/auth/login", { method: "POST", body: values });
      if (!user.isSuperAdmin) {
        await apiFetch("/api/auth/logout", { method: "POST" });
        setError("This account is not a platform admin.");
        return;
      }
      router.push("/super-admin");
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0F19] px-4">
      <div className="w-full max-w-sm bg-[#131826] border border-[#232B3D] rounded-lg shadow-card p-8">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={20} className="text-white" aria-hidden="true" />
          <Typography.Title level={4} className="!mb-0 !text-white">
            Platform Admin
          </Typography.Title>
        </div>
        <Typography.Text className="!text-gray-400">
          Manage every company, plan, and app on ShopCycle
        </Typography.Text>

        {error && <Alert type="error" message={error} showIcon className="mt-4" />}

        <Form layout="vertical" onFinish={onFinish} className="mt-6" requiredMark={false}>
          <Form.Item
            label={<span className="text-gray-300">Email</span>}
            name="email"
            rules={[{ required: true, type: "email", message: "Enter a valid email" }]}
          >
            <Input autoComplete="email" size="large" />
          </Form.Item>
          <Form.Item
            label={<span className="text-gray-300">Password</span>}
            name="password"
            rules={[{ required: true, message: "Password is required" }]}
          >
            <Input.Password autoComplete="current-password" size="large" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={loading}>
            Sign in
          </Button>
        </Form>

        <p className="text-sm text-gray-500 mt-4 text-center">
          Store owner? <a href="/login" className="text-gray-300 font-medium">Go to store sign in</a>
        </p>
      </div>
    </div>
  );
}

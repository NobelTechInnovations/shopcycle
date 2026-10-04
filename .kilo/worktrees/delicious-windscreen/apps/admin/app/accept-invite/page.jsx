"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Form, Input, Button, Typography, Alert } from "antd";
import { apiFetch } from "@/lib/api";

function AcceptInviteForm() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function onFinish(values) {
    setError(null);
    setLoading(true);
    try {
      await apiFetch("/api/team/accept-invite", { method: "POST", body: { ...values, token } });
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
          Join the team
        </Typography.Title>
        <Typography.Text type="secondary">Set your name and password to accept the invitation</Typography.Text>

        {!token && (
          <Alert type="error" message="This invite link is missing its token." showIcon className="mt-4" />
        )}
        {error && <Alert type="error" message={error} showIcon className="mt-4" />}

        <Form layout="vertical" onFinish={onFinish} className="mt-6" requiredMark={false}>
          <Form.Item label="Your name" name="name" rules={[{ required: true, min: 2, message: "Name is too short" }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true, min: 8, message: "At least 8 characters" }]}
          >
            <Input.Password autoComplete="new-password" size="large" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={loading} disabled={!token}>
            Accept invitation
          </Button>
        </Form>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense>
      <AcceptInviteForm />
    </Suspense>
  );
}

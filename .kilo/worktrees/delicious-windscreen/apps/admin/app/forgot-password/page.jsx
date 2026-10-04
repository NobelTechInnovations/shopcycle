"use client";

import { useState } from "react";
import Link from "next/link";
import { Form, Input, Button, Alert } from "antd";
import { MailCheck } from "lucide-react";
import { AuthShell } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

/** Step 1 of a password reset. The answer is the same whether or not the
 * email has an account, so this page can't be used to find out who does. */
export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function onFinish({ email }) {
    setError(null);
    setLoading(true);
    try {
      await apiFetch("/api/auth/password/forgot", { method: "POST", body: { email } });
      setSentTo(email);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const back = (
    <Link href="/login" className="text-ink font-medium underline underline-offset-4 decoration-ink/20 hover:decoration-ink">
      Back to sign in
    </Link>
  );

  if (sentTo) {
    return (
      <AuthShell title="Check your email" subtitle={`If ${sentTo} has an Oyklane account, a reset link is on its way.`} footer={back}>
        <div className="flex items-start gap-3 rounded-lg bg-app-bg px-4 py-3">
          <MailCheck size={18} className="text-status-success mt-0.5 shrink-0" aria-hidden="true" />
          <p className="m-0 text-sm text-ink-muted">
            The link works for 30 minutes. Nothing there? Check spam, or{" "}
            <button type="button" className="underline text-ink" onClick={() => setSentTo(null)}>
              try another email
            </button>
            .
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password" subtitle="Enter the email you sign in with and we'll send you a link." footer={back}>
      {error && <Alert type="error" message={error} showIcon className="mb-5" />}
      <Form layout="vertical" onFinish={onFinish} requiredMark={false} size="large">
        <Form.Item label="Email" name="email" rules={[{ required: true, type: "email", message: "Enter a valid email" }]}>
          <Input autoComplete="email" placeholder="you@company.com" autoFocus />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={loading} className="!h-11 !mt-2">
          Send reset link
        </Button>
      </Form>
    </AuthShell>
  );
}

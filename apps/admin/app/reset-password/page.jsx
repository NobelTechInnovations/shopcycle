"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Form, Input, Button, Alert, Skeleton } from "antd";
import { AuthShell } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

// useSearchParams() needs a Suspense boundary for the static build (see
// app/billing/pay/page.jsx for the same pattern).
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthShell title="Choose a new password"><Skeleton active paragraph={{ rows: 3 }} /></AuthShell>}>
      <ResetPassword />
    </Suspense>
  );
}

function ResetPassword() {
  const router = useRouter();
  const token = useSearchParams().get("token") || "";
  const [valid, setValid] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setValid(false);
      return;
    }
    apiFetch(`/api/auth/password/reset?token=${encodeURIComponent(token)}`)
      .then((r) => setValid(r.valid))
      .catch(() => setValid(false));
  }, [token]);

  async function onFinish({ password }) {
    setError(null);
    setLoading(true);
    try {
      await apiFetch("/api/auth/password/reset", { method: "POST", body: { token, password } });
      setDone(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const footer = (
    <Link href="/login" className="text-ink font-medium underline underline-offset-4 decoration-ink/20 hover:decoration-ink">
      Back to sign in
    </Link>
  );

  if (valid === null) {
    return (
      <AuthShell title="Choose a new password" footer={footer}>
        <Skeleton active paragraph={{ rows: 3 }} />
      </AuthShell>
    );
  }

  if (!valid && !done) {
    return (
      <AuthShell title="This link has expired" subtitle="Reset links work once, for 30 minutes." footer={footer}>
        <Link href="/forgot-password">
          <Button type="primary" block size="large" className="!h-11">
            Send a new link
          </Button>
        </Link>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="Password changed" subtitle="You've been signed out everywhere else. Taking you to sign in…" footer={footer}>
        <Link href="/login">
          <Button type="primary" block size="large" className="!h-11">
            Sign in
          </Button>
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="At least 8 characters. A short phrase is easier to remember than symbols." footer={footer}>
      {error && <Alert type="error" message={error} showIcon className="mb-5" />}
      <Form layout="vertical" onFinish={onFinish} requiredMark={false} size="large">
        <Form.Item
          label="New password"
          name="password"
          rules={[
            { required: true, message: "Enter a new password" },
            { min: 8, message: "At least 8 characters" },
          ]}
          hasFeedback
        >
          <Input.Password autoComplete="new-password" autoFocus />
        </Form.Item>
        <Form.Item
          label="Confirm password"
          name="confirm"
          dependencies={["password"]}
          hasFeedback
          rules={[
            { required: true, message: "Type it again" },
            ({ getFieldValue }) => ({
              validator: (_, value) =>
                !value || getFieldValue("password") === value ? Promise.resolve() : Promise.reject(new Error("Passwords don't match")),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={loading} className="!h-11 !mt-2">
          Save new password
        </Button>
      </Form>
    </AuthShell>
  );
}

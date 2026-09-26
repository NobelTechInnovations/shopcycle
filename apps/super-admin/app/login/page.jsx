"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Form, Input, Button, Alert } from "antd";
import { ShieldCheck } from "lucide-react";
import { AuthShell } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3000";

/**
 * The platform operator's own sign-in — a completely separate app/domain
 * from a store owner's /login, with its own cookie and its own login
 * endpoint (/api/auth/super-admin-login) — never the seller's /api/auth/login.
 * A non-super-admin account is rejected server-side, in the API itself.
 *
 * Two steps when the account has an authenticator app enabled: the
 * password step returns a short-lived challenge (not a session), and only
 * the code step below turns it into a session.
 */
export default function SuperAdminLoginPage() {
  const router = useRouter();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [challengeToken, setChallengeToken] = useState(null);

  function signedIn() {
    router.push("/companies");
    router.refresh();
  }

  async function submitPassword(values) {
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch("/api/auth/super-admin-login", { method: "POST", body: values });
      if (res.requiresTwoFactor) {
        setChallengeToken(res.challengeToken);
      } else {
        signedIn();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitCode({ code }) {
    setError(null);
    setLoading(true);
    try {
      await apiFetch("/api/auth/super-admin-login/verify", { method: "POST", body: { challengeToken, code } });
      signedIn();
    } catch (err) {
      setError(err.message);
      // An expired challenge can't be retried with another code — send
      // them back to the password step instead of a dead end.
      if (/expired/i.test(err.message)) setChallengeToken(null);
    } finally {
      setLoading(false);
    }
  }

  const footer = (
    <>
      Running a store?{" "}
      <a href={ADMIN_URL} className="text-ink font-medium underline underline-offset-4 decoration-ink/20 hover:decoration-ink">
        Go to store sign in
      </a>
    </>
  );

  if (challengeToken) {
    return (
      <AuthShell variant="platform" title="Two-step verification" subtitle="Enter the 6-digit code from your authenticator app." footer={footer}>
        {error && <Alert type="error" message={error} showIcon className="mb-5" />}
        <div className="mb-6 w-12 h-12 rounded-lg bg-accent-soft text-accent flex items-center justify-center">
          <ShieldCheck size={24} strokeWidth={1.75} aria-hidden="true" />
        </div>
        <Form layout="vertical" onFinish={submitCode} requiredMark={false} size="large">
          <Form.Item
            label="Authentication code"
            name="code"
            rules={[{ required: true, pattern: /^\d{6}$/, message: "Enter the 6-digit code" }]}
          >
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              autoFocus
              className="tracking-[0.4em] font-mono"
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading} className="!h-11 !mt-2">
            Verify and sign in
          </Button>
          <Button type="link" block className="!mt-2" onClick={() => { setChallengeToken(null); setError(null); }}>
            Use a different account
          </Button>
        </Form>
      </AuthShell>
    );
  }

  return (
    <AuthShell variant="platform" title="Platform sign in" subtitle="Restricted to Oyklane operators." footer={footer}>
      {error && <Alert type="error" message={error} showIcon className="mb-5" />}

      <Form layout="vertical" onFinish={submitPassword} requiredMark={false} size="large">
        <Form.Item label="Email" name="email" rules={[{ required: true, type: "email", message: "Enter a valid email" }]}>
          <Input autoComplete="email" placeholder="operator@oyklane.com" autoFocus />
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

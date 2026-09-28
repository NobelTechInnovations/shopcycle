"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Form, Input, Button, Alert } from "antd";
import { AuthShell } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { GoogleSignIn } from "@/components/GoogleSignIn";

/** The name and email inside a Google sign-up ticket — display only; the
 * API checks the ticket's signature when the store is created. */
function readTicket(ticket) {
  try {
    const part = ticket.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const data = JSON.parse(decodeURIComponent(escape(atob(part))));
    return { name: data.name || "", email: data.email || "" };
  } catch {
    return null;
  }
}

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [google, setGoogle] = useState(null);

  // Back from "Continue with Google" with a new email: just name the store.
  useEffect(() => {
    const ticket = new URLSearchParams(window.location.search).get("google");
    const who = ticket && readTicket(ticket);
    if (who) setGoogle({ ticket, ...who });
  }, []);

  async function onFinish(values) {
    setError(null);
    setLoading(true);
    try {
      if (google) await apiFetch("/api/auth/google/register", { method: "POST", body: { ticket: google.ticket, storeName: values.storeName } });
      else await apiFetch("/api/auth/register", { method: "POST", body: values });
      router.push("/welcome");
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
      subtitle="3-day free trial, then ₹99 for your first month."
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
      {google && (
        <Alert
          type="info"
          showIcon
          className="mb-5"
          message={`Continuing as ${google.name ? `${google.name} (${google.email})` : google.email}`}
          description="Name your store to finish. You'll sign in with Google."
        />
      )}

      <Form layout="vertical" onFinish={onFinish} requiredMark={false} size="large">
        <Form.Item label="Store name" name="storeName" rules={[{ required: true, min: 2, message: "Store name is too short" }]}>
          <Input placeholder="Aurora Goods" autoFocus />
        </Form.Item>
        {!google && (
          <>
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
          </>
        )}
        <Button type="primary" htmlType="submit" block loading={loading} className="!h-11 !mt-2">
          Create store
        </Button>
      </Form>
      {!google && <GoogleSignIn />}
    </AuthShell>
  );
}

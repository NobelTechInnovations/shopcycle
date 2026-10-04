"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Form, Input, Tag, App, Skeleton } from "antd";
import { ShieldCheck, ShieldAlert, Smartphone, LogOut } from "lucide-react";
import { PageHeader, useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

function CodeField() {
  return (
    <Form.Item
      name="code"
      label="6-digit code"
      rules={[{ required: true, pattern: /^\d{6}$/, message: "Enter the 6-digit code from your app" }]}
      className="mb-3"
    >
      <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" className="!w-44 tracking-[0.35em] font-mono" />
    </Form.Item>
  );
}

export default function SecurityPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const { confirmDialog } = useConfirmDialog();
  const [status, setStatus] = useState(null);
  const [enrollment, setEnrollment] = useState(null); // { qrDataUrl, manualKey } while setting up
  const [busy, setBusy] = useState(false);
  const [confirmForm] = Form.useForm();
  const [disableForm] = Form.useForm();

  const load = useCallback(async () => {
    setStatus(await apiFetch("/api/super-admin/security"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function startSetup() {
    setBusy(true);
    try {
      setEnrollment(await apiFetch("/api/super-admin/security/2fa/setup", { method: "POST" }));
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup({ code }) {
    setBusy(true);
    try {
      await apiFetch("/api/super-admin/security/2fa/confirm", { method: "POST", body: { code } });
      message.success("Two-step verification is on");
      setEnrollment(null);
      confirmForm.resetFields();
      load();
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function disable({ code }) {
    setBusy(true);
    try {
      await apiFetch("/api/super-admin/security/2fa/disable", { method: "POST", body: { code } });
      // Turning it off ends every session, including this one.
      router.push("/login");
      router.refresh();
    } catch (err) {
      message.error(err.message);
      setBusy(false);
    }
  }

  function signOutEverywhere() {
    confirmDialog({
      title: "Sign out everywhere?",
      description: "Every session on this account ends, including this browser and any seller admin sessions.",
      okText: "Sign out everywhere",
      danger: true,
      onConfirm: async () => {
        await apiFetch("/api/super-admin/security/sign-out-everywhere", { method: "POST" });
        router.push("/login");
        router.refresh();
      },
    });
  }

  const enabled = status?.twoFactorEnabled;

  return (
    <div className="max-w-3xl">
      <PageHeader title="Security" />

      <Card size="small" className="!shadow-card mb-5" styles={{ body: { padding: 24 } }}>
        {!status ? (
          <Skeleton active paragraph={{ rows: 2 }} />
        ) : (
          <div className="flex items-start gap-4">
            <span
              className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${
                enabled ? "bg-[#E8F6EE] text-status-success" : "bg-[#FEF3E2] text-status-warning"
              }`}
            >
              {enabled ? <ShieldCheck size={22} aria-hidden="true" /> : <ShieldAlert size={22} aria-hidden="true" />}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-[15px] font-semibold text-ink m-0">Two-step verification</h2>
                {enabled ? <Tag color="success">On</Tag> : <Tag color="warning">Off</Tag>}
              </div>
              <p className="text-sm text-ink-muted mt-1 mb-0">
                {enabled
                  ? `Signing in needs your password and a code from your authenticator app. Turned on ${new Date(status.twoFactorEnabledAt).toLocaleDateString()}.`
                  : "This console can suspend any store and read every store's customers. Protect it with a code from an authenticator app (Google Authenticator, 1Password, Authy) in addition to your password."}
              </p>

              {!enabled && !enrollment && (
                <Button type="primary" className="mt-4" icon={<Smartphone size={15} aria-hidden="true" />} loading={busy} onClick={startSetup}>
                  Set up authenticator app
                </Button>
              )}

              {!enabled && enrollment && (
                <div className="mt-5 grid gap-6 sm:grid-cols-[auto_1fr] items-start">
                  <div className="p-3 rounded-lg border border-app-border bg-app-surface w-fit">
                    <img src={enrollment.qrDataUrl} alt="QR code for your authenticator app" width={180} height={180} />
                  </div>
                  <div>
                    <ol className="text-sm text-ink m-0 pl-4 flex flex-col gap-1.5">
                      <li>Open your authenticator app and scan this QR code.</li>
                      <li>
                        Can't scan? Enter this key instead:
                        <code className="block mt-1 text-xs bg-app-bg rounded px-2 py-1 break-all select-all">{enrollment.manualKey}</code>
                      </li>
                      <li>Type the 6-digit code the app shows.</li>
                    </ol>
                    <Form form={confirmForm} layout="vertical" requiredMark={false} onFinish={confirmSetup} className="mt-4">
                      <CodeField />
                      <div className="flex gap-2">
                        <Button type="primary" htmlType="submit" loading={busy}>
                          Turn on
                        </Button>
                        <Button onClick={() => setEnrollment(null)}>Cancel</Button>
                      </div>
                    </Form>
                  </div>
                </div>
              )}

              {enabled && (
                <Form form={disableForm} layout="vertical" requiredMark={false} onFinish={disable} className="mt-4">
                  <p className="text-[13px] text-ink-muted mt-0 mb-2">
                    To turn it off, enter a current code. This signs you out everywhere.
                  </p>
                  <CodeField />
                  <Button danger htmlType="submit" loading={busy}>
                    Turn off two-step verification
                  </Button>
                </Form>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card size="small" className="!shadow-card" styles={{ body: { padding: 24 } }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-[15px] font-semibold text-ink m-0">Sessions</h2>
            <p className="text-sm text-ink-muted mt-1 mb-0">
              Lost a device, or signed in somewhere you shouldn't have? End every session on this account at once.
            </p>
          </div>
          <Button danger icon={<LogOut size={15} aria-hidden="true" />} onClick={signOutEverywhere}>
            Sign out everywhere
          </Button>
        </div>
      </Card>
    </div>
  );
}

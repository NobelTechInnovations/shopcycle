"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, App } from "antd";
import { MailWarning } from "lucide-react";
import { apiFetch } from "@/lib/api";

/** Asks an unverified owner to confirm their email — it's how they'd get
 * back into the account if they forget the password. Never blocks. The
 * email is sent in the background, so the banner shows what actually
 * happened to it (sending / sent / couldn't send). */
export function VerifyEmailBanner({ email }) {
  const { message } = App.useApp();
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null);

  const check = useCallback(async () => {
    try {
      const s = await apiFetch("/api/auth/email/status");
      setStatus(s.verified ? "verified" : s.status);
      return s.status;
    } catch {
      return null;
    }
  }, []);

  // While it's still being sent, look again a few times.
  useEffect(() => {
    let timer;
    let tries = 0;
    const poll = async () => {
      const s = await check();
      tries += 1;
      if (s === "sending" && tries < 10) timer = setTimeout(poll, 3000);
    };
    poll();
    return () => clearTimeout(timer);
  }, [check]);

  async function resend() {
    setSending(true);
    try {
      const res = await apiFetch("/api/auth/email/resend", { method: "POST", body: {} });
      if (res.alreadyVerified) {
        message.success("Your email is already confirmed");
        setStatus("verified");
        return;
      }
      setStatus("sending");
      for (let i = 0; i < 10; i += 1) {
        await new Promise((r) => setTimeout(r, 2000));
        if ((await check()) !== "sending") break;
      }
    } catch (err) {
      message.error(err.message);
    } finally {
      setSending(false);
    }
  }

  if (status === "verified") return null;
  const failed = status === "failed";
  const text =
    status === "sent"
      ? `We sent a link to ${email} — it lets you recover your account if you ever forget your password.`
      : status === "sending"
        ? `Sending a confirmation link to ${email}…`
        : failed
          ? `We couldn't send the confirmation email to ${email}. Try again in a minute.`
          : `Confirm ${email} so you can recover your account if you ever forget your password.`;

  return (
    <div
      role="status"
      className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border px-4 py-3 ${failed ? "border-status-danger/30 bg-status-danger/5" : "border-status-warning/30 bg-status-warning/5"}`}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <MailWarning size={18} className={`${failed ? "text-status-danger" : "text-status-warning"} mt-0.5 shrink-0`} aria-hidden="true" />
        <p className="m-0 text-sm text-ink">
          <strong className="font-semibold">Confirm your email.</strong> {text}
        </p>
      </div>
      {status !== "sending" && (
        <Button size="small" loading={sending} onClick={resend}>
          {status === "none" ? "Send link" : "Resend link"}
        </Button>
      )}
    </div>
  );
}

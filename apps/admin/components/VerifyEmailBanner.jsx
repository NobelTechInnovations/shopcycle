"use client";

import { useState } from "react";
import { Button, App } from "antd";
import { MailWarning } from "lucide-react";
import { apiFetch } from "@/lib/api";

/** Asks an unverified owner to confirm their email — it's how they'd get
 * back into the account if they forget the password. Never blocks. */
export function VerifyEmailBanner({ email }) {
  const { message } = App.useApp();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function resend() {
    setSending(true);
    try {
      const res = await apiFetch("/api/auth/email/resend", { method: "POST", body: {} });
      if (res.alreadyVerified) message.success("Your email is already confirmed");
      setSent(true);
    } catch (err) {
      message.error(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      role="status"
      className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-status-warning/30 bg-status-warning/5 px-4 py-3"
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <MailWarning size={18} className="text-status-warning mt-0.5 shrink-0" aria-hidden="true" />
        <p className="m-0 text-sm text-ink">
          <strong className="font-semibold">Confirm your email.</strong>{" "}
          {sent ? `A new link is on its way to ${email}.` : `We sent a link to ${email} — it lets you recover your account if you ever forget your password.`}
        </p>
      </div>
      {!sent && (
        <Button size="small" loading={sending} onClick={resend}>
          Resend link
        </Button>
      )}
    </div>
  );
}

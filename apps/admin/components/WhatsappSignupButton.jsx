"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Modal, Input, App } from "antd";
import { MessageCirclePlus } from "lucide-react";
import { apiFetch } from "@/lib/api";

/** Loads Meta's JavaScript SDK once. */
function loadSdk(appId, version) {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.FB) return Promise.resolve(window.FB);
  return new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version });
      resolve(window.FB);
    };
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/en_US/sdk.js";
    s.async = true;
    s.defer = true;
    s.crossOrigin = "anonymous";
    s.onerror = () => reject(new Error("Couldn't load Facebook. Check your connection or ad blocker."));
    document.body.appendChild(s);
  });
}

/**
 * Meta's WhatsApp Embedded Signup: the seller creates or picks their
 * WhatsApp Business account and verifies a phone number inside Meta's own
 * popup. `coexistence` onboards a number already on the WhatsApp Business
 * app (the app keeps working alongside). When it finishes, Oyklane
 * saves the account, subscribes to its messages, and asks for a PIN if
 * the number still needs registering.
 */
export function WhatsappSignupButton({ onDone, coexistence = false, type = "primary", children }) {
  const { message } = App.useApp();
  const [config, setConfig] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pinFor, setPinFor] = useState(null);
  const [pin, setPin] = useState("");
  const session = useRef({});

  useEffect(() => {
    apiFetch("/api/whatsapp/signup-config")
      .then(setConfig)
      .catch(() => setConfig({ available: false }));
  }, []);

  useEffect(() => {
    function onMessage(event) {
      if (!/(^|\.)facebook\.com$/.test(new URL(event.origin).hostname)) return;
      let data;
      try {
        data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (String(data.event || "").startsWith("FINISH")) {
        session.current.ids = { wabaId: data.data?.waba_id, phoneNumberId: data.data?.phone_number_id, businessId: data.data?.business_id };
        finish();
      } else if (data.event === "CANCEL") {
        session.current.cancelled = data.data?.current_step || true;
      } else if (data.event === "ERROR") {
        message.error(data.data?.error_message || "Meta reported an error during sign-up.");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Both halves arrive separately (the code from FB.login, the ids by
  // window message) — finish once both are here.
  async function finish() {
    const { code, ids, finishing } = session.current;
    if (!code || !ids?.wabaId || finishing) return;
    session.current.finishing = true;
    try {
      const out = await apiFetch("/api/whatsapp/embedded-signup", { method: "POST", body: { code, ...ids } });
      if (out.needsPin) setPinFor(out.number);
      else {
        message.success(out.number ? `${out.number.label} is connected` : "WhatsApp account connected");
        onDone?.();
      }
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(false);
      session.current = {};
    }
  }

  async function start() {
    setBusy(true);
    session.current = {};
    try {
      const FB = await loadSdk(config.appId, config.graphVersion);
      FB.login(
        (response) => {
          const code = response?.authResponse?.code;
          if (!code) {
            setBusy(false);
            if (session.current.cancelled) message.info("Sign-up was closed before it finished.");
            return;
          }
          session.current.code = code;
          finish();
          // If Meta's window message never comes (older flows), stop waiting.
          setTimeout(() => {
            if (session.current.code && !session.current.ids) {
              setBusy(false);
              message.warning("Meta didn't say which WhatsApp account you chose. Click Refresh to see it, or try again.");
              onDone?.();
            }
          }, 8000);
        },
        {
          config_id: config.configId,
          response_type: "code",
          override_default_response_type: true,
          extras: { setup: {}, featureType: coexistence ? "whatsapp_business_app_onboarding" : "", sessionInfoVersion: "3" },
        }
      );
    } catch (err) {
      setBusy(false);
      message.error(err.message);
    }
  }

  async function activate() {
    try {
      await apiFetch("/api/whatsapp/activate", { method: "POST", body: { pin } });
      message.success("Your number is active");
      setPinFor(null);
      setPin("");
      onDone?.();
    } catch (err) {
      message.error(err.message);
    }
  }

  if (!config?.available) return null;
  return (
    <>
      <Button type={type} icon={<MessageCirclePlus size={14} aria-hidden="true" />} loading={busy} onClick={start}>
        {children || (coexistence ? "Use my WhatsApp Business app number" : "Add a WhatsApp number")}
      </Button>
      <Modal title="Activate your number" open={Boolean(pinFor)} onCancel={() => setPinFor(null)} onOk={activate} okText="Activate" okButtonProps={{ disabled: !/^\d{6}$/.test(pin) }}>
        <p className="text-sm">
          {pinFor?.label} needs a 6-digit two-step verification PIN to start sending. Choose a new PIN (or enter the one you already set for this number in
          WhatsApp Manager). Keep it safe — Meta asks for it if the number is moved.
        </p>
        <Input.OTP length={6} value={pin} onChange={setPin} mask />
      </Modal>
    </>
  );
}

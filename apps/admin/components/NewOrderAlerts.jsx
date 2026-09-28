"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { App, Button, Tooltip } from "antd";
import { BellRing, BellOff } from "lucide-react";
import { apiFetch } from "@/lib/api";

const POLL_MS = 20000;
const SOUND_KEY = "oy-order-sound";
// Orders placed while this browser wasn't looking (a reload, the admin
// closed) are still announced when it comes back — if they're this recent.
const CATCH_UP_MS = 30 * 60 * 1000;

/** A short "coin" chime, synthesised — no audio file to load. */
function playCoin(ctx) {
  if (!ctx || ctx.state !== "running") return false;
  const t = ctx.currentTime;
  const tone = (freq, start, length, volume) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, t + start);
    gain.gain.setValueAtTime(0.0001, t + start);
    gain.gain.exponentialRampToValueAtTime(volume, t + start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + start + length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t + start);
    osc.stop(t + start + length + 0.02);
  };
  tone(987.77, 0, 0.09, 0.12); // B5
  tone(1318.51, 0.08, 0.5, 0.12); // E6
  return true;
}

// An order worth announcing: placed and either cash on delivery / gift
// card, or already paid online — never an online checkout still waiting
// for its payment (it may never be paid).
const counts = (o) => o.paymentStatus === "paid" || o.paymentMethod === "cod" || o.paymentMethod === "gift_card";

const money = (n, currency) => {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: currency || "INR", maximumFractionDigits: 0 }).format(Number(n) || 0);
  } catch {
    return `₹${n}`;
  }
};

/**
 * New-order alerts for the whole admin: checks for orders every 20
 * seconds and, for each new one, plays a coin sound and shows who ordered
 * what. Every open tab shows the note; only one of them rings. Browsers
 * only allow sound after the page has been clicked once — until then the
 * bell pulses to ask for that click, and alerts show silently. The button
 * turns the sound off and on.
 */
export function NewOrderAlerts({ storeId }) {
  const { notification } = App.useApp();
  const [soundOn, setSoundOn] = useState(true);
  const [audioReady, setAudioReady] = useState(false);
  const ctxRef = useRef(null);
  const seenRef = useRef(null); // Set of order ids known at/after load
  const titleRef = useRef(null);

  useEffect(() => {
    try {
      setSoundOn(localStorage.getItem(SOUND_KEY) !== "off");
    } catch {}
    // Audio can only start after a click/keypress on the page. Try at
    // once too — a browser that already trusts this site allows it.
    const unlock = () => {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        if (!ctxRef.current) {
          ctxRef.current = new Ctx();
          ctxRef.current.onstatechange = () => setAudioReady(ctxRef.current?.state === "running");
        }
        if (ctxRef.current.state !== "running") ctxRef.current.resume().catch(() => {});
        setAudioReady(ctxRef.current.state === "running");
      } catch {}
    };
    unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Claim an order's chime across tabs, so only one of them rings — and
  // only a tab that can actually play it claims it.
  const claim = useCallback(
    (id) => {
      const key = `oy-rung-${storeId}`;
      try {
        const list = JSON.parse(localStorage.getItem(key) || "[]");
        if (list.includes(id)) return false;
        localStorage.setItem(key, JSON.stringify([...list, id].slice(-100)));
      } catch {}
      return true;
    },
    [storeId]
  );

  const flashTitle = useCallback((text) => {
    if (typeof document === "undefined" || !document.hidden) return;
    if (!titleRef.current) titleRef.current = document.title;
    document.title = text;
    const restore = () => {
      if (titleRef.current) document.title = titleRef.current;
      titleRef.current = null;
      document.removeEventListener("visibilitychange", restore);
    };
    document.addEventListener("visibilitychange", restore);
  }, []);

  const poll = useCallback(async () => {
    let data;
    try {
      data = await apiFetch("/api/orders?page=1&pageSize=10");
    } catch {
      return;
    }
    const orders = (data.orders || []).filter(counts);
    const seenKey = `oy-orders-seen-${storeId}`;
    let fresh;
    if (!seenRef.current) {
      // First look: only what's newer than the last order this browser saw
      // (and recent) is news — not everything that already exists.
      let since = 0;
      try {
        since = Number(localStorage.getItem(seenKey)) || 0;
      } catch {}
      const floor = Math.max(since, Date.now() - CATCH_UP_MS);
      seenRef.current = new Set();
      fresh = since ? orders.filter((o) => new Date(o.createdAt).getTime() > floor) : [];
      orders.forEach((o) => seenRef.current.add(o.id));
    } else {
      fresh = orders.filter((o) => !seenRef.current.has(o.id));
      fresh.forEach((o) => seenRef.current.add(o.id));
    }
    const newest = Math.max(0, ...orders.map((o) => new Date(o.createdAt).getTime()));
    try {
      if (newest > (Number(localStorage.getItem(seenKey)) || 0)) localStorage.setItem(seenKey, String(newest));
    } catch {}
    fresh.reverse();
    let rang = false;
    for (const o of fresh.slice(-3)) {
      const who = o.customer?.name || o.shippingName || o.email || "A customer";
      const amount = money(o.total, o.currency);
      notification.open({
        key: `order-${o.id}`,
        message: `New order #${o.orderNumber} · ${amount}`,
        description: `${who}${o.paymentMethod === "cod" ? " · Cash on delivery" : " · Paid online"}`,
        placement: "bottomRight",
        duration: 12,
        btn: (
          <Link href={`/admin/orders/${o.id}`}>
            <Button type="primary" size="small" onClick={() => notification.destroy(`order-${o.id}`)}>
              View order
            </Button>
          </Link>
        ),
      });
      flashTitle(`🔔 New order #${o.orderNumber}`);
      let enabled = true;
      try {
        enabled = localStorage.getItem(SOUND_KEY) !== "off";
      } catch {}
      const ctx = ctxRef.current;
      if (enabled && !rang && ctx?.state === "running" && claim(o.id)) rang = playCoin(ctx);
    }
  }, [claim, notification, flashTitle, storeId]);

  useEffect(() => {
    if (!storeId) return;
    poll();
    const id = setInterval(poll, POLL_MS);
    const onVisible = () => !document.hidden && poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [storeId, poll]);

  function toggle() {
    // Sound is on but the browser hasn't allowed it yet: this click allows
    // it — play the chime so they know what to listen for, keep it on.
    const next = soundOn && !audioReady ? true : !soundOn;
    setSoundOn(next);
    try {
      localStorage.setItem(SOUND_KEY, next ? "on" : "off");
    } catch {}
    if (next) {
      // The click itself allows audio — play it so they know what to listen for.
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!ctxRef.current && Ctx) ctxRef.current = new Ctx();
        const ctx = ctxRef.current;
        if (ctx?.state === "suspended") {
          ctx.resume().then(() => {
            setAudioReady(true);
            playCoin(ctx);
          });
        } else playCoin(ctx);
      } catch {}
    }
  }

  const blocked = soundOn && !audioReady;
  return (
    <Tooltip title={blocked ? "Click anywhere once to allow the new-order sound" : soundOn ? "New-order sound on — click to mute" : "New-order sound off — click to turn on"}>
      <span className="relative inline-flex">
        <Button
          type="text"
          onClick={toggle}
          aria-pressed={soundOn}
          aria-label={soundOn ? "Mute new-order sound" : "Turn on new-order sound"}
          icon={soundOn ? <BellRing size={17} aria-hidden="true" /> : <BellOff size={17} aria-hidden="true" />}
        />
        {blocked && (
          <span className="pointer-events-none absolute top-1 right-1 flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-warning opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-status-warning" />
          </span>
        )}
      </span>
    </Tooltip>
  );
}

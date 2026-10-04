"use client";

import { API_URL } from "@/lib/api";

/**
 * Asks the Help assistant. The answer streams back as newline-delimited
 * JSON — { type: "start" | "delta" | "done" | "error" } — and each event is
 * handed to `onEvent` as it arrives, so the answer appears as it's written.
 */
export async function streamAsk({ question, chatId, signal }, onEvent) {
  const res = await fetch(`${API_URL}/api/support/ask`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, chatId: chatId || null }),
    signal,
  });
  if (!res.ok) {
    let msg = "Couldn't reach Help — try again.";
    try {
      msg = (await res.json()).error || msg;
    } catch {}
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut;
    while ((cut = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, cut).trim();
      buffer = buffer.slice(cut + 1);
      if (!line) continue;
      try {
        onEvent(JSON.parse(line));
      } catch {}
    }
  }
  if (buffer.trim()) {
    try {
      onEvent(JSON.parse(buffer));
    } catch {}
  }
}

export const TICKET_STATUS = {
  open: { label: "Waiting on Oyklane", tone: "info" },
  waiting: { label: "Waiting on you", tone: "warning" },
  resolved: { label: "Solved", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
};

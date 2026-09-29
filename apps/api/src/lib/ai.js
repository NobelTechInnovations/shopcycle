const { env } = require("../config/env");

/**
 * Claude, through Anthropic's Messages API, streamed. Used by the seller
 * Help assistant (modules/support/assistant.js). No SDK: one POST, and the
 * server-sent events are read as they arrive so the answer appears word by
 * word in the admin.
 */

function aiConfigured() {
  return Boolean(env.ANTHROPIC_API_KEY);
}

/**
 * Yields the answer's text as it's written.
 * @param {{ model: string, system: string, messages: {role: string, content: string}[], maxTokens?: number, signal?: AbortSignal }} req
 */
async function* streamText({ model, system, messages, maxTokens = 1200, signal }) {
  const res = await fetch(env.ANTHROPIC_API_URL, {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, system, messages, max_tokens: maxTokens, stream: true }),
    signal: signal || AbortSignal.timeout(90 * 1000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text.slice(0, 200);
    try {
      detail = JSON.parse(text).error?.message || detail;
    } catch {}
    throw new Error(`AI request failed (${res.status}): ${detail}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut;
    while ((cut = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const data = chunk
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("");
      if (!data) continue;
      let event;
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") yield event.delta.text;
      else if (event.type === "error") throw new Error(event.error?.message || "The AI service returned an error");
    }
  }
}

module.exports = { aiConfigured, streamText };

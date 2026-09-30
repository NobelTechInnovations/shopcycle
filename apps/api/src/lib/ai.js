const { env } = require("../config/env");

/**
 * The seller Help assistant's language model, streamed. Two providers:
 *
 *   nvidia     NVIDIA's hosted models (Nemotron 3 Ultra by default) through
 *              their OpenAI-compatible API — NVIDIA_API_KEY ("nvapi-…")
 *   anthropic  Claude — ANTHROPIC_API_KEY
 *
 * AI_PROVIDER picks one; otherwise it follows the key. An "nvapi-" key is
 * NVIDIA's whichever variable it was saved under. The answer is read as it
 * streams, so it appears word by word in the admin.
 */

const DEFAULT_MODEL = { nvidia: "nvidia/nemotron-3-ultra-550b-a55b", anthropic: "claude-opus-5-5" };

function aiProvider() {
  if (env.AI_PROVIDER) return env.AI_PROVIDER;
  if (env.NVIDIA_API_KEY || /^nvapi-/.test(env.ANTHROPIC_API_KEY || "")) return "nvidia";
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

function apiKey(provider = aiProvider()) {
  if (provider === "nvidia") return env.NVIDIA_API_KEY || (/^nvapi-/.test(env.ANTHROPIC_API_KEY || "") ? env.ANTHROPIC_API_KEY : "");
  if (provider === "anthropic") return env.ANTHROPIC_API_KEY || "";
  return "";
}

const aiConfigured = () => Boolean(aiProvider() && apiKey());
const defaultModel = () => DEFAULT_MODEL[aiProvider()] || DEFAULT_MODEL.nvidia;

/** Reads a server-sent-events body and yields each `data:` payload. */
async function* sseData(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut;
    while ((cut = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const chunk = buffer.slice(0, cut);
      buffer = buffer.slice(cut).replace(/^\r?\n\r?\n/, "");
      const data = chunk
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("");
      if (data) yield data;
    }
  }
  if (buffer.trim().startsWith("data:")) yield buffer.trim().slice(5).trim();
}

async function failure(res) {
  const text = await res.text().catch(() => "");
  let detail = text.slice(0, 300);
  try {
    const j = JSON.parse(text);
    detail = j.error?.message || j.detail || j.message || detail;
  } catch {}
  const err = new Error(`AI request failed (${res.status}): ${detail}`);
  err.status = res.status;
  return err;
}

/** Hides a model's thinking if it writes it inline as <think>…</think>. */
function thinkFilter() {
  let inside = false;
  let pending = "";
  const push = (text) => {
    pending += text;
    let out = "";
    for (;;) {
      if (inside) {
        const end = pending.indexOf("</think>");
        if (end < 0) {
          pending = pending.slice(-8);
          return out;
        }
        pending = pending.slice(end + 8);
        inside = false;
      } else {
        const start = pending.indexOf("<think>");
        if (start < 0) {
          // Hold back a possible partial "<think" at the end.
          const keep = pending.lastIndexOf("<");
          const safe = keep >= 0 && pending.length - keep < 7 ? keep : pending.length;
          out += pending.slice(0, safe);
          pending = pending.slice(safe);
          return out;
        }
        out += pending.slice(0, start);
        pending = pending.slice(start + 7);
        inside = true;
      }
    }
  };
  // End of the answer: whatever was held back, unless it's inside thinking.
  const flush = () => {
    const rest = inside ? "" : pending;
    pending = "";
    return rest;
  };
  return { push, flush };
}

async function* streamNvidia({ model, system, messages, maxTokens, signal }) {
  const body = {
    model,
    messages: [{ role: "system", content: system }, ...messages],
    max_tokens: maxTokens,
    temperature: 0.4,
    top_p: 0.95,
    stream: true,
    // Answer straight away — no long reasoning trace before a help reply.
    chat_template_kwargs: { enable_thinking: false },
  };
  const send = (b) =>
    fetch(env.NVIDIA_API_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey("nvidia")}`, "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify(b),
      signal: signal || AbortSignal.timeout(120 * 1000),
    });
  let res = await send(body);
  // A model that doesn't take the thinking switch: ask again without it.
  if (res.status === 400 || res.status === 422) {
    const { chat_template_kwargs, ...plain } = body; // eslint-disable-line no-unused-vars
    await res.text().catch(() => "");
    res = await send(plain);
  }
  if (!res.ok) throw await failure(res);
  const visible = thinkFilter();
  for await (const data of sseData(res.body)) {
    if (data === "[DONE]") break;
    let event;
    try {
      event = JSON.parse(data);
    } catch {
      continue;
    }
    if (event.error) throw new Error(event.error.message || "The AI service returned an error");
    // `reasoning_content` is the model's thinking — never shown to sellers.
    const text = event.choices?.[0]?.delta?.content;
    if (text) {
      const out = visible.push(text);
      if (out) yield out;
    }
  }
  const tail = visible.flush();
  if (tail) yield tail;
}

async function* streamAnthropic({ model, system, messages, maxTokens, signal }) {
  const res = await fetch(env.ANTHROPIC_API_URL, {
    method: "POST",
    headers: { "x-api-key": apiKey("anthropic"), "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, system, messages, max_tokens: maxTokens, stream: true }),
    signal: signal || AbortSignal.timeout(90 * 1000),
  });
  if (!res.ok) throw await failure(res);
  for await (const data of sseData(res.body)) {
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

/**
 * Yields the answer's text as it's written.
 * @param {{ model: string, system: string, messages: {role: string, content: string}[], maxTokens?: number, signal?: AbortSignal }} req
 */
function streamText({ model, system, messages, maxTokens = 1200, signal }) {
  const provider = aiProvider();
  const args = { model: model || defaultModel(), system, messages, maxTokens, signal };
  if (provider === "anthropic") return streamAnthropic(args);
  return streamNvidia(args);
}

module.exports = { aiConfigured, aiProvider, defaultModel, streamText, thinkFilter };

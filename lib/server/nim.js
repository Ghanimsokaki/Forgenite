/* NVIDIA NIM client (server-side). Shared by /api/chat and the automation
 * engine. NVIDIA_BASE_URL can point to any OpenAI-compatible endpoint (used
 * by the test-suite's mock server, or a self-hosted NIM container). */

export const NIM_BASE = (process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1").replace(/\/+$/, "");

export const clamp = (v, min, max, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

export const stripThink = (s) => String(s || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

export function serverKey() {
  return (process.env.NVIDIA_API_KEY || "").trim();
}

export function resolveKey(req) {
  return ((req && req.headers.get("x-nvidia-api-key")) || "").trim() || serverKey();
}

/** Validate + normalise a messages[] array. Returns null if unusable. */
export function cleanMessages(messages) {
  if (!Array.isArray(messages)) return null;
  const clean = messages
    .filter(
      (m) =>
        m &&
        typeof m.content === "string" &&
        (m.role === "user" || m.role === "assistant" || m.role === "system")
    )
    .slice(-41)
    .map((m) => ({ role: m.role, content: stripThink(m.content).slice(0, 48000) }))
    .filter((m) => m.content.length > 0 || m.role !== "assistant");
  if (!clean.some((m) => m.role === "user")) return null;
  return clean;
}

export function errorHint(status) {
  if (status === 401 || status === 403)
    return (
      " — check that your key is a valid nvapi- key, and that your account can use this model family " +
      '(open the model page on build.nvidia.com and click "Try API" once to register for it).'
    );
  if (status === 404)
    return (
      " — this model is not available on your account/key. Pick another model from the list " +
      "(with a key set, the model picker loads the live list of exactly what you can call)."
    );
  if (status === 429)
    return (
      " — rate limit hit. The NVIDIA free tier allows ~40 requests/minute shared across ALL models; " +
      "wait a moment and try again."
    );
  if (status >= 500) return " — the model may be overloaded or temporarily down. Try again or switch models.";
  return "";
}

export class NimError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** POST chat/completions with stream:true. Returns the raw upstream Response
 *  (ok) or throws NimError with a friendly message. */
export async function nimRequest(key, { model, messages, temperature, max_tokens, signal }) {
  let upstream;
  try {
    upstream = await fetch(`${NIM_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: clamp(temperature, 0, 1, 0.7),
        top_p: 0.95,
        max_tokens: Math.round(clamp(max_tokens, 128, 16384, 1024)),
        stream: true,
      }),
      signal,
    });
  } catch (e) {
    if (e && e.name === "AbortError") throw e;
    throw new NimError(
      `Could not reach NVIDIA NIM (network error: ${e.message}). Check the server's internet connection / firewall and try again.`,
      502
    );
  }
  if (!upstream.ok) {
    let msg = `NVIDIA NIM returned ${upstream.status}`;
    try {
      const j = await upstream.json();
      msg =
        (j.error && (j.error.message || j.error.title)) ||
        (typeof j.error === "string" ? j.error : null) ||
        (typeof j.detail === "string" ? j.detail : null) ||
        j.title ||
        j.message ||
        msg;
    } catch {
      /* keep default */
    }
    throw new NimError(msg + errorHint(upstream.status), upstream.status);
  }
  return upstream;
}

/** Turn an upstream Response (SSE or JSON) into an async iterator of plain
 *  text chunks; reasoning deltas are wrapped in <think>…</think>. */
export async function* nimTextChunks(upstream) {
  const ct = upstream.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const j = await upstream.json().catch(() => null);
    const message = j?.choices?.[0]?.message;
    const reasoning = message?.reasoning_content ?? message?.reasoning ?? "";
    if (typeof reasoning === "string" && reasoning.trim()) yield `<think>\n${reasoning}\n</think>\n`;
    if (message?.content) yield message.content;
    return;
  }
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let inThink = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        let obj;
        try {
          obj = JSON.parse(data);
        } catch {
          continue;
        }
        if (obj.error) {
          const em = obj.error.message || (typeof obj.error === "string" ? obj.error : "Unknown upstream error");
          if (inThink) {
            yield "\n</think>\n";
            inThink = false;
          }
          yield `\n\n⚠️ ${em}`;
          continue;
        }
        const delta = obj.choices?.[0]?.delta;
        if (!delta) continue;
        const r = delta.reasoning_content ?? delta.reasoning;
        if (r && typeof r === "string") {
          if (!inThink) {
            yield "<think>\n";
            inThink = true;
          }
          yield r;
        }
        if (delta.content && typeof delta.content === "string") {
          if (inThink) {
            yield "\n</think>\n";
            inThink = false;
          }
          yield delta.content;
        }
      }
    }
  } finally {
    if (inThink) yield "\n</think>\n";
    reader.releaseLock?.();
  }
}

/** Non-streaming helper for server-side agents (automations). */
export async function nimChatText(key, opts) {
  const messages = cleanMessages(opts.messages);
  if (!messages) throw new NimError("At least one user message is required.", 400);
  const upstream = await nimRequest(key, { ...opts, messages });
  let out = "";
  for await (const c of nimTextChunks(upstream)) out += c;
  return out;
}

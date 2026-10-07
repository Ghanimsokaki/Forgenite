import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NIM_CHAT_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

const clamp = (v, min, max, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

/**
 * POST /api/chat
 * Body: { model, messages, temperature?, max_tokens? }
 * Streams the assistant reply as plain-text chunks (SSE from NVIDIA NIM is
 * parsed server-side so the client only appends text deltas).
 *
 * Reasoning models (DeepSeek R1-style, QwQ, …) emit a `reasoning_content`
 * delta (some servers call it `reasoning`) alongside `content`. We wrap it in
 * <think>…</think> tags so the client can render it as a collapsible block,
 * and so token-usage/stop detection works the same for both kinds of models.
 *
 * The NVIDIA key is taken from the x-nvidia-api-key header (key pasted in the
 * browser Settings) or from the NVIDIA_API_KEY environment variable.
 */
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { model, messages, temperature, max_tokens } = body || {};

  if (!model || typeof model !== "string" || model.length > 120) {
    return NextResponse.json({ error: "A model is required." }, { status: 400 });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages[] is required." }, { status: 400 });
  }

  // Strip completed <think>…</think> blocks from history before sending
  // upstream. Reasoning tokens are already rendered in the UI — re-sending
  // them wastes context and confuses some models.
  const stripThink = (s) => String(s || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // Keep only what we expect, cap history and per-message size.
  const clean = messages
    .filter(
      (m) =>
        m &&
        typeof m.content === "string" &&
        (m.role === "user" || m.role === "assistant" || m.role === "system")
    )
    .slice(-41)
    .map((m) => ({ role: m.role, content: stripThink(m.content).slice(0, 32000) }))
    .filter((m) => m.content.length > 0 || m.role !== "assistant");

  if (!clean.some((m) => m.role === "user")) {
    return NextResponse.json({ error: "At least one user message is required." }, { status: 400 });
  }

  const key =
    (req.headers.get("x-nvidia-api-key") || "").trim() ||
    (process.env.NVIDIA_API_KEY || "").trim();

  if (!key) {
    return NextResponse.json(
      {
        error:
          "No NVIDIA API key configured. Set NVIDIA_API_KEY as an environment variable on Vercel/Netlify (or in your .env.local), or paste an nvapi- key in the app's Settings.",
      },
      { status: 401 }
    );
  }

  let upstream;
  try {
    upstream = await fetch(NIM_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model,
        messages: clean,
        temperature: clamp(temperature, 0, 1, 0.7),
        top_p: 0.95,
        max_tokens: Math.round(clamp(max_tokens, 128, 8192, 1024)),
        stream: true,
      }),
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          `Could not reach NVIDIA NIM (network error: ${e.message}). ` +
          "If you are viewing this inside a sandboxed preview, outbound internet is blocked there — " +
          "run the app locally (npm run dev) or deploy it on Vercel/Netlify and it will connect. " +
          "Otherwise check your internet connection / firewall and try again.",
      },
      { status: 502 }
    );
  }

  if (!upstream.ok) {
    let msg = `NVIDIA NIM returned ${upstream.status}`;
    try {
      const j = await upstream.json();
      msg =
        (j.error && (j.error.message || j.error.title)) ||
        (typeof j.detail === "string" ? j.detail : null) ||
        j.title ||
        j.message ||
        msg;
    } catch {
      // keep default
    }

    const s = upstream.status;
    let hint = "";
    if (s === 401 || s === 403) {
      hint =
        " — check that your key is a valid nvapi- key, and that your account can use this model family " +
        '(open the model page on build.nvidia.com and click "Try API" once to register for it).';
    } else if (s === 404) {
      hint =
        " — this model is not available on your account/key. Pick another model from the list " +
        "(with a key set, the model picker loads the live list of exactly what you can call).";
    } else if (s === 429) {
      hint =
        " — rate limit hit. The NVIDIA free tier allows ~40 requests/minute shared across ALL models; " +
        "wait a moment and try again.";
    } else if (s >= 500) {
      hint = " — the model may be overloaded or temporarily down. Try again or switch models.";
    }

    return NextResponse.json({ error: msg + hint }, { status: upstream.status });
  }

  const contentType = upstream.headers.get("content-type") || "";

  // Non-streaming JSON reply (safety net): emit reasoning wrapped in <think>
  // tags followed by the assistant content.
  if (contentType.includes("application/json")) {
    const j = await upstream.json().catch(() => null);
    const message = j?.choices?.[0]?.message;
    const content = message?.content ?? "";
    const reasoning = message?.reasoning_content ?? message?.reasoning ?? "";
    let out = "";
    if (reasoning && typeof reasoning === "string" && reasoning.trim()) {
      out += `<think>\n${reasoning}\n</think>\n`;
    }
    out += content;
    return new Response(out, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // Transform the SSE stream into a plain-text delta stream, wrapping
  // reasoning tokens in <think>…</think>.
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body.getReader();
      let buffer = "";
      let inThink = false; // true after we've emitted "<think>\n"
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
            if (!data) continue;
            if (data === "[DONE]") continue;

            try {
              const obj = JSON.parse(data);
              if (obj.error) {
                const em =
                  obj.error.message ||
                  (typeof obj.error === "string" ? obj.error : "Unknown upstream error");
                // Close any open think block before appending an error.
                if (inThink) {
                  controller.enqueue(encoder.encode("\n</think>\n"));
                  inThink = false;
                }
                controller.enqueue(encoder.encode(`\n\n⚠️ ${em}`));
                continue;
              }
              const delta = obj.choices?.[0]?.delta;
              if (!delta) continue;
              const reasoningChunk = delta.reasoning_content ?? delta.reasoning;
              const contentChunk = delta.content;

              // First, any reasoning chunk: ensure <think> is open.
              if (reasoningChunk && typeof reasoningChunk === "string") {
                if (!inThink) {
                  controller.enqueue(encoder.encode("<think>\n"));
                  inThink = true;
                }
                controller.enqueue(encoder.encode(reasoningChunk));
              }

              // Then any content chunk: close think if open, then forward.
              if (contentChunk && typeof contentChunk === "string") {
                if (inThink) {
                  controller.enqueue(encoder.encode("\n</think>\n"));
                  inThink = false;
                }
                controller.enqueue(encoder.encode(contentChunk));
              }
            } catch {
              // partial JSON line — ignore, it will re-appear in the next chunk
            }
          }
        }
        // End of stream: close an open think block.
        if (inThink) {
          controller.enqueue(encoder.encode("\n</think>\n"));
          inThink = false;
        }
      } catch (e) {
        try {
          if (inThink) {
            controller.enqueue(encoder.encode("\n</think>\n"));
            inThink = false;
          }
          controller.enqueue(encoder.encode(`\n\n⚠️ Stream interrupted: ${e.message}`));
        } catch {
          // controller already closed
        }
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
    cancel() {
      upstream.body?.cancel().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

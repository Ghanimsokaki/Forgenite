import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NIM_CHAT_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

const THINK_OPEN = "<think>\n";
const THINK_CLOSE = "\n</think>\n";

/** Reasoning models stream their chain of thought in a separate field; wrap it so the client can render it. */
const wrapReasoning = (text) => `<think>\n${text}\n</think>\n`;

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
 * The NVIDIA key is taken from the x-nvidia-api-key header (key pasted in the
 * browser Settings) or from the NVIDIA_API_KEY environment variable (Vercel).
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

  // Keep only what we expect, cap history and per-message size.
  const clean = messages
    .filter(
      (m) =>
        m &&
        typeof m.content === "string" &&
        (m.role === "user" || m.role === "assistant" || m.role === "system")
    )
    .slice(-41)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 32000) }));

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
          "No NVIDIA API key configured. Set NVIDIA_API_KEY as an environment variable on Vercel (or in your .env.local), or paste an nvapi- key in the app's Settings.",
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
        max_tokens: Math.round(clamp(max_tokens, 128, 4096, 1024)),
        stream: true,
      }),
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          `Could not reach NVIDIA NIM (network error: ${e.message}). ` +
          "If you are viewing this inside a sandboxed preview, outbound internet is blocked there — " +
          "run the app locally (npm run dev) or deploy it on Vercel and it will connect. " +
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

  // Non-streaming JSON reply (safety net): emit the full content at once.
  // Reasoning models can return an empty `content` with the answer in
  // `reasoning_content` — prepend it (wrapped) so the reply is never blank.
  if (contentType.includes("application/json")) {
    const j = await upstream.json().catch(() => null);
    const message = j?.choices?.[0]?.message || {};
    const content = message.content ?? "";
    const reasoning = message.reasoning_content ?? message.reasoning;
    const text =
      !content && typeof reasoning === "string" && reasoning.trim()
        ? wrapReasoning(reasoning)
        : content;
    return new Response(text, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // Transform the SSE stream into a plain-text delta stream.
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body.getReader();
      let buffer = "";
      let thinkOpen = false;

      const emit = (text) => {
        if (text) controller.enqueue(encoder.encode(text));
      };

      // Reasoning chunks arrive before the answer. Wrap the whole reasoning
      // block in <think> … </think> so the client can collapse it.
      const pushReasoning = (text) => {
        if (!thinkOpen) {
          thinkOpen = true;
          emit(THINK_OPEN);
        }
        emit(text);
      };

      // Close the reasoning block as soon as real content shows up (or at the
      // end of the stream) so the thought never swallows the answer.
      const closeThink = () => {
        if (thinkOpen) {
          thinkOpen = false;
          emit(THINK_CLOSE);
        }
      };

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
                closeThink();
                emit(`\n\n⚠️ ${em}`);
                continue;
              }

              const delta = obj.choices?.[0]?.delta || {};
              const reasoning = delta.reasoning_content ?? delta.reasoning;
              if (typeof reasoning === "string" && reasoning) pushReasoning(reasoning);

              if (delta.content) {
                closeThink();
                emit(delta.content);
              }
            } catch {
              // partial JSON line — ignore, it will re-appear in the next chunk
            }
          }
        }
        closeThink();
      } catch (e) {
        try {
          closeThink();
          emit(`\n\n⚠️ Stream interrupted: ${e.message}`);
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

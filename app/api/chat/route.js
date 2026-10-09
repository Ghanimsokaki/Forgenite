import { NextResponse } from "next/server";
import { cleanMessages, nimRequest, nimTextChunks, resolveKey, NimError } from "@/lib/server/nim";
import { guard } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/chat  { model, messages, temperature?, max_tokens? }
 * Streams the assistant reply as plain-text chunks. Reasoning tokens are
 * wrapped in <think>…</think>. Key: x-nvidia-api-key header or NVIDIA_API_KEY.
 */
export async function POST(req) {
  const blocked = guard(req, { name: "chat" });
  if (blocked) return blocked;

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
  const clean = cleanMessages(messages);
  if (!clean) return NextResponse.json({ error: "At least one user message is required." }, { status: 400 });

  const key = resolveKey(req);
  if (!key) {
    return NextResponse.json(
      {
        error:
          "No NVIDIA API key configured. Set NVIDIA_API_KEY as an environment variable on the server (or in .env.local), or paste an nvapi- key in the app's Settings.",
      },
      { status: 401 }
    );
  }

  let upstream;
  try {
    upstream = await nimRequest(key, { model, messages: clean, temperature, max_tokens, signal: req.signal });
  } catch (e) {
    if (e instanceof NimError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: e.message || "Upstream error." }, { status: 502 });
  }

  const encoder = new TextEncoder();
  const iter = nimTextChunks(upstream);
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await iter.next();
        if (done) controller.close();
        else controller.enqueue(encoder.encode(value));
      } catch (e) {
        try {
          controller.enqueue(encoder.encode(`\n\n⚠️ Stream interrupted: ${e.message}`));
          controller.close();
        } catch {
          /* closed */
        }
      }
    },
    cancel() {
      iter.return?.();
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

/* Forgenite Agent — client-side autonomous loop.
 *
 * The user states a goal; the agent then runs in a loop: it reasons, calls a
 * tool, reads the observation, and repeats — automatically — until the task is
 * done. Model calls go through the normal /api/chat streaming endpoint (short
 * requests, no serverless time limits); tool execution goes through /api/tools
 * (web_search, open_url, run_javascript) or happens locally (write_file /
 * append_file create artifacts in the browser).
 */

export const AGENT_TOOLS = [
  "web_search",
  "open_url",
  "run_javascript",
  "write_file",
  "append_file",
];

export const AGENT_PROMPT = `You are Forgenite Agent, an autonomous AI that completes the user's task step by step using tools, without asking unnecessary questions.

PROTOCOL — VERY IMPORTANT
You are running in an automated loop. Every reply you send MUST be exactly ONE JSON object and nothing else — no markdown fences, no text before or after the JSON. Two allowed shapes:

{"thought":"one short sentence explaining your reasoning","action":{"tool":"<name>","input":{...}}}

{"thought":"...","final":"<your complete answer for the user, Markdown allowed>"}

Reply with "final" only when the task is fully done (all files written, all questions answered).

TOOLS
1. web_search — input {"query":"..."} — searches the web; returns titles, links and snippets.
2. open_url — input {"url":"https://..."} — reads a web page and returns its text (truncated). Use it on links found by web_search.
3. run_javascript — input {"code":"..."} — runs JavaScript in a sandbox (3s limit) and returns console output and the result value. Use it for exact math, data processing, and generating or verifying content programmatically.
4. write_file — input {"path":"index.html","content":"..."} — creates a file artifact the user can view, preview and download. Use this whenever the user asks you to MAKE something (a website, a script, a document, ...). Always write the COMPLETE file content.
5. append_file — input {"path":"index.html","content":"..."} — appends content to a previously written file. For big files, write them in parts of roughly 150-250 lines so nothing gets cut off.

RULES
- One tool call per turn. After each action you will receive an OBSERVATION with the real result.
- Never invent tool results or claim you wrote files you did not write.
- If you already know the answer, skip research tools and finish quickly.
- Do not ask the user questions unless the task is truly impossible to start; make sensible assumptions and state them in "final".
- Keep "thought" to one short sentence.
- When writing code or document files, make them complete, runnable and high quality.`;

/* ---------------- JSON extraction (tolerant) ---------------- */

function tryParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    /* try a lenient repair below */
  }
  try {
    return JSON.parse(s.replace(/,\s*([}\]])/g, "$1"));
  } catch {
    return null;
  }
}

export function extractJson(text) {
  if (!text) return null;
  let t = String(text).trim();
  // Some reasoning models wrap output in <think>…</think> — drop it.
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (!t) return null;

  const candidates = [];
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(t);
  if (fence) candidates.push(fence[1].trim());
  candidates.push(t);

  for (const c of candidates) {
    const start = c.indexOf("{");
    if (start === -1) continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < c.length; i++) {
      const ch = c[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const obj = tryParse(c.slice(start, i + 1));
          if (obj) return obj;
          break;
        }
      }
    }
  }

  return tryParse(t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, ""));
}

/* ---------------- helpers ---------------- */

export function sanitizePath(p) {
  let s = String(p || "").trim().replace(/\\/g, "/");
  s = s.replace(/^\/+/, "");
  const parts = s.split("/").filter((seg) => seg && seg !== "." && seg !== "..");
  s = parts.join("/");
  if (!s) s = "file.txt";
  if (s.length > 100) s = s.slice(-100);
  return s;
}

/* ---------------- transport ---------------- */

export async function callChat({ messages, model, temperature, maxTokens, apiKey, signal }) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "x-nvidia-api-key": apiKey } : {}),
    },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
    signal,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `Chat request failed (${res.status}).`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    full += dec.decode(value, { stream: true });
  }
  return full;
}

export async function executeTool(tool, input, signal) {
  try {
    const res = await fetch("/api/tools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool, input }),
      signal,
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || !j.ok) {
      return { ok: false, error: (j && j.error) || `Tool failed (${res.status}).` };
    }
    return { ok: true, result: j.result };
  } catch (e) {
    if (e && e.name === "AbortError") throw e;
    return { ok: false, error: (e && e.message) || "Tool request failed." };
  }
}

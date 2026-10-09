/* Forgenite Agent Core — environment-agnostic autonomous loop.
 *
 * Used by:
 *   - the browser Agent mode   (callModel → /api/chat, tools → /api/tools)
 *   - the Web Builder AI       (same, with project files pre-loaded)
 *   - 24/7 server automations  (callModel → NIM directly, tools in-process)
 *
 * The model must reply with ONE JSON object per turn:
 *   {"thought":"…","action":{"tool":"name","input":{…}}}
 *   {"thought":"…","actions":[{"tool":…,"input":…}, …]}   (batch, max 6)
 *   {"thought":"…","final":"markdown answer"}
 */

export const FILE_TOOLS = ["write_file", "append_file", "read_file", "list_files", "delete_file"];
export const BASE_TOOLS = ["web_search", "open_url", "run_javascript", ...FILE_TOOLS];

const TOOL_DOCS = {
  web_search: 'web_search — input {"query":"..."} — searches the web; returns titles, links and snippets.',
  open_url: 'open_url — input {"url":"https://..."} — reads a web page / JSON API and returns its text (truncated).',
  run_javascript:
    'run_javascript — input {"code":"..."} — runs JavaScript in an isolated sandbox (3s limit, no network/DOM) and returns console output and the last expression value. Use it for exact math and data processing.',
  write_file:
    'write_file — input {"path":"index.html","content":"..."} — creates/overwrites a file artifact. Always write the COMPLETE file content.',
  append_file:
    'append_file — input {"path":"index.html","content":"..."} — appends to an existing file. For big files write them in parts of ~150-250 lines.',
  read_file: 'read_file — input {"path":"style.css"} — returns the current content of a file.',
  list_files: "list_files — input {} — lists all files with their sizes.",
  delete_file: 'delete_file — input {"path":"old.js"} — deletes a file.',
  mcp_call:
    'mcp_call — input {"server":"<server name>","tool":"<tool name>","arguments":{...}} — calls a tool on a connected MCP server.',
  notify:
    'notify — input {"message":"..."} — sends a short notification to the owner (webhook). Use only when something noteworthy happens.',
};

export function buildAgentPrompt({ tools = BASE_TOOLS, extra = "", mcpServers = [] } = {}) {
  const list = tools
    .filter((t) => TOOL_DOCS[t])
    .map((t, i) => `${i + 1}. ${TOOL_DOCS[t]}`)
    .join("\n");
  const mcp =
    tools.includes("mcp_call") && mcpServers.length
      ? "\n\nCONNECTED MCP SERVERS\n" +
        mcpServers
          .map(
            (s) =>
              `- "${s.name}": ` +
              ((s.tools || [])
                .slice(0, 25)
                .map((t) => `${t.name}${t.description ? ` (${String(t.description).slice(0, 80)})` : ""}`)
                .join("; ") || "(no tools listed)")
          )
          .join("\n")
      : "";

  return `You are Forgenite Agent, an autonomous AI that completes the user's task step by step using tools, without asking unnecessary questions.

PROTOCOL — VERY IMPORTANT
You run in an automated loop. Every reply MUST be exactly ONE JSON object and nothing else — no markdown fences, no text before or after. Allowed shapes:

{"thought":"one short sentence","action":{"tool":"<name>","input":{...}}}
{"thought":"one short sentence","actions":[{"tool":"write_file","input":{...}},{"tool":"write_file","input":{...}}]}
{"thought":"...","final":"<complete answer for the user, Markdown allowed>"}

Use "actions" (max 6) to write several files in one turn. Reply with "final" only when the task is fully done.
Inside JSON strings escape newlines as \\n and quotes as \\".

TOOLS
${list}${mcp}

RULES
- After each turn you receive OBSERVATION(s) with the real results.
- Never invent tool results or claim you wrote files you did not write.
- If you already know the answer, skip research tools and finish quickly.
- Do not ask the user questions; make sensible assumptions and state them in "final".
- Code and documents you write must be complete, runnable and high quality. Websites: semantic HTML, responsive CSS, accessible, no external build step; reference local files by relative path (e.g. <link rel="stylesheet" href="style.css">).${
    extra ? "\n\n" + extra : ""
  }`;
}

/* ---------------- JSON extraction (tolerant) ---------------- */

function tryParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    /* lenient repair below */
  }
  try {
    return JSON.parse(s.replace(/,\s*([}\]])/g, "$1"));
  } catch {
    /* try escaping raw newlines inside strings */
  }
  try {
    let out = "";
    let inStr = false;
    let esc = false;
    for (const ch of s) {
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        else if (ch === "\n") {
          out += "\\n";
          continue;
        } else if (ch === "\r") continue;
        else if (ch === "\t") {
          out += "\\t";
          continue;
        }
      } else if (ch === '"') inStr = true;
      out += ch;
    }
    return JSON.parse(out.replace(/,\s*([}\]])/g, "$1"));
  } catch {
    return null;
  }
}

export function extractJson(text) {
  if (!text) return null;
  let t = String(text).trim();
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*?<\/think>/i, "").trim();
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
  s = parts.map((seg) => seg.replace(/[<>:"|?*\u0000-\u001f]/g, "_")).join("/");
  if (!s) s = "file.txt";
  if (s.length > 150) s = s.slice(-150);
  return s;
}

function abortError() {
  const e = new Error("Aborted");
  e.name = "AbortError";
  return e;
}

/**
 * Run the agent loop.
 * @param {object} o
 * @param {string} o.task
 * @param {string} [o.context]            extra context appended to the task
 * @param {(messages)=>Promise<string>} o.callModel
 * @param {(tool,input)=>Promise<{ok,result?,error?}>} o.executeTool  non-file tools
 * @param {string[]} [o.tools]            allowed tool names
 * @param {string} [o.systemPrompt]       override the built prompt
 * @param {{path,content}[]} [o.files]    initial files (builder projects)
 * @param {number} [o.maxSteps]
 * @param {AbortSignal} [o.signal]
 * @param {(event)=>void} [o.onEvent]     {type:"phase"|"step"|"step-update"|"files"}
 * @returns {Promise<{status:"done"|"error"|"stopped", final, error, steps, files}>}
 */
export async function runAgentLoop(o) {
  const tools = o.tools || BASE_TOOLS;
  const maxSteps = Math.min(Math.max(Number(o.maxSteps) || 8, 1), 40);
  const emit = o.onEvent || (() => {});
  const signal = o.signal;
  const files = new Map((o.files || []).map((f) => [f.path, f.content]));
  const steps = [];
  const fileList = () => [...files.entries()].map(([path, content]) => ({ path, content }));

  const messages = [
    { role: "system", content: o.systemPrompt || buildAgentPrompt({ tools }) },
    {
      role: "user",
      content:
        `TASK:\n${o.task}` +
        (files.size
          ? `\n\nCURRENT PROJECT FILES (${files.size}):\n` +
            [...files.entries()].map(([p, c]) => `- ${p} (${c.length} chars)`).join("\n") +
            "\nUse read_file to inspect a file before editing it."
          : "") +
        (o.context ? `\n\n${o.context}` : ""),
    },
  ];

  const runLocalFileTool = (tool, input) => {
    const path = sanitizePath(input.path);
    if (tool === "write_file") {
      const content = String(input.content ?? "");
      files.set(path, content);
      emit({ type: "files", files: fileList() });
      return { ok: true, result: `File "${path}" saved (${content.length} characters).` };
    }
    if (tool === "append_file") {
      if (!files.has(path)) return { ok: false, error: `file "${path}" does not exist yet. Use write_file first.` };
      const content = String(input.content ?? "");
      files.set(path, files.get(path) + content);
      emit({ type: "files", files: fileList() });
      return { ok: true, result: `Appended ${content.length} characters to "${path}" (now ${files.get(path).length} total).` };
    }
    if (tool === "read_file") {
      if (!files.has(path)) return { ok: false, error: `file "${path}" not found. Existing: ${[...files.keys()].join(", ") || "(none)"}` };
      const c = files.get(path);
      return { ok: true, result: c.length > 12000 ? c.slice(0, 12000) + "\n… (truncated)" : c };
    }
    if (tool === "list_files") {
      return {
        ok: true,
        result: files.size ? [...files.entries()].map(([p, c]) => `${p}  (${c.length} chars)`).join("\n") : "(no files yet)",
      };
    }
    if (tool === "delete_file") {
      if (!files.delete(path)) return { ok: false, error: `file "${path}" not found.` };
      emit({ type: "files", files: fileList() });
      return { ok: true, result: `Deleted "${path}".` };
    }
    return { ok: false, error: "unknown file tool" };
  };

  let parseFails = 0;
  let stepsUsed = 0;
  let final = "";

  try {
    while (stepsUsed < maxSteps) {
      if (signal?.aborted) throw abortError();
      emit({ type: "phase", phase: "thinking" });
      const raw = await o.callModel(messages);
      const parsed = extractJson(raw);
      const actions = parsed
        ? Array.isArray(parsed.actions)
          ? parsed.actions.slice(0, 6)
          : parsed.action
          ? [parsed.action]
          : []
        : [];

      if (!parsed || (!actions.length && parsed.final === undefined)) {
        parseFails++;
        if (parseFails >= 2) {
          const prose = String(raw || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
          if (prose && !prose.startsWith("{")) {
            final = prose;
            break;
          }
          throw new Error(
            "The model could not follow the agent protocol (invalid JSON twice in a row). Try a stronger model."
          );
        }
        messages.push(
          { role: "assistant", content: String(raw || "").slice(0, 1500) },
          {
            role: "user",
            content:
              'That was not a single valid JSON object. Reply again with EXACTLY one JSON object: {"thought":"...","action":{"tool":"...","input":{...}}} or {"thought":"...","final":"..."}. No other text.',
          }
        );
        continue;
      }
      parseFails = 0;

      if (parsed.final !== undefined || actions.some((a) => a?.tool === "finish")) {
        const fin = actions.find((a) => a?.tool === "finish");
        final =
          typeof parsed.final === "string" && parsed.final.trim()
            ? parsed.final
            : fin?.input?.summary || "Task complete.";
        // If the model batched file writes with final, still apply them.
        for (const a of actions) if (a && FILE_TOOLS.includes(a.tool)) runLocalFileTool(a.tool, a.input || {});
        break;
      }

      messages.push({ role: "assistant", content: JSON.stringify(parsed).slice(0, 20000) });
      const thought = typeof parsed.thought === "string" ? parsed.thought.slice(0, 500) : "";
      const observations = [];

      for (let ai = 0; ai < actions.length; ai++) {
        const tool = actions[ai]?.tool;
        const input = (actions[ai] && typeof actions[ai].input === "object" && actions[ai].input) || {};
        const step = { thought: ai === 0 ? thought : "", tool: tool || "unknown", input, observation: null, ok: null, ms: 0 };
        steps.push(step);
        const idx = steps.length - 1;
        emit({ type: "step", index: idx, step: { ...step } });
        emit({ type: "phase", phase: "acting" });

        const t0 = Date.now();
        let r;
        if (!tools.includes(tool)) {
          r = { ok: false, error: `unknown tool "${tool}". Available: ${tools.join(", ")}.` };
        } else if (FILE_TOOLS.includes(tool)) {
          r = runLocalFileTool(tool, input);
        } else {
          try {
            r = await o.executeTool(tool, input, signal);
          } catch (e) {
            if (e && e.name === "AbortError") throw e;
            r = { ok: false, error: e?.message || String(e) };
          }
        }
        const observation = r.ok ? String(r.result ?? "") : `TOOL ERROR: ${r.error}`;
        Object.assign(step, { observation: observation.slice(0, 8000), ok: !!r.ok, ms: Date.now() - t0 });
        emit({ type: "step-update", index: idx, step: { ...step } });
        observations.push(
          (actions.length > 1 ? `[${ai + 1}] ${tool}: ` : "") + observation.slice(0, actions.length > 1 ? 2500 : 6000)
        );
        stepsUsed++;
      }
      messages.push({ role: "user", content: `OBSERVATION:\n${observations.join("\n\n")}` });
    }

    if (!final) {
      if (signal?.aborted) throw abortError();
      messages.push({
        role: "user",
        content:
          'You have reached the maximum number of steps. Reply now with your final JSON {"thought":"...","final":"..."} — summarize what was accomplished and list any files you created. Do not call any more tools.',
      });
      emit({ type: "phase", phase: "thinking" });
      const raw = await o.callModel(messages);
      const parsed = extractJson(raw);
      final =
        (parsed && typeof parsed.final === "string" && parsed.final.trim()) ||
        "The agent used all its steps. Partial results and files are kept above — you can retry or continue.";
    }
    emit({ type: "phase", phase: null });
    return { status: "done", final, error: "", steps, files: fileList() };
  } catch (e) {
    emit({ type: "phase", phase: null });
    if (e && e.name === "AbortError") return { status: "stopped", final: "", error: "", steps, files: fileList() };
    return { status: "error", final: "", error: e?.message || String(e), steps, files: fileList() };
  }
}

/* 24/7 Automation engine.
 *
 * An automation = a task + a schedule. When due, the server runs the full
 * autonomous agent loop (same core as the browser agent) against NVIDIA NIM,
 * stores the run history, optionally publishes generated files to a hosted
 * site and/or posts the result to a webhook (Discord / Slack / any URL).
 *
 * The scheduler is started from instrumentation.js when the Node server
 * boots (`npm start`, pm2, Docker…). On serverless hosts, call
 * GET /api/cron?secret=CRON_SECRET every minute instead (Vercel Cron etc.).
 */
import { runAgentLoop, buildAgentPrompt } from "../agentCore.js";
import { nextRun, validateSchedule } from "../schedule.js";
import { DEFAULT_MODEL } from "../models.js";
import { nimChatText, serverKey } from "./nim.js";
import { executeServerTool } from "./tools.js";
import { mcpCallTool } from "./mcp.js";
import { safeFetch } from "./net.js";
import { readCollection, updateCollection, newId, EPHEMERAL } from "./store.js";
import { publishFiles } from "./sites.js";

const AUTOS = "automations";
const RUNS = "runs";
const MAX_RUNS_PER_AUTOMATION = 30;
const MAX_AUTOMATIONS = 100;
const CONCURRENCY = Math.max(1, Number(process.env.FORGENITE_AUTOMATION_CONCURRENCY || 2));

const g = globalThis.__forgeniteAuto || (globalThis.__forgeniteAuto = { running: new Map(), timer: null, ticking: false, started: false, lastTick: 0 });

/* ---------------- CRUD ---------------- */

const str = (v, max) => String(v ?? "").slice(0, max);

export function sanitizeAutomation(input, existing = {}) {
  const a = { ...existing };
  if (input.name !== undefined) a.name = str(input.name, 80).trim() || "Untitled automation";
  if (input.task !== undefined) {
    a.task = str(input.task, 8000).trim();
    if (!a.task) throw new Error("task is required");
  }
  if (input.model !== undefined) a.model = str(input.model, 120).trim() || DEFAULT_MODEL;
  if (input.schedule !== undefined) a.schedule = validateSchedule(input.schedule);
  if (input.enabled !== undefined) a.enabled = !!input.enabled;
  if (input.mode !== undefined) a.mode = input.mode === "prompt" ? "prompt" : "agent";
  if (input.maxSteps !== undefined) a.maxSteps = Math.min(Math.max(Math.round(Number(input.maxSteps) || 8), 1), 30);
  if (input.webhookUrl !== undefined) {
    const w = str(input.webhookUrl, 1000).trim();
    if (w && !/^https:\/\//i.test(w)) throw new Error("webhook URL must start with https://");
    a.webhookUrl = w;
  }
  if (input.notifyOn !== undefined) a.notifyOn = ["always", "change", "error", "never"].includes(input.notifyOn) ? input.notifyOn : "always";
  if (input.siteId !== undefined) a.siteId = input.siteId ? str(input.siteId, 40).replace(/[^a-z0-9-]/gi, "") : "";
  if (input.apiKey !== undefined && input.apiKey !== "__keep__") a.apiKey = str(input.apiKey, 200).trim();
  if (input.mcpServers !== undefined) {
    a.mcpServers = (Array.isArray(input.mcpServers) ? input.mcpServers : []).slice(0, 10).map((s) => ({
      name: str(s.name, 60),
      endpoint: str(s.endpoint, 1000),
      authToken: str(s.authToken, 500),
      tools: (s.tools || []).slice(0, 40).map((t) => ({ name: str(t.name, 80), description: str(t.description, 200) })),
    }));
  }
  a.name ||= "Untitled automation";
  a.model ||= DEFAULT_MODEL;
  a.mode ||= "agent";
  a.maxSteps ||= 8;
  a.notifyOn ||= "always";
  a.schedule ||= { type: "interval", minutes: 60 };
  if (a.enabled === undefined) a.enabled = true;
  if (!a.task) throw new Error("task is required");
  return a;
}

/** Strip secrets before sending to the browser. */
export function publicAutomation(a) {
  if (!a) return a;
  const { apiKey, mcpServers, ...rest } = a;
  return {
    ...rest,
    hasOwnKey: !!apiKey,
    mcpServers: (mcpServers || []).map((s) => ({ name: s.name, endpoint: s.endpoint, tools: s.tools, hasToken: !!s.authToken })),
    running: g.running.has(a.id),
  };
}

export async function listAutomations() {
  const data = await readCollection(AUTOS);
  return Object.values(data).sort((x, y) => y.createdAt - x.createdAt);
}

export async function getAutomation(id) {
  return (await readCollection(AUTOS))[id] || null;
}

export async function createAutomation(input) {
  const a = sanitizeAutomation(input);
  const now = Date.now();
  a.id = newId("au_");
  a.createdAt = now;
  a.updatedAt = now;
  a.nextRunAt = a.enabled ? nextRun(a.schedule, now) : null;
  a.runCount = 0;
  a.failCount = 0;
  await updateCollection(AUTOS, (d) => {
    if (Object.keys(d).length >= MAX_AUTOMATIONS) throw new Error(`limit of ${MAX_AUTOMATIONS} automations reached`);
    d[a.id] = a;
  });
  return a;
}

export async function updateAutomation(id, input) {
  let out = null;
  await updateCollection(AUTOS, (d) => {
    if (!d[id]) throw Object.assign(new Error("automation not found"), { status: 404 });
    const next = sanitizeAutomation(input, d[id]);
    const now = Date.now();
    next.updatedAt = now;
    if (input.schedule !== undefined || input.enabled !== undefined) {
      next.nextRunAt = next.enabled ? nextRun(next.schedule, now) : null;
    }
    d[id] = next;
    out = next;
  });
  return out;
}

export async function deleteAutomation(id) {
  g.running.get(id)?.abort();
  await updateCollection(AUTOS, (d) => {
    delete d[id];
  });
  await updateCollection(RUNS, (d) => {
    delete d[id];
  });
}

export async function listRuns(id) {
  return ((await readCollection(RUNS))[id] || []).slice().reverse();
}

/* ---------------- execution ---------------- */

async function notify(url, payload) {
  const text = `**${payload.name}** — ${payload.status === "done" ? "✅ done" : "⚠️ " + payload.status}\n\n${payload.text}`.slice(0, 1900);
  try {
    await safeFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `content` = Discord, `text` = Slack/Teams/ntfy-style; extra fields for custom receivers.
      body: JSON.stringify({ content: text, text, automation: payload }),
      timeoutMs: 10000,
      maxBytes: 10_000,
    });
    return true;
  } catch (e) {
    console.warn("[automations] webhook failed:", e.message);
    return false;
  }
}

/**
 * Run one automation now. Resolves with the stored run record.
 * @param {string} id
 * @param {{trigger?: "schedule"|"manual"|"cron"}} [opts]
 */
export async function runAutomation(id, { trigger = "manual" } = {}) {
  const a = await getAutomation(id);
  if (!a) throw Object.assign(new Error("automation not found"), { status: 404 });
  if (g.running.has(id)) throw Object.assign(new Error("this automation is already running"), { status: 409 });

  const key = a.apiKey || serverKey();
  const controller = new AbortController();
  g.running.set(id, controller);
  const timeout = setTimeout(() => controller.abort(), Number(process.env.FORGENITE_AUTOMATION_TIMEOUT_MS || 10 * 60_000));
  const run = { id: newId("run_"), automationId: id, trigger, startedAt: Date.now(), status: "running", steps: [], files: [], final: "", error: "" };

  try {
    if (!key) throw new Error("No NVIDIA API key on the server. Set NVIDIA_API_KEY (or add a key to this automation) so it can run 24/7.");

    const previous = (await readCollection(RUNS))[id]?.slice(-1)[0];
    const context =
      `Current date/time: ${new Date().toISOString()} (server time). This task runs automatically on a schedule (${trigger}).` +
      (previous?.final ? `\n\nResult of the previous run (for comparison / to avoid repeating yourself):\n${previous.final.slice(0, 1500)}` : "");

    const callModel = (messages) =>
      nimChatText(key, { model: a.model, messages, temperature: 0.3, max_tokens: 4096, signal: controller.signal });

    if (a.mode === "prompt") {
      const out = await callModel([
        { role: "system", content: "You are Forgenite, running as a scheduled automation. Answer the task directly and concisely in Markdown." },
        { role: "user", content: `${a.task}\n\n${context}` },
      ]);
      run.final = out.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      run.status = "done";
    } else {
      const tools = ["web_search", "open_url", "run_javascript", "write_file", "append_file", "read_file", "list_files", "delete_file"];
      if (a.webhookUrl) tools.push("notify");
      if ((a.mcpServers || []).length) tools.push("mcp_call");
      const executeTool = async (tool, input) => {
        if (tool === "notify") {
          if (!a.webhookUrl) return { ok: false, error: "no webhook configured" };
          const ok = await notify(a.webhookUrl, { name: a.name, status: "info", text: String(input.message || "").slice(0, 1500) });
          return ok ? { ok: true, result: "Notification sent." } : { ok: false, error: "webhook request failed" };
        }
        if (tool === "mcp_call") {
          const s = (a.mcpServers || []).find((x) => x.name === input.server);
          if (!s) return { ok: false, error: `MCP server "${input.server}" is not configured for this automation.` };
          try {
            return { ok: true, result: await mcpCallTool(s.endpoint, s.authToken, input.tool, input.arguments) };
          } catch (e) {
            return { ok: false, error: e.message };
          }
        }
        return executeServerTool(tool, input);
      };
      let initialFiles = [];
      if (a.siteId) {
        const { getSite } = await import("./sites.js");
        const site = await getSite(a.siteId);
        if (site) initialFiles = site.files;
      }
      const res = await runAgentLoop({
        task: a.task,
        context,
        tools,
        files: initialFiles,
        maxSteps: a.maxSteps,
        signal: controller.signal,
        systemPrompt: buildAgentPrompt({
          tools,
          mcpServers: a.mcpServers || [],
          extra:
            "You are running UNATTENDED as a scheduled automation — nobody can answer questions. Be efficient." +
            (a.siteId
              ? "\nThe project files above are a LIVE PUBLISHED WEBSITE. Any files you write are published automatically when you finish. Keep index.html as the entry page."
              : ""),
        }),
        callModel,
        executeTool,
      });
      Object.assign(run, {
        status: res.status,
        final: res.final,
        error: res.error,
        steps: res.steps.map((s) => ({ ...s, observation: String(s.observation || "").slice(0, 1500), input: trimInput(s.input) })),
        files: res.files.map((f) => ({ path: f.path, content: f.content.slice(0, 200_000) })),
      });
      if (a.siteId && res.status === "done" && res.files.length) {
        await publishFiles(a.siteId, res.files, { name: a.name });
        run.published = a.siteId;
      }
    }
  } catch (e) {
    run.status = controller.signal.aborted ? "stopped" : "error";
    run.error = controller.signal.aborted ? "Run was stopped (timeout or deleted)." : e.message || String(e);
  } finally {
    clearTimeout(timeout);
    g.running.delete(id);
  }

  run.finishedAt = Date.now();
  run.durationMs = run.finishedAt - run.startedAt;

  // Notifications
  const prevFinal = (await readCollection(RUNS))[id]?.slice(-1)[0]?.final || "";
  if (a.webhookUrl && a.notifyOn !== "never") {
    const failed = run.status !== "done";
    const changed = run.final.trim() !== prevFinal.trim();
    if (a.notifyOn === "always" || (a.notifyOn === "error" && failed) || (a.notifyOn === "change" && (changed || failed))) {
      run.notified = await notify(a.webhookUrl, { name: a.name, status: run.status, text: failed ? run.error : run.final });
    }
  }

  await updateCollection(RUNS, (d) => {
    d[id] = [...(d[id] || []), run].slice(-MAX_RUNS_PER_AUTOMATION);
  });
  await updateCollection(AUTOS, (d) => {
    const cur = d[id];
    if (!cur) return;
    cur.lastRunAt = run.startedAt;
    cur.lastStatus = run.status;
    cur.lastSummary = (run.status === "done" ? run.final : run.error).slice(0, 300);
    cur.runCount = (cur.runCount || 0) + 1;
    cur.failCount = run.status === "done" ? 0 : (cur.failCount || 0) + 1;
    // Auto-pause after 5 consecutive failures so a broken job doesn't burn quota forever.
    if (cur.failCount >= 5 && cur.enabled) {
      cur.enabled = false;
      cur.pausedReason = "Paused automatically after 5 consecutive failures.";
    }
    cur.nextRunAt = cur.enabled ? nextRun(cur.schedule, Date.now()) : null;
  });
  return run;
}

function trimInput(input) {
  const out = {};
  for (const [k, v] of Object.entries(input || {})) out[k] = typeof v === "string" && v.length > 600 ? v.slice(0, 600) + "…" : v;
  return out;
}

export function stopAutomation(id) {
  const c = g.running.get(id);
  if (c) c.abort();
  return !!c;
}

/* ---------------- scheduler ---------------- */

/** Run every due automation (respecting concurrency). Safe to call often. */
export async function tick(trigger = "schedule") {
  if (g.ticking) return { started: [] };
  g.ticking = true;
  g.lastTick = Date.now();
  const started = [];
  try {
    const now = Date.now();
    const due = (await listAutomations())
      .filter((a) => a.enabled && a.nextRunAt && a.nextRunAt <= now && !g.running.has(a.id))
      .sort((x, y) => x.nextRunAt - y.nextRunAt);
    for (const a of due) {
      if (g.running.size >= CONCURRENCY) break;
      started.push(a.id);
      // Fire-and-forget; runAutomation persists its own results.
      runAutomation(a.id, { trigger }).catch((e) => console.error(`[automations] ${a.id} failed:`, e.message));
    }
  } finally {
    g.ticking = false;
  }
  return { started };
}

export function startScheduler() {
  if (g.started || process.env.FORGENITE_SCHEDULER === "off") return false;
  g.started = true;
  const every = Math.max(5, Number(process.env.FORGENITE_TICK_SECONDS || 20)) * 1000;
  g.timer = setInterval(() => tick().catch((e) => console.error("[automations] tick error:", e)), every);
  g.timer.unref?.();
  setTimeout(() => tick().catch(() => {}), 3000).unref?.();
  console.log(`[automations] scheduler started (tick every ${every / 1000}s, concurrency ${CONCURRENCY})`);
  return true;
}

export function schedulerStatus() {
  return {
    started: g.started,
    lastTick: g.lastTick || null,
    running: [...g.running.keys()],
    concurrency: CONCURRENCY,
    hasServerKey: !!serverKey(),
    ephemeralStorage: EPHEMERAL,
  };
}

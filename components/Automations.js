"use client";

import { useCallback, useEffect, useState } from "react";
import Markdown from "./Markdown";
import { describeSchedule } from "@/lib/schedule";
import { shortName } from "@/lib/models";
import { getSavedServers } from "@/lib/mcp";

const PRESETS = [
  {
    icon: "📰",
    name: "Daily AI news briefing",
    task: "Search the web for the most important AI and tech news from the last 24 hours. Open the 3 best sources, then write a concise briefing (5-7 bullet points with links).",
    schedule: { type: "daily", time: "08:00" },
  },
  {
    icon: "📈",
    name: "Crypto price watcher",
    task: "Fetch the current BTC and ETH prices in USD from https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true and report the prices and 24h change. Compare with the previous run if available.",
    schedule: { type: "interval", minutes: 60 },
    notifyOn: "change",
  },
  {
    icon: "🌐",
    name: "Website uptime monitor",
    task: "Open https://example.com and check that it loads and contains the text 'Example Domain'. Report UP or DOWN with the HTTP status. Keep the answer to one line.",
    schedule: { type: "interval", minutes: 15 },
    notifyOn: "change",
    mode: "agent",
  },
  {
    icon: "🛠",
    name: "Auto-updating website",
    task: "Update the published website: rewrite index.html so it shows today's date and a fresh, interesting 'Fact of the day' (research one with web_search). Keep the existing design and other files.",
    schedule: { type: "daily", time: "07:00" },
    needsSite: true,
  },
  {
    icon: "🧠",
    name: "Weekly learning digest",
    task: "Pick one interesting computer-science concept, explain it simply with a short JavaScript example you verified with run_javascript, and suggest one exercise.",
    schedule: { type: "weekly", time: "09:00", days: [1] },
    mode: "agent",
  },
];

const EMPTY = { name: "", task: "", mode: "agent", schedule: { type: "interval", minutes: 60 }, maxSteps: 8, webhookUrl: "", notifyOn: "always", siteId: "", enabled: true, apiKey: "", useMcp: false };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fmt = (t) => (t ? new Date(t).toLocaleString() : "—");
const rel = (t) => {
  if (!t) return "—";
  const d = t - Date.now();
  const a = Math.abs(d);
  const s = a < 60e3 ? `${Math.round(a / 1e3)}s` : a < 3600e3 ? `${Math.round(a / 60e3)}m` : a < 86400e3 ? `${Math.round(a / 3600e3)}h` : `${Math.round(a / 86400e3)}d`;
  return d > 0 ? `in ${s}` : `${s} ago`;
};

export default function Automations({ model, settings }) {
  const [items, setItems] = useState([]);
  const [sched, setSched] = useState(null);
  const [sites, setSites] = useState([]);
  const [edit, setEdit] = useState(null); // null | {…form, id?}
  const [openId, setOpenId] = useState(null);
  const [runs, setRuns] = useState([]);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/automations");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "failed to load");
      setItems(j.automations);
      setSched(j.scheduler);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  const loadRuns = useCallback(async (id) => {
    const r = await fetch(`/api/automations/${id}`);
    if (r.ok) setRuns((await r.json()).runs);
  }, []);

  useEffect(() => {
    load();
    fetch("/api/sites").then((r) => r.json()).then((j) => setSites(j.sites || [])).catch(() => {});
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!openId) return;
    loadRuns(openId);
    const t = setInterval(() => loadRuns(openId), 4000);
    return () => clearInterval(t);
  }, [openId, loadRuns]);

  const save = async () => {
    setErr("");
    const tz = -new Date().getTimezoneOffset();
    const body = {
      name: edit.name,
      task: edit.task,
      mode: edit.mode,
      model: edit.model || model,
      schedule: edit.schedule.type === "interval" || edit.schedule.type === "manual" ? edit.schedule : { ...edit.schedule, tzOffsetMinutes: tz },
      maxSteps: edit.maxSteps,
      webhookUrl: edit.webhookUrl,
      notifyOn: edit.notifyOn,
      siteId: edit.siteId,
      enabled: edit.enabled,
      mcpServers: edit.useMcp ? getSavedServers() : [],
    };
    if (edit.apiKey) body.apiKey = edit.apiKey;
    else if (!edit.id && settings.apiKey && !sched?.hasServerKey) body.apiKey = settings.apiKey;
    const r = await fetch(edit.id ? `/api/automations/${edit.id}` : "/api/automations", {
      method: edit.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) return setErr(j.error || "Save failed");
    setEdit(null);
    load();
  };

  const act = async (id, path, method = "POST") => {
    setBusyId(id);
    setErr("");
    const r = await fetch(`/api/automations/${id}${path}`, { method });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setErr(j.error || "Request failed");
    setBusyId(null);
    load();
    if (openId === id) setTimeout(() => loadRuns(id), 400);
  };

  const toggle = async (a) => {
    await fetch(`/api/automations/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !a.enabled }) });
    load();
  };

  const startEdit = (a) =>
    setEdit(
      a
        ? { ...EMPTY, ...a, apiKey: "", useMcp: (a.mcpServers || []).length > 0, schedule: a.schedule }
        : { ...EMPTY, model }
    );

  const s = edit?.schedule;
  const setS = (patch) => setEdit((e) => ({ ...e, schedule: { ...e.schedule, ...patch } }));

  return (
    <div className="auto">
      <div className="auto-head">
        <div>
          <h1>⏰ Automations</h1>
          <p className="empty-sub">
            Tasks that run by themselves, 24/7, on the server — even when this tab is closed. Each run uses the full agent (web search, browsing, code, files) and can post results to Discord/Slack or update a published website.
          </p>
        </div>
        <button className="primary-btn" onClick={() => startEdit(null)}>＋ New automation</button>
      </div>

      <div className="auto-status">
        <span className={"dot " + (sched?.started ? "ok" : "bad")} />
        {sched?.started ? (
          <>Scheduler running · last check {rel(sched.lastTick)} · {sched.running.length} running now</>
        ) : (
          <>Scheduler not running on this host — use an external cron hitting <code className="inline-code">/api/cron?secret=…</code> (see README).</>
        )}
        {sched?.ephemeralStorage && <span className="badge badge-warn">serverless host: storage is temporary — use a VPS/Docker/Railway for real 24/7 (see README)</span>}
        {sched && !sched.hasServerKey && <span className="badge badge-warn">no NVIDIA_API_KEY on server — automations will use your browser key</span>}
      </div>

      {err && <div className="banner error">⚠️ {err}</div>}

      {items.length === 0 && (
        <div className="auto-presets">
          <div className="side-label">Start with a preset</div>
          <div className="tpl-grid">
            {PRESETS.map((p) => (
              <button key={p.name} className="tpl" onClick={() => setEdit({ ...EMPTY, model, ...p, siteId: p.needsSite ? sites[0]?.id || "" : "" })}>
                <span className="tpl-icon">{p.icon}</span>
                <b>{p.name}</b>
                <span className="muted">{describeSchedule(p.schedule)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="auto-list">
        {items.map((a) => (
          <div key={a.id} className={"auto-card" + (a.enabled ? "" : " paused")}>
            <div className="auto-card-top">
              <label className="switch" title={a.enabled ? "Enabled" : "Paused"}>
                <input type="checkbox" checked={a.enabled} onChange={() => toggle(a)} />
                <span />
              </label>
              <div className="auto-card-main" onClick={() => setOpenId(openId === a.id ? null : a.id)}>
                <div className="auto-name">
                  {a.name}
                  {a.running && <span className="badge badge-live">running…</span>}
                  {!a.running && a.lastStatus && <span className={"badge " + (a.lastStatus === "done" ? "badge-live" : "badge-warn")}>{a.lastStatus}</span>}
                </div>
                <div className="auto-meta">
                  {describeSchedule(a.schedule)} · next {a.enabled ? rel(a.nextRunAt) : "paused"} · {a.runCount || 0} runs · <span className="mono">{shortName(a.model)}</span>
                  {a.siteId && <> · 🌍 updates <a href={`/s/${a.siteId}/`} target="_blank" rel="noreferrer">/s/{a.siteId}</a></>}
                  {a.webhookUrl && <> · 🔔 {a.notifyOn}</>}
                </div>
                {a.pausedReason && !a.enabled && <div className="auto-warn">{a.pausedReason}</div>}
                {a.lastSummary && <div className="auto-summary">{a.lastSummary}</div>}
              </div>
              <div className="auto-actions">
                {a.running ? (
                  <button className="ghost-btn btn-sm" onClick={() => act(a.id, "/stop")}>■ Stop</button>
                ) : (
                  <button className="ghost-btn btn-sm" disabled={busyId === a.id} onClick={() => act(a.id, "/run")}>▶ Run now</button>
                )}
                <button className="ghost-btn btn-sm" onClick={() => startEdit(a)}>Edit</button>
                <button className="ghost-btn btn-sm" onClick={() => window.confirm(`Delete "${a.name}"?`) && act(a.id, "", "DELETE")}>Delete</button>
              </div>
            </div>
            {openId === a.id && (
              <div className="auto-runs">
                <div className="side-label">Run history</div>
                {runs.length === 0 && <div className="muted-li">No runs yet — click “Run now”.</div>}
                {runs.map((r) => (
                  <details key={r.id} className="auto-run">
                    <summary>
                      <span className={"adot"} data-ok={r.status === "done" ? "good" : "bad"} /> {fmt(r.startedAt)} · {r.trigger} · {Math.round((r.durationMs || 0) / 1000)}s · {r.steps?.length || 0} steps
                      {r.files?.length ? ` · ${r.files.length} files` : ""}
                      {r.published ? " · 🌍 published" : ""}
                      {r.notified ? " · 🔔 sent" : ""}
                    </summary>
                    <div className="auto-run-body">
                      {r.error && <div className="msg-error">⚠️ {r.error}</div>}
                      {r.final && <Markdown text={r.final} />}
                      {r.steps?.length > 0 && (
                        <details>
                          <summary className="muted">Steps</summary>
                          {r.steps.map((st, i) => (
                            <div key={i} className="auto-step">
                              <b>{i + 1}. {st.tool}</b> {st.thought && <span className="muted">— {st.thought}</span>}
                              <pre>{String(st.observation || "").slice(0, 800)}</pre>
                            </div>
                          ))}
                        </details>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {edit && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setEdit(null)}>
          <div className="modal wide">
            <div className="modal-head">
              <h2>{edit.id ? "Edit automation" : "New automation"}</h2>
              <button className="icon-btn" onClick={() => setEdit(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Name</label>
                <input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Daily briefing" />
              </div>
              <div className="field">
                <label>Task — what should the AI do each time?</label>
                <textarea rows={4} value={edit.task} onChange={(e) => setEdit({ ...edit, task: e.target.value })} placeholder="Search for … and summarise …" />
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Mode</label>
                  <select value={edit.mode} onChange={(e) => setEdit({ ...edit, mode: e.target.value })}>
                    <option value="agent">🤖 Agent (tools: search, browse, code, files)</option>
                    <option value="prompt">💬 Simple prompt (one answer, cheapest)</option>
                  </select>
                </div>
                <div className="field">
                  <label>Model</label>
                  <input className="input mono" value={edit.model || model} onChange={(e) => setEdit({ ...edit, model: e.target.value })} />
                </div>
              </div>

              <div className="field">
                <label>Schedule</label>
                <div className="sched-row">
                  <select value={s.type} onChange={(e) => setEdit({ ...edit, schedule: e.target.value === "interval" ? { type: "interval", minutes: 60 } : e.target.value === "daily" ? { type: "daily", time: "08:00" } : e.target.value === "weekly" ? { type: "weekly", time: "09:00", days: [1] } : e.target.value === "cron" ? { type: "cron", expr: "0 */6 * * *" } : { type: "manual" } })}>
                    <option value="interval">Every N minutes</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="cron">Cron expression</option>
                    <option value="manual">Manual only</option>
                  </select>
                  {s.type === "interval" && (
                    <>
                      <input className="input sm" type="number" min={1} value={s.minutes} onChange={(e) => setS({ minutes: Number(e.target.value) })} /> minutes
                    </>
                  )}
                  {(s.type === "daily" || s.type === "weekly") && <input className="input sm" type="time" value={s.time} onChange={(e) => setS({ time: e.target.value })} />}
                  {s.type === "cron" && <input className="input mono" value={s.expr} onChange={(e) => setS({ expr: e.target.value })} placeholder="min hour dom mon dow" />}
                </div>
                {s.type === "weekly" && (
                  <div className="days">
                    {DAYS.map((d, i) => (
                      <button key={d} className={"day" + (s.days.includes(i) ? " on" : "")} onClick={() => setS({ days: s.days.includes(i) ? s.days.filter((x) => x !== i) : [...s.days, i] })}>{d}</button>
                    ))}
                  </div>
                )}
                <p className="hint-line">{describeSchedule(s)} (your local time)</p>
              </div>

              <div className="field-row">
                <div className="field">
                  <label>Webhook (Discord / Slack / any https URL)</label>
                  <input className="input" value={edit.webhookUrl} onChange={(e) => setEdit({ ...edit, webhookUrl: e.target.value })} placeholder="https://discord.com/api/webhooks/…" />
                </div>
                <div className="field">
                  <label>Notify</label>
                  <select value={edit.notifyOn} onChange={(e) => setEdit({ ...edit, notifyOn: e.target.value })}>
                    <option value="always">Every run</option>
                    <option value="change">Only when the result changes</option>
                    <option value="error">Only on errors</option>
                    <option value="never">Never</option>
                  </select>
                </div>
              </div>

              <div className="field-row">
                <div className="field">
                  <label>Update a published website (optional)</label>
                  <select value={edit.siteId} onChange={(e) => setEdit({ ...edit, siteId: e.target.value })}>
                    <option value="">— none —</option>
                    {sites.map((st) => (
                      <option key={st.id} value={st.id}>{st.name} (/s/{st.id})</option>
                    ))}
                  </select>
                  <p className="hint-line">Publish a project from the Builder first. The agent edits its files and republishes automatically.</p>
                </div>
                <div className="field">
                  <label>Max agent steps: <strong>{edit.maxSteps}</strong></label>
                  <input type="range" min={1} max={30} value={edit.maxSteps} onChange={(e) => setEdit({ ...edit, maxSteps: Number(e.target.value) })} />
                </div>
              </div>

              <div className="field-row">
                <div className="field">
                  <label>NVIDIA key for this automation (optional)</label>
                  <input className="input" type="password" value={edit.apiKey} onChange={(e) => setEdit({ ...edit, apiKey: e.target.value })} placeholder={edit.hasOwnKey ? "•••• saved — leave blank to keep" : sched?.hasServerKey ? "uses server NVIDIA_API_KEY" : "uses your Settings key"} />
                </div>
                <div className="field">
                  <label className="check">
                    <input type="checkbox" checked={edit.useMcp} onChange={(e) => setEdit({ ...edit, useMcp: e.target.checked })} /> Give it my MCP servers ({getSavedServers().length})
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={edit.enabled} onChange={(e) => setEdit({ ...edit, enabled: e.target.checked })} /> Enabled
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="ghost-btn" onClick={() => setEdit(null)}>Cancel</button>
              <button className="primary-btn" onClick={save} disabled={!edit.task.trim()}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

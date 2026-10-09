"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import AgentRun from "./AgentRun";
import { TEMPLATES, BUILDER_IDEAS } from "@/lib/templates";
import { loadProjects, saveProjects, newProject, withSnapshot } from "@/lib/projects";
import { buildPreviewHtml, pickEntry } from "@/lib/preview";
import { downloadAsZip, downloadFile } from "@/lib/fileUtils";
import { BASE_TOOLS, buildAgentPrompt, callChat, executeTool, runAgentLoop, sanitizePath } from "@/lib/agent";
import { getSavedGitHubToken, pushFiles } from "@/lib/github";
import { getSavedServers } from "@/lib/mcp";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <div className="wb-editor-loading">Loading editor…</div>,
});

const LANG = { js: "javascript", mjs: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript", html: "html", htm: "html", css: "css", json: "json", md: "markdown", svg: "xml", xml: "xml", py: "python", txt: "plaintext" };
const langOf = (p) => LANG[p.split(".").pop().toLowerCase()] || "plaintext";
const iconOf = (p) => (/\.html?$/i.test(p) ? "📄" : /\.css$/i.test(p) ? "🎨" : /\.m?jsx?$/i.test(p) ? "⚡" : /\.json$/i.test(p) ? "🧩" : /\.svg$/i.test(p) ? "🖼️" : /\.md$/i.test(p) ? "📝" : "📃");
const DEVICES = { desktop: "100%", tablet: "768px", mobile: "390px" };

const BUILDER_EXTRA = `You are the AI inside the Forgenite Web Builder, editing the user's website project.
- The project's current files are listed in the task. ALWAYS read_file before changing an existing file, then write_file the COMPLETE new content (never partial snippets or "..." placeholders).
- Plain HTML/CSS/JavaScript only (no build step, no npm). You may load libraries from https CDNs (e.g. jsdelivr, unpkg, cdnjs) with <script src="https://..."> or ES module imports.
- index.html is the entry page. Link local files with relative paths (style.css, script.js, about.html).
- Make it responsive, accessible and visually polished. Use realistic content, not lorem ipsum.
- Use "actions" to write several files in one turn. Finish with a short "final" summary of what you changed.`;

function useDebounced(fn, ms) {
  const t = useRef(null);
  return useCallback((...a) => {
    clearTimeout(t.current);
    t.current = setTimeout(() => fn(...a), ms);
  }, [fn, ms]);
}

export default function WebBuilder({ settings, model, onNeedGitHub, importRequest, onImportHandled, onMarkFailed }) {
  const [projects, setProjects] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [entry, setEntry] = useState(null);
  const [device, setDevice] = useState("desktop");
  const [previewHtml, setPreviewHtml] = useState("");
  const [consoleLines, setConsoleLines] = useState([]);
  const [showConsole, setShowConsole] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showPush, setShowPush] = useState(false);
  const [layout, setLayout] = useState("split"); // split | code | preview
  const [pushForm, setPushForm] = useState({ owner: "", repo: "", branch: "main", message: "Update site from Forgenite" });
  const abortRef = useRef(null);
  const loaded = useRef(false);

  const project = useMemo(() => projects.find((p) => p.id === activeId) || null, [projects, activeId]);
  const files = project?.files || [];
  const current = files.find((f) => f.path === selected) || null;

  /* ---------- load / persist ---------- */
  useEffect(() => {
    let ps = loadProjects();
    if (!ps.length) ps = [newProject("My first site", TEMPLATES.find((t) => t.id === "landing").files)];
    setProjects(ps);
    setActiveId(ps[0].id);
    loaded.current = true;
  }, []);

  const persist = useDebounced((ps) => {
    if (!saveProjects(ps)) setToast("⚠️ Browser storage is full — download your project as ZIP to keep it safe.");
  }, 500);
  useEffect(() => {
    if (loaded.current) persist(projects);
  }, [projects, persist]);

  const patchProject = useCallback((id, fn) => {
    setProjects((ps) => ps.map((p) => (p.id === id ? { ...fn(p), updatedAt: Date.now() } : p)));
  }, []);

  // Select a file + entry whenever the project changes.
  useEffect(() => {
    if (!project) return;
    if (!project.files.some((f) => f.path === selected)) {
      setSelected(pickEntry(project.files) || project.files[0]?.path || null);
    }
    if (!project.files.some((f) => f.path === entry)) setEntry(pickEntry(project.files));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, project?.files]);

  /* ---------- import from agent / chat ---------- */
  useEffect(() => {
    if (!importRequest || !loaded.current) return;
    const p = newProject(importRequest.name || "Imported project", importRequest.files.map((f) => ({ path: sanitizePath(f.path), content: f.content })));
    setProjects((ps) => [p, ...ps]);
    setActiveId(p.id);
    setToast(`📥 Imported ${importRequest.files.length} file(s) from the agent.`);
    onImportHandled?.();
  }, [importRequest, onImportHandled]);

  /* ---------- live preview ---------- */
  const rebuild = useDebounced((fs, e) => setPreviewHtml(buildPreviewHtml(fs, e)), 350);
  useEffect(() => {
    rebuild(files, entry);
  }, [files, entry, rebuild]);

  useEffect(() => {
    const onMsg = (e) => {
      const d = e.data;
      if (!d || d.__forgenite !== 1) return;
      if (d.type === "console") setConsoleLines((l) => [...l.slice(-199), { level: d.args[0], text: d.args.slice(1).join(" "), at: Date.now() }]);
      if (d.type === "navigate") {
        const target = String(d.args[0] || "").split(/[?#]/)[0].replace(/^\.?\//, "");
        if (files.some((f) => f.path === target)) setEntry(target);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [files]);

  useEffect(() => setConsoleLines([]), [previewHtml]);
  const errorCount = consoleLines.filter((l) => l.level === "error").length;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  /* ---------- file ops ---------- */
  const updateFile = (path, content) => patchProject(activeId, (p) => ({ ...p, files: p.files.map((f) => (f.path === path ? { ...f, content } : f)) }));

  const addFile = () => {
    const name = window.prompt("New file name (e.g. about.html, styles/theme.css):", "new.html");
    if (!name) return;
    const path = sanitizePath(name);
    if (files.some((f) => f.path === path)) return setToast("A file with that name already exists.");
    const starter = /\.html?$/i.test(path)
      ? `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1" />\n  <title>${path}</title>\n  <link rel="stylesheet" href="style.css" />\n</head>\n<body>\n  <h1>${path}</h1>\n</body>\n</html>\n`
      : "";
    patchProject(activeId, (p) => ({ ...p, files: [...p.files, { path, content: starter }] }));
    setSelected(path);
  };

  const renameFile = (path) => {
    const name = window.prompt("Rename file:", path);
    if (!name || name === path) return;
    const np = sanitizePath(name);
    if (files.some((f) => f.path === np)) return setToast("A file with that name already exists.");
    patchProject(activeId, (p) => ({ ...p, files: p.files.map((f) => (f.path === path ? { ...f, path: np } : f)) }));
    setSelected(np);
  };

  const deleteFile = (path) => {
    if (!window.confirm(`Delete ${path}?`)) return;
    patchProject(activeId, (p) => ({ ...withSnapshot(p, `delete ${path}`), files: p.files.filter((f) => f.path !== path) }));
  };

  const uploadFiles = async (e) => {
    const list = [...(e.target.files || [])].slice(0, 50);
    const read = await Promise.all(list.map(async (f) => ({ path: sanitizePath(f.webkitRelativePath || f.name), content: await f.text() })));
    patchProject(activeId, (p) => {
      const map = new Map(p.files.map((f) => [f.path, f]));
      read.forEach((f) => map.set(f.path, f));
      return { ...p, files: [...map.values()] };
    });
    setToast(`Added ${read.length} file(s).`);
    e.target.value = "";
  };

  /* ---------- projects ---------- */
  const createFromTemplate = (t) => {
    const p = newProject(t.id === "blank" ? "Untitled project" : t.name, t.files);
    setProjects((ps) => [p, ...ps]);
    setActiveId(p.id);
    setShowNew(false);
  };

  const createFromIdea = (idea) => {
    const p = newProject(idea.slice(0, 40), []);
    setProjects((ps) => [p, ...ps]);
    setActiveId(p.id);
    setShowNew(false);
    setTimeout(() => runAI(idea, p), 50);
  };

  const renameProject = () => {
    const n = window.prompt("Project name:", project?.name);
    if (n) patchProject(activeId, (p) => ({ ...p, name: n.slice(0, 60) }));
  };

  const deleteProject = () => {
    if (!project || !window.confirm(`Delete project "${project.name}"? This cannot be undone.`)) return;
    const rest = projects.filter((p) => p.id !== activeId);
    const next = rest.length ? rest : [newProject("Untitled project", TEMPLATES[0].files)];
    setProjects(next);
    setActiveId(next[0].id);
  };

  const undo = () => {
    const snap = project?.history?.[0];
    if (!snap) return setToast("Nothing to undo.");
    patchProject(activeId, (p) => ({ ...p, files: snap.files, history: p.history.slice(1) }));
    setToast(`↩️ Restored version before “${snap.label}”.`);
  };

  /* ---------- AI ---------- */
  const runAI = async (task, proj = project) => {
    const text = (task ?? prompt).trim();
    if (!text || busy || !proj) return;
    const pid = proj.id;
    patchProject(pid, (p) => withSnapshot(p, text.slice(0, 40)));
    setPrompt("");
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const mcpServers = getSavedServers();
    const tools = mcpServers.length ? [...BASE_TOOLS, "mcp_call"] : BASE_TOOLS;
    const r = { id: "b" + Date.now(), role: "agent", model, task: text, status: "running", phase: "thinking", steps: [], files: [], final: "", error: "" };
    setRun(r);
    const upd = (fn) => setRun((x) => (x ? fn(x) : x));
    const res = await runAgentLoop({
      task: text,
      files: proj.files,
      tools,
      maxSteps: Math.max(Number(settings.agentMaxSteps) || 8, 10),
      signal: controller.signal,
      systemPrompt: buildAgentPrompt({ tools, mcpServers, extra: BUILDER_EXTRA }),
      callModel: (messages) => callChat({ messages, model, temperature: Math.min(settings.temperature, 0.4), maxTokens: 8192, apiKey: settings.apiKey, signal: controller.signal }),
      executeTool: (tool, input, signal) => executeTool(tool, input, signal, { mcpServers }),
      onEvent: (ev) => {
        if (ev.type === "phase") upd((x) => ({ ...x, phase: ev.phase }));
        else if (ev.type === "step") upd((x) => ({ ...x, steps: [...x.steps, ev.step] }));
        else if (ev.type === "step-update") upd((x) => ({ ...x, steps: x.steps.map((s, i) => (i === ev.index ? ev.step : s)) }));
        else if (ev.type === "files") patchProject(pid, (p) => ({ ...p, files: ev.files }));
      },
    });
    patchProject(pid, (p) => ({ ...p, files: res.files }));
    upd((x) => ({ ...x, status: res.status, phase: null, final: res.final, error: res.error }));
    if (res.status === "error" && /not found for account|not available on your account|authorization failed/i.test(res.error)) onMarkFailed?.(model, res.error);
    setBusy(false);
    abortRef.current = null;
  };

  const fixErrors = () => {
    const errs = consoleLines.filter((l) => l.level === "error").map((l) => "- " + l.text).join("\n");
    runAI(`The live preview shows these JavaScript errors. Find the cause in the project files and fix them:\n${errs}`);
  };

  /* ---------- export / publish ---------- */
  const publish = async () => {
    if (!project) return;
    setBusy(true);
    try {
      const r = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: project.siteId || undefined, name: project.name, files: project.files }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Publish failed");
      patchProject(activeId, (p) => ({ ...p, siteId: j.site.id }));
      const url = `${location.origin}/s/${j.site.id}/`;
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        /* ignore */
      }
      setToast(`🌍 Published v${j.site.version} — link copied: ${url}`);
    } catch (e) {
      setToast(`⚠️ ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const doPush = async () => {
    const token = getSavedGitHubToken();
    if (!token) {
      setShowPush(false);
      return onNeedGitHub?.();
    }
    setBusy(true);
    try {
      const r = await pushFiles(pushForm.owner.trim(), pushForm.repo.trim(), pushForm.branch.trim() || "main", project.files, pushForm.message);
      setShowPush(false);
      setToast(`✅ Pushed ${project.files.length} files to ${pushForm.owner}/${pushForm.repo}@${r.branch}`);
      window.open(r.commitUrl, "_blank", "noopener");
    } catch (e) {
      setToast(`⚠️ GitHub: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const openPreviewTab = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    // Opened as about:blank and immediately sandboxed via a nested srcdoc iframe → no access to our origin.
    w.opener = null;
    w.document.write(
      `<!doctype html><title>${(project?.name || "Preview").replace(/</g, "")}</title><style>html,body,iframe{margin:0;border:0;width:100%;height:100%}</style><iframe sandbox="allow-scripts allow-forms allow-modals allow-popups"></iframe>`
    );
    w.document.querySelector("iframe").srcdoc = previewHtml;
    w.document.close();
  };

  if (!project) return <div className="wb-empty">Loading builder…</div>;
  const htmlFiles = files.filter((f) => /\.html?$/i.test(f.path));

  return (
    <div className={"wb wb-layout-" + layout}>
      {/* ---------- toolbar ---------- */}
      <div className="wb-toolbar">
        <div className="wb-tb-left">
          <select className="wb-project-select" value={activeId} onChange={(e) => setActiveId(e.target.value)} aria-label="Project">
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button className="ghost-btn btn-sm" onClick={() => setShowNew(true)} title="New project">＋ New</button>
          <button className="ghost-btn btn-sm" onClick={renameProject} title="Rename project">✏️</button>
          <button className="ghost-btn btn-sm" onClick={deleteProject} title="Delete project">🗑️</button>
          <button className="ghost-btn btn-sm" onClick={undo} disabled={!project.history?.length} title="Undo last AI change">↩️ Undo</button>
        </div>
        <div className="wb-tb-right">
          <div className="seg" role="group" aria-label="Layout">
            {["code", "split", "preview"].map((l) => (
              <button key={l} className={layout === l ? "on" : ""} onClick={() => setLayout(l)}>
                {l === "code" ? "Code" : l === "split" ? "Split" : "Preview"}
              </button>
            ))}
          </div>
          <button className="ghost-btn btn-sm" onClick={() => downloadAsZip(files, `${project.name.replace(/[^a-z0-9-_]+/gi, "-") || "site"}.zip`)}>📦 ZIP</button>
          <button className="ghost-btn btn-sm" onClick={() => setShowPush(true)}>🐙 GitHub</button>
          <button className="primary-btn btn-sm" onClick={publish} disabled={busy}>🌍 {project.siteId ? "Republish" : "Publish"}</button>
          {project.siteId && (
            <a className="ghost-btn btn-sm" href={`/s/${project.siteId}/`} target="_blank" rel="noreferrer">↗ Live</a>
          )}
        </div>
      </div>

      <div className="wb-body">
        {/* ---------- file tree ---------- */}
        <aside className="wb-files">
          <div className="wb-files-head">
            <span>Files</span>
            <span>
              <button className="icon-btn sm" title="New file" onClick={addFile}>＋</button>
              <label className="icon-btn sm" title="Upload files">
                ⤒<input type="file" multiple hidden onChange={uploadFiles} />
              </label>
            </span>
          </div>
          <ul className="file-tree">
            {files.map((f) => (
              <li key={f.path} className={selected === f.path ? "active" : ""} onClick={() => setSelected(f.path)} onDoubleClick={() => renameFile(f.path)}>
                <span className="file-icon">{iconOf(f.path)}</span>
                <span className="file-name" title={f.path}>{f.path}</span>
                <button className="file-del" title="Delete" onClick={(e) => { e.stopPropagation(); deleteFile(f.path); }}>×</button>
              </li>
            ))}
            {!files.length && <li className="muted-li">No files yet — ask the AI below ⬇</li>}
          </ul>
          {current && (
            <div className="wb-file-actions">
              <button className="ghost-btn btn-sm" onClick={() => renameFile(current.path)}>Rename</button>
              <button className="ghost-btn btn-sm" onClick={() => downloadFile(current.path, current.content)}>Download</button>
            </div>
          )}
        </aside>

        {/* ---------- editor ---------- */}
        <section className="wb-editor">
          {current ? (
            <MonacoEditor
              key={project.id + current.path}
              height="100%"
              language={langOf(current.path)}
              value={current.content}
              onChange={(v) => updateFile(current.path, v ?? "")}
              theme="vs-dark"
              options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: "on", scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2 }}
            />
          ) : (
            <div className="wb-editor-loading">Select or create a file</div>
          )}
        </section>

        {/* ---------- preview ---------- */}
        <section className="wb-preview">
          <div className="wb-preview-bar">
            <select value={entry || ""} onChange={(e) => setEntry(e.target.value)} aria-label="Page">
              {htmlFiles.map((f) => (
                <option key={f.path}>{f.path}</option>
              ))}
            </select>
            <div className="seg">
              {Object.keys(DEVICES).map((d) => (
                <button key={d} className={device === d ? "on" : ""} onClick={() => setDevice(d)} title={d}>
                  {d === "desktop" ? "🖥" : d === "tablet" ? "▭" : "📱"}
                </button>
              ))}
            </div>
            <button className="icon-btn sm" title="Reload preview" onClick={() => setPreviewHtml(buildPreviewHtml(files, entry) + " ")}>⟳</button>
            <button className="icon-btn sm" title="Open preview in new tab" onClick={openPreviewTab}>↗</button>
            <button className={"ghost-btn btn-sm" + (errorCount ? " danger" : "")} onClick={() => setShowConsole((s) => !s)}>
              Console{errorCount ? ` · ${errorCount} error${errorCount > 1 ? "s" : ""}` : consoleLines.length ? ` · ${consoleLines.length}` : ""}
            </button>
          </div>
          <div className="wb-frame-wrap">
            <iframe
              title="Live preview"
              className="wb-frame"
              style={{ width: DEVICES[device] }}
              sandbox="allow-scripts allow-forms allow-modals allow-popups"
              srcDoc={previewHtml}
            />
          </div>
          {showConsole && (
            <div className="wb-console">
              <div className="wb-console-head">
                <span>Console</span>
                <span>
                  {errorCount > 0 && (
                    <button className="primary-btn btn-sm" onClick={fixErrors} disabled={busy}>🛠 Fix with AI</button>
                  )}
                  <button className="ghost-btn btn-sm" onClick={() => setConsoleLines([])}>Clear</button>
                </span>
              </div>
              <div className="wb-console-body">
                {consoleLines.length === 0 && <div className="muted-li">No output yet.</div>}
                {consoleLines.map((l, i) => (
                  <div key={i} className={"cl cl-" + l.level}>{l.text}</div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ---------- AI bar ---------- */}
      <div className="wb-ai">
        {run && (
          <details className="wb-run" open={run.status === "running"}>
            <summary>
              🤖 {run.status === "running" ? "AI is building…" : run.status === "done" ? "Last AI change" : run.status === "error" ? "AI error" : "Stopped"} — <span className="muted">{run.task.slice(0, 80)}</span>
            </summary>
            <div className="wb-run-body">
              <AgentRun run={run} streaming={busy} onOpenFile={(f) => setSelected(f.path)} onRetry={() => runAI(run.task)} compact />
            </div>
          </details>
        )}
        <div className="comp-inner">
          <textarea
            rows={1}
            value={prompt}
            placeholder={files.length ? "Describe a change — e.g. “add a dark/light toggle and a contact form”" : "Describe the website or app to build…"}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                runAI();
              }
            }}
          />
          {busy && abortRef.current ? (
            <button className="stop-btn" onClick={() => abortRef.current?.abort()}>■ Stop</button>
          ) : (
            <button className="send-btn" onClick={() => runAI()} disabled={!prompt.trim() || busy} aria-label="Build with AI">✨</button>
          )}
        </div>
      </div>

      {toast && <div className="toast" role="status">{toast}</div>}

      {/* ---------- new project modal ---------- */}
      {showNew && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setShowNew(false)}>
          <div className="modal wide">
            <div className="modal-head"><h2>New project</h2><button className="icon-btn" onClick={() => setShowNew(false)}>✕</button></div>
            <div className="modal-body">
              <div className="side-label">Start from a template</div>
              <div className="tpl-grid">
                {TEMPLATES.map((t) => (
                  <button key={t.id} className="tpl" onClick={() => createFromTemplate(t)}>
                    <span className="tpl-icon">{t.icon}</span>
                    <b>{t.name}</b>
                    <span className="muted">{t.description}</span>
                  </button>
                ))}
              </div>
              <div className="side-label">…or let the AI build it from an idea</div>
              <div className="idea-list">
                {BUILDER_IDEAS.map((i) => (
                  <button key={i} className="idea" onClick={() => createFromIdea(i)}>✨ {i}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------- GitHub push modal ---------- */}
      {showPush && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setShowPush(false)}>
          <div className="modal">
            <div className="modal-head"><h2>🐙 Push to GitHub</h2><button className="icon-btn" onClick={() => setShowPush(false)}>✕</button></div>
            <div className="modal-body">
              {!getSavedGitHubToken() && (
                <p className="banner">Connect GitHub first. <button className="ghost-btn btn-sm" onClick={() => { setShowPush(false); onNeedGitHub?.(); }}>Connect</button></p>
              )}
              <p className="text-muted">All {files.length} files are committed in a single commit. The branch is created if needed — enable GitHub Pages on it to host the site.</p>
              <div className="field-row">
                <div className="field"><label>Owner</label><input className="input" value={pushForm.owner} onChange={(e) => setPushForm({ ...pushForm, owner: e.target.value })} placeholder="your-username" /></div>
                <div className="field"><label>Repository</label><input className="input" value={pushForm.repo} onChange={(e) => setPushForm({ ...pushForm, repo: e.target.value })} placeholder="my-site" /></div>
              </div>
              <div className="field-row">
                <div className="field"><label>Branch</label><input className="input" value={pushForm.branch} onChange={(e) => setPushForm({ ...pushForm, branch: e.target.value })} /></div>
                <div className="field"><label>Commit message</label><input className="input" value={pushForm.message} onChange={(e) => setPushForm({ ...pushForm, message: e.target.value })} /></div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="ghost-btn" onClick={() => setShowPush(false)}>Cancel</button>
              <button className="primary-btn" onClick={doPush} disabled={busy || !pushForm.owner || !pushForm.repo}>{busy ? "Pushing…" : "Push"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

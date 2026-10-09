"use client";

import Markdown from "./Markdown";
import { shortName } from "@/lib/models";

const TOOL_META = {
  web_search: { icon: "🔎", cls: "t-search" },
  open_url: { icon: "🌐", cls: "t-url" },
  run_javascript: { icon: "⚡", cls: "t-js" },
  write_file: { icon: "📄", cls: "t-file" },
  append_file: { icon: "📝", cls: "t-file" },
  read_file: { icon: "👁️", cls: "t-file" },
  list_files: { icon: "🗂️", cls: "t-file" },
  delete_file: { icon: "🗑️", cls: "t-file" },
  mcp_call: { icon: "🔌", cls: "t-url" },
  notify: { icon: "🔔", cls: "t-search" },
};

const STATUS_LABEL = {
  running: "Running",
  done: "Done",
  stopped: "Stopped",
  error: "Error",
};

function fmtChars(n) {
  return n < 1024 ? `${n} chars` : `${(n / 1024).toFixed(1)} kB`;
}

function inputSummary(tool, input) {
  const i = input || {};
  if (tool === "web_search") return `“${String(i.query ?? "")}”`;
  if (tool === "open_url") return String(i.url ?? "");
  if (tool === "run_javascript") {
    const c = String(i.code ?? "");
    return `${c.split("\n").length} line${c.split("\n").length === 1 ? "" : "s"} of JavaScript`;
  }
  if (tool === "write_file" || tool === "append_file") {
    return `${String(i.path ?? "file")} · ${fmtChars(String(i.content ?? "").length)}`;
  }
  if (tool === "read_file" || tool === "delete_file") return String(i.path ?? "");
  if (tool === "list_files") return "all files";
  if (tool === "mcp_call") return `${i.server ?? "?"} → ${i.tool ?? "?"}`;
  return JSON.stringify(i).slice(0, 120);
}

function fullInput(tool, input) {
  const i = input || {};
  if (tool === "run_javascript") return String(i.code ?? "");
  if (tool === "write_file" || tool === "append_file") return String(i.content ?? "");
  return JSON.stringify(i, null, 2);
}

export default function AgentRun({ run, onOpenFile, onOpenBuilder, onRetry, streaming, compact }) {
  const steps = run.steps || [];
  const files = run.files || [];

  const hasHtml = files.some((f) => /\.html?$/i.test(f.path));

  return (
    <div className={"msg msg-assistant" + (compact ? " compact" : "")}>
      <div className="avatar av-bot">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1.8" y="4.2" width="12.4" height="9" rx="2.6" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="5.7" cy="8.7" r="1.15" fill="currentColor" />
          <circle cx="10.3" cy="8.7" r="1.15" fill="currentColor" />
          <path
            d="M5.9 1.9v1.5M10.1 1.9v1.5M6.4 11.6h3.2"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <div className="msg-main">
        <div className="msg-head">
          <span className="msg-name">Forgenite Agent</span>
          <span className="chip">{shortName(run.model || "")}</span>
          <span className={"agent-status st-" + run.status}>
            {run.status === "running" && (
              <span className="typing">
                <i />
                <i />
                <i />
              </span>
            )}
            {STATUS_LABEL[run.status] || run.status}
          </span>
          {steps.length > 0 && (
            <span className="steps-count">
              {steps.length} step{steps.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        <div className="agent-card">
          {steps.map((s, i) => {
            const tm = TOOL_META[s.tool] || { icon: "❓", cls: "" };
            return (
              <div className={"astep" + (s.observation == null ? " live" : "")} key={i}>
                <div className="astep-head">
                  <span
                    className="adot"
                    data-ok={s.ok === false ? "bad" : s.ok ? "good" : "run"}
                  />
                  <span className="astep-n">Step {i + 1}</span>
                  <span className={"tbadge " + tm.cls}>
                    {tm.icon} {s.tool}
                  </span>
                  {s.ms ? <span className="ams">{s.ms} ms</span> : null}
                </div>

                {s.thought ? <div className="athought">💭 {s.thought}</div> : null}

                <details className="ainput">
                  <summary className="mono">{inputSummary(s.tool, s.input)}</summary>
                  <pre>{fullInput(s.tool, s.input)}</pre>
                </details>

                {s.observation != null ? (
                  <details className="aobs" open={s.ok === false}>
                    <summary>Result</summary>
                    <pre>{String(s.observation)}</pre>
                  </details>
                ) : (
                  <div className="aobs-pending">
                    <span className="typing">
                      <i />
                      <i />
                      <i />
                    </span>
                    running {s.tool}…
                  </div>
                )}
              </div>
            );
          })}

          {run.status === "running" && run.phase === "thinking" && (
            <div className="astep live">
              <div className="aobs-pending">
                <span className="typing">
                  <i />
                  <i />
                  <i />
                </span>
                thinking about the next step…
              </div>
            </div>
          )}

          {files.length > 0 && (
            <div className="afiles">
              <div className="afiles-label">
                📦 Files created — click to view, copy, download or preview
                {onOpenBuilder && hasHtml && (
                  <button type="button" className="primary-btn btn-sm afiles-open" onClick={() => onOpenBuilder(files)}>
                    🛠️ Open in Web Builder
                  </button>
                )}
              </div>
              <div className="afiles-row">
                {files.map((f) => (
                  <button
                    type="button"
                    key={f.path}
                    className="file-chip"
                    onClick={() => onOpenFile(f)}
                  >
                    <span className="fc-name">📄 {f.path}</span>
                    <span className="fsize">{fmtChars((f.content || "").length)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {run.final ? (
            <div className="msg-body afinal">
              <Markdown text={run.final} />
            </div>
          ) : null}

          {run.status === "error" && run.error ? (
            <div className="msg-body msg-error">⚠️ {run.error}</div>
          ) : null}

          {run.status === "error" && !streaming && (
            <div className="msg-actions">
              <button type="button" className="copy-btn" onClick={() => onRetry(run)}>
                Retry task
              </button>
            </div>
          )}

          {run.status === "stopped" && !run.final ? (
            <div className="astopped">⏹ Stopped by user — partial steps and files are kept above.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

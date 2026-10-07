"use client";

import { useEffect, useState } from "react";

export default function SettingsModal({ open, settings, hasServerKey, onSave, onClose }) {
  const [local, setLocal] = useState(settings);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (open) {
      setLocal(settings);
      setShowKey(false);
    }
  }, [open, settings]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const set = (patch) => setLocal((s) => ({ ...s, ...patch }));

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h2>Settings</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close settings">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label htmlFor="st-key">
              NVIDIA API key{" "}
              {hasServerKey ? (
                <span className="badge badge-live">server key configured — optional</span>
              ) : (
                <span className="badge badge-warn">not set on server</span>
              )}
            </label>
            <div className="key-row">
              <input
                id="st-key"
                type={showKey ? "text" : "password"}
                placeholder="nvapi-…"
                value={local.apiKey}
                onChange={(e) => set({ apiKey: e.target.value.trim() })}
                autoComplete="off"
                spellCheck="false"
              />
              <button type="button" className="ghost-btn" onClick={() => setShowKey((s) => !s)}>
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
            <p className="hint-line">
              Free keys at{" "}
              <a href="https://build.nvidia.com" target="_blank" rel="noreferrer noopener">
                build.nvidia.com
              </a>
              . Stored only in your browser (localStorage). For production, set{" "}
              <code className="inline-code">NVIDIA_API_KEY</code> on Vercel and leave this blank.
            </p>
          </div>

          <div className="field">
            <label htmlFor="st-sys">System prompt</label>
            <textarea
              id="st-sys"
              rows={3}
              value={local.systemPrompt}
              onChange={(e) => set({ systemPrompt: e.target.value })}
              placeholder="You are a helpful assistant…"
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="st-temp">
                Temperature: <strong>{Number(local.temperature).toFixed(1)}</strong>
              </label>
              <input
                id="st-temp"
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={local.temperature}
                onChange={(e) => set({ temperature: Number(e.target.value) })}
              />
              <p className="hint-line">Lower = focused and deterministic, higher = creative.</p>
            </div>

            <div className="field">
              <label htmlFor="st-max">Max tokens</label>
              <select
                id="st-max"
                value={local.maxTokens}
                onChange={(e) => set({ maxTokens: Number(e.target.value) })}
              >
                <option value={512}>512</option>
                <option value={1024}>1024</option>
                <option value={2048}>2048</option>
                <option value={4096}>4096</option>
              </select>
              <p className="hint-line">Upper limit on the length of each reply.</p>
            </div>
          </div>

          <div className="field">
            <label htmlFor="st-steps">
              🤖 Agent max steps: <strong>{local.agentMaxSteps}</strong>
            </label>
            <input
              id="st-steps"
              type="range"
              min="2"
              max="16"
              step="1"
              value={local.agentMaxSteps}
              onChange={(e) => set({ agentMaxSteps: Number(e.target.value) })}
            />
            <p className="hint-line">
              How many tool steps the autonomous agent may take per task (searches, code runs,
              file writes…).
            </p>
          </div>
        </div>

        <div className="modal-foot">
          <button type="button" className="ghost-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary-btn" onClick={() => onSave(local)}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

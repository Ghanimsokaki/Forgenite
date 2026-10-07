"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { shortName } from "@/lib/models";

export default function ModelPicker({
  models,
  source,
  value,
  failed = [],
  onChange,
  onRefresh,
  onClearFailed,
  loading,
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const failedSet = useMemo(() => new Set(failed || []), [failed]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return models;
    return models.filter(
      (m) =>
        m.id.toLowerCase().includes(s) ||
        (m.name || "").toLowerCase().includes(s) ||
        (m.publisher || "").toLowerCase().includes(s)
    );
  }, [models, q]);

  const failedCount = models.filter((m) => failedSet.has(m.id)).length;

  return (
    <div className="mp" ref={ref}>
      <button
        type="button"
        className="mp-btn"
        onClick={() => setOpen((o) => !o)}
        title={value}
      >
        <span className={"mp-dot" + (failedSet.has(value) ? " mp-dot-fail" : "")} />
        <span className="mp-name">{shortName(value)}</span>
        {failedSet.has(value) && <span className="mp-fail">⚠ not on your key</span>}
        <svg
          className={"mp-chev" + (open ? " up" : "")}
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="mp-panel">
          <div className="mp-search">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search models…"
            />
          </div>

          <div className="mp-meta">
            <span className={"badge" + (source === "live" ? " badge-live" : "")}>
              {source === "live"
                ? `Live · ${models.length} models on NVIDIA NIM`
                : "Preset list — add a key for the live list"}
            </span>
            <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              {failedCount > 0 && (
                <button
                  type="button"
                  className="mp-refresh"
                  title="Clear list of models marked unavailable"
                  onClick={() => onClearFailed && onClearFailed()}
                >
                  ⚠ {failedCount} unavailable · clear
                </button>
              )}
              <button type="button" className="mp-refresh" onClick={onRefresh}>
                {loading ? "Loading…" : "Refresh"}
              </button>
            </span>
          </div>

          <div className="mp-list">
            {filtered.map((m) => {
              const isFail = failedSet.has(m.id);
              return (
                <button
                  type="button"
                  key={m.id}
                  className={"mp-item" + (m.id === value ? " sel" : "")}
                  onClick={() => {
                    onChange(m.id);
                    setOpen(false);
                    setQ("");
                  }}
                >
                  <div className="mp-item-top">
                    <span className="mp-item-name">{m.name || shortName(m.id)}</span>
                    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      {isFail && <span className="mp-fail">⚠ not on your key</span>}
                      {m.id === value && (
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                          <path d="M3 8.5l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                  </div>
                  <div className="mp-item-sub">
                    <span className="chip">{m.publisher}</span>
                    {m.description ? <span className="mp-desc">{m.description}</span> : <span className="mp-desc mono">{m.id}</span>}
                  </div>
                </button>
              );
            })}
            {!filtered.length && <div className="mp-empty">No models match “{q}”.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

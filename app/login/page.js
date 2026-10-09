"use client";

import { useState } from "react";

export default function Login() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok && j.ok) window.location.href = "/";
    else setErr(j.error || "Login failed.");
  };
  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <span className="logo-big">
          <svg width="40" height="40" viewBox="0 0 64 64" aria-hidden="true">
            <path d="M37 5 L13 37 h13 L25 59 L51 25 H36 Z" fill="currentColor" />
          </svg>
        </span>
        <h1>Forgenite</h1>
        <p className="empty-sub">This workspace is password protected.</p>
        <input type="password" autoFocus placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} className="input" />
        {err && <p className="error-msg">{err}</p>}
        <button className="primary-btn" type="submit" disabled={busy || !pw}>
          {busy ? "Checking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import {
  getSavedGitHubToken,
  saveGitHubToken,
  clearGitHubToken,
  testGitHubConnection,
  getUser,
} from "@/lib/github";

export default function GitHubConnectionModal({ isOpen, onClose }) {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState(null); // null | 'testing' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState("");
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (isOpen) {
      const saved = getSavedGitHubToken();
      if (saved) {
        setToken(saved);
        checkConnection(saved);
      }
    }
  }, [isOpen]);

  const checkConnection = async (tokenToTest) => {
    setStatus("testing");
    setErrorMsg("");
    const result = await testGitHubConnection();
    if (result.ok) {
      try {
        const userData = await getUser();
        setUser(userData);
        setStatus("success");
      } catch {
        setStatus("error");
        setErrorMsg("Failed to fetch user data");
      }
    } else {
      setStatus("error");
      setErrorMsg(result.error || "Connection failed");
    }
  };

  const handleConnect = async () => {
    if (!token.trim()) {
      setErrorMsg("Please enter a token");
      return;
    }
    saveGitHubToken(token);
    await checkConnection(token);
  };

  const handleDisconnect = () => {
    clearGitHubToken();
    setToken("");
    setUser(null);
    setStatus(null);
    setErrorMsg("");
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h2>🔗 GitHub Connection</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {status === "success" && user ? (
            <div className="connection-success">
              <p className="success-msg">✅ Connected as <strong>{user.login}</strong></p>
              <p className="text-muted">You can now browse repositories, create branches, and push code.</p>
              <button type="button" className="ghost-btn" onClick={handleDisconnect}>
                Disconnect
              </button>
            </div>
          ) : (
            <>
              <p className="text-muted">
                Connect your GitHub account using a personal access token.
                <br />
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo,workflow&description=Forgenite"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                >
                  Create a token here
                </a>
                {" "}(select <code>repo</code> and <code>workflow</code> scopes).
              </p>

              <div className="form-group">
                <label htmlFor="gh-token">Personal Access Token</label>
                <input
                  id="gh-token"
                  type="password"
                  placeholder="ghp_..."
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="input"
                />
              </div>

              {status === "error" && errorMsg && (
                <p className="error-msg">❌ {errorMsg}</p>
              )}

              {status === "testing" && <p className="text-muted">Testing connection...</p>}

              <button
                type="button"
                className="primary-btn"
                onClick={handleConnect}
                disabled={status === "testing"}
              >
                {status === "testing" ? "Connecting..." : "Connect"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

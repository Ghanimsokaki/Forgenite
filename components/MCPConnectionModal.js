"use client";

import { useState, useEffect } from "react";
import {
  getSavedServers,
  saveServers,
  testMCPConnection,
  generateServerId,
  validateServerConfig,
} from "@/lib/mcp";

export default function MCPConnectionModal({ isOpen, onClose }) {
  const [servers, setServers] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newServer, setNewServer] = useState({ name: "", endpoint: "", authToken: "" });
  const [testing, setTesting] = useState(null);
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    if (isOpen) {
      setServers(getSavedServers());
    }
  }, [isOpen]);

  const handleAddServer = async () => {
    const validationErrors = validateServerConfig(newServer);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setTesting(true);
    setErrors([]);

    const result = await testMCPConnection(newServer.endpoint, newServer.authToken);
    setTesting(false);

    if (!result.ok) {
      setErrors([result.error || "Connection test failed"]);
      return;
    }

    const server = {
      id: generateServerId(),
      name: newServer.name.trim(),
      endpoint: newServer.endpoint.trim(),
      authToken: newServer.authToken.trim(),
      tools: result.tools || [],
      connectedAt: Date.now(),
    };

    const updated = [...servers, server];
    setServers(updated);
    saveServers(updated);

    setNewServer({ name: "", endpoint: "", authToken: "" });
    setShowAddForm(false);
  };

  const handleRemoveServer = (id) => {
    const updated = servers.filter((s) => s.id !== id);
    setServers(updated);
    saveServers(updated);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal mcp-modal">
        <div className="modal-head">
          <h2>🔌 MCP Connections</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <p className="text-muted">
            Connect to MCP (Model Context Protocol) servers to extend Forgenite with custom tools.
          </p>

          {servers.length > 0 && (
            <div className="server-list">
              <h3>Connected Servers</h3>
              {servers.map((server) => (
                <div key={server.id} className="server-item">
                  <div className="server-info">
                    <strong>{server.name}</strong>
                    <span className="server-endpoint">{server.endpoint}</span>
                    <span className="server-tools">{server.tools.length} tools</span>
                  </div>
                  <button
                    type="button"
                    className="ghost-btn btn-sm"
                    onClick={() => handleRemoveServer(server.id)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {showAddForm ? (
            <div className="add-server-form">
              <h3>Add MCP Server</h3>
              
              <div className="form-group">
                <label htmlFor="mcp-name">Server Name</label>
                <input
                  id="mcp-name"
                  type="text"
                  placeholder="My MCP Server"
                  value={newServer.name}
                  onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
                  className="input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="mcp-endpoint">Endpoint URL</label>
                <input
                  id="mcp-endpoint"
                  type="url"
                  placeholder="https://mcp.example.com/api"
                  value={newServer.endpoint}
                  onChange={(e) => setNewServer({ ...newServer, endpoint: e.target.value })}
                  className="input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="mcp-token">Authorization Token (optional)</label>
                <input
                  id="mcp-token"
                  type="password"
                  placeholder="Bearer token"
                  value={newServer.authToken}
                  onChange={(e) => setNewServer({ ...newServer, authToken: e.target.value })}
                  className="input"
                />
              </div>

              {errors.length > 0 && (
                <div className="error-list">
                  {errors.map((err, i) => (
                    <p key={i} className="error-msg">❌ {err}</p>
                  ))}
                </div>
              )}

              <div className="form-actions">
                <button
                  type="button"
                  className="primary-btn"
                  onClick={handleAddServer}
                  disabled={testing}
                >
                  {testing ? "Testing..." : "Test & Add Server"}
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewServer({ name: "", endpoint: "", authToken: "" });
                    setErrors([]);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="primary-btn" onClick={() => setShowAddForm(true)}>
              + Add MCP Server
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

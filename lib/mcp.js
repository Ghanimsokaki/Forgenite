/* Forgenite MCP (Model Context Protocol) Connection Manager
 *
 * Allows connecting to compatible MCP servers for extended tool capabilities.
 * Includes authentication, permission scoping, and dynamic tool discovery.
 */

const LS_MCP_SERVERS = "forgenite.mcp.servers.v1";

/**
 * Retrieve saved MCP server configurations from localStorage.
 */
export function getSavedServers() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_MCP_SERVERS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Ignore parse errors
  }
  return [];
}

/**
 * Save MCP server configurations to localStorage.
 */
export function saveServers(servers) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_MCP_SERVERS, JSON.stringify(servers.slice(0, 20)));
  } catch {
    console.error("[MCP] Failed to save server list to localStorage.");
  }
}

/**
 * Test connection to an MCP server and list its tools. Proxied through
 * /api/mcp so it works without CORS on the MCP server.
 */
export async function testMCPConnection(endpoint, authToken) {
  try {
    const res = await fetch("/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list", endpoint, authToken }),
      signal: AbortSignal.timeout(40000),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) return { ok: false, error: j?.error || `HTTP ${res.status}` };
    return { ok: true, tools: j.tools || [] };
  } catch (err) {
    return { ok: false, error: err.message || "Connection failed" };
  }
}

/**
 * Generate a unique server ID.
 */
export function generateServerId() {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

/**
 * Validate MCP server configuration.
 */
export function validateServerConfig(config) {
  const errors = [];
  
  if (!config.name || typeof config.name !== "string" || config.name.trim().length === 0) {
    errors.push("Server name is required");
  }
  
  if (!config.endpoint || typeof config.endpoint !== "string") {
    errors.push("Endpoint URL is required");
  } else {
    try {
      const url = new URL(config.endpoint);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        errors.push("Endpoint must be an HTTP(S) URL");
      }
    } catch {
      errors.push("Invalid endpoint URL");
    }
  }
  
  return errors;
}

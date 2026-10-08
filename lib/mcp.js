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
 * Test connection to an MCP server.
 * @param {string} endpoint - MCP server URL
 * @param {string} [authToken] - Optional authorization token
 * @returns {Promise<{ ok: boolean, tools?: any[], error?: string }>}
 */
export async function testMCPConnection(endpoint, authToken) {
  try {
    const headers = {
      "Content-Type": "application/json",
    };
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/list",
        id: 1,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` };
    }

    const data = await res.json();
    if (data.error) {
      return { ok: false, error: data.error.message || "Server returned an error" };
    }

    const tools = data.result?.tools || [];
    return { ok: true, tools };
  } catch (err) {
    return { ok: false, error: err.message || "Connection failed" };
  }
}

/**
 * Call an MCP tool on a remote server.
 * @param {string} endpoint - MCP server URL
 * @param {string} toolName - Name of the tool to invoke
 * @param {object} args - Tool arguments
 * @param {string} [authToken] - Optional authorization token
 * @returns {Promise<{ ok: boolean, result?: any, error?: string }>}
 */
export async function callMCPTool(endpoint, toolName, args, authToken) {
  try {
    const headers = {
      "Content-Type": "application/json",
    };
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: toolName,
          arguments: args,
        },
        id: Date.now(),
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` };
    }

    const data = await res.json();
    if (data.error) {
      return { ok: false, error: data.error.message || "Tool execution failed" };
    }

    return { ok: true, result: data.result };
  } catch (err) {
    if (err.name === "AbortError") {
      return { ok: false, error: "Tool execution timed out (30s limit)" };
    }
    return { ok: false, error: err.message || "Tool call failed" };
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
